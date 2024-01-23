/**
 * @file Implements the CANopen Process Data Object (PDO) protocol.
 * @author Wilkins White
 * @copyright 2024 Daxbot
 */

const EventEmitter = require('events');
const { Eds, EdsError } = require('../eds');
const { deprecate } = require('util');

/**
 * CANopen PDO protocol handler.
 *
 * The process data object (PDO) protocol follows a producer-consumer structure
 * where one device broadcasts data that can be consumed by any device on the
 * network. Unlike the SDO protocol, PDO transfers are performed with no
 * protocol overhead.
 *
 * @param {Eds} eds - Eds object.
 * @see CiA301 "Process data objects (PDO)" (§7.2.2)
 * @fires 'message' on preparing a CAN message to send.
 * @fires 'pdo' on updating a mapped pdo object.
 */
class Pdo extends EventEmitter {
    constructor(eds) {
        super();

        if(!Eds.isEds(eds))
            throw new TypeError('not an Eds');

        this.eds = eds;
        this.receiveMap = {};
        this.transmitMap = {};
        this.eventTimers = {};
        this.events = [];
        this.syncTpdo = [];
        this.syncCobId = null;
        this.started = false;
    }

    /**
     * RPDO communication/mapping parameter entries.
     *   Object 0x1400..0x15FF - RPDO communication parameter
     *   Object 0x1600..0x17FF - RPDO mapping parameter
     *
     * @type {Array<object>}
     */
    get rpdo() {
        return this.eds.getReceivePdos();
    }

    /**
     * TPDO communication/mapping parameter entries.
     *   Object 0x1800..0x19FF - TPDO communication parameter
     *   Object 0x2000..0x21FF - TPDO mapping parameter
     *
     * @type {Array<object>}
     */
    get tpdo() {
        return this.eds.getTransmitPdos();
    }

    /** Begin TPDO generation. */
    start() {
        if(this.started)
            return;

        this.receiveMap = {};
        for( const pdo of this.rpdo)
            this.receiveMap[pdo.cobId] = pdo;

        this.transmitMap = {};
        for( const pdo of this.tpdo)
            this.transmitMap[pdo.cobId] = pdo;

        for (const pdo of Object.values(this.transmitMap)) {
            if (pdo.transmissionType < 0xF1) {
                if (!pdo.syncStart) {
                    pdo.started = true;
                    pdo.counter = 0;
                }
                this.syncTpdo.push(pdo);
            }
            else if (pdo.transmissionType == 0xFE) {
                if (pdo.eventTime > 0) {
                    // Send on a timer
                    const timer = setInterval(() => {
                        this.write(pdo.cobId);
                    }, pdo.eventTime);

                    this.eventTimers[pdo.cobId] = timer;
                }
                else if (pdo.inhibitTime > 0) {
                    // Send on value change, but no faster than inhibit time
                    for (const obj of pdo.dataObjects) {
                        const func = () => {
                            // TODO - fix this, it should keep track of the last
                            // send time and count off that rather than using
                            // a naive timer.
                            if (!this.eventTimers[pdo.cobId]) {
                                const timer = setTimeout(() => {
                                    this.eventTimers[pdo.cobId] = null;
                                    this.write(pdo.cobId);
                                }, pdo.inhibitTime);

                                this.eventTimers[pdo.cobId] = timer;
                            }
                        };

                        let entry = this.eds.getEntry(obj.index);
                        if (entry.subNumber > 0)
                            entry = entry[obj.subIndex];

                        this.events.push([entry, 'update', func]);
                        entry.on('update', func);
                    }
                }
                else {
                    // Send immediately on value change
                    for (const obj of pdo.dataObjects) {
                        const func = () => this.write(pdo.cobId);

                        let entry = this.eds.getEntry(obj.index);
                        if (entry.subNumber > 0)
                            entry = entry[obj.subIndex];

                        this.events.push([entry, 'update', func]);
                        entry.on('update', func);
                    }
                }
            }
            else {
                throw TypeError(
                    `unsupported TPDO type (${pdo.transmissionType})`);
            }
        }

        if(this.syncTpdo.length > 0)
            this.syncCobId = this.eds.getSyncCobId().cobId;

        this.started = true;
    }

    /** Stop TPDO generation. */
    stop() {
        for (const [emitter, eventName, func] of this.events)
            emitter.removeListener(eventName, func);

        for (const timer of Object.values(this.eventTimers))
            clearInterval(timer);

        this.eventTimers = {};
        this.events = [];
        this.syncTpdo = [];
        this.started = false;
    }

    /**
     * Service: PDO write
     *
     * @param {number} cobId - mapped TPDO to send.
     */
    write(cobId) {
        const pdo = this.transmitMap[cobId];
        if (!pdo)
            throw new EdsError(`TPDO 0x${cobId.toString(16)} not mapped.`);

        const data = Buffer.alloc(pdo.dataSize);
        let dataOffset = 0;

        for (const obj of pdo.dataObjects) {
            obj.raw.copy(data, dataOffset);
            dataOffset += obj.raw.length;
        }

        this.emit('message', { id: cobId, data });
    }

    /**
     * Call when a new CAN message is received.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @param {number} message.len - CAN message length in bytes.
     */
    receive(message) {
        if ((message.id & 0x7FF) === this.syncCobId) {
            const counter = message.data[1];
            for( const pdo of this.syncTpdo) {
                if (pdo.started) {
                    if (pdo.transmissionType == 0) {
                        // Acyclic - send only if data changed
                        this.write(pdo.cobId, true);
                    }
                    else if (++pdo.counter >= pdo.transmissionType) {
                        // Cyclic - send every 'n' sync objects
                        this.write(pdo.cobId);
                        pdo.counter = 0;
                    }
                }
                else if (counter >= pdo.syncStart) {
                    pdo.started = true;
                    pdo.counter = 0;
                }
            }
        }
        else if (message.id >= 0x180 && message.id < 0x580) {
            const updated = [];
            if (message.id in this.receiveMap) {
                const pdo = this.receiveMap[message.id];
                let dataOffset = 0;

                for (const obj of pdo.dataObjects) {
                    const size = obj.size;
                    if (message.data.length < dataOffset + size)
                        continue;

                    const lastValue = obj.value;
                    message.data.copy(
                        obj.raw, 0, dataOffset, dataOffset + size);

                    dataOffset += obj.raw.length;

                    if (lastValue !== obj.value)
                        updated.push(obj);
                }
            }

            if (updated.length > 0) {
                this.emit('pdo', {
                    cobId: message.id,
                    updated,
                });
            }
        }
    }

    ////////////////////////////// Deprecated //////////////////////////////

    /**
     * Initialize the device and audit the object dictionary.
     *
     * @deprecated
     */
    init() {
        deprecate(() => this.start(),
            'init() is deprecated. Use start() instead.');
    }

    /**
     * Create a new RPDO communication/mapping parameter entry.
     *
     * @param {number} cobId - COB-ID used by the RPDO.
     * @param {Array<DataObject>} entries - entries to map.
     * @param {object} args - optional arguments.
     * @param {number} [args.type=254] - transmission type.
     * @param {number} [args.inhibitTime=0] - minimum time between writes.
     * @param {number} [args.eventTime=0] - how often to send timer based PDOs.
     * @param {number} [args.syncStart=0] - initial counter value for sync based PDOs.
     * @deprecated
     */
    addReceive(cobId, entries, args={}) {
        args.cobId = cobId;
        args.dataObjects = entries;
        deprecate(() => this.eds.addReceivePdo(args),
            'addReceive() is deprecated. Use Eds method instead.');
    }

    /**
     * Remove a RPDO communication/mapping parameter entry.
     *
     * @param {number} cobId - COB-ID used by the RPDO.
     * @deprecated
     */
    removeReceive(cobId) {
        deprecate(() => this.eds.removeReceivePdo(cobId),
            'removeReceive() is deprecated. Use Eds method instead.');
    }

    /**
     * Create a new TPDO communication/mapping parameter entry.
     *
     * @param {number} cobId - COB-ID used by the TPDO.
     * @param {Array<DataObject>} entries - entries to map.
     * @param {object} args - optional arguments.
     * @param {number} [args.type=254] - transmission type.
     * @param {number} [args.inhibitTime=0] - minimum time between writes.
     * @param {number} [args.eventTime=0] - how often to send timer based PDOs.
     * @param {number} [args.syncStart=0] - initial counter value for sync based PDOs.
     * @deprecated
     */
    addTransmit(cobId, entries, args={}) {
        args.cobId = cobId;
        args.dataObjects = entries;
        deprecate(() => this.eds.addTransmitPdo(args),
            'addTransmit() is deprecated. Use Eds method instead.');
    }

    /**
     * Remove a TPDO communication/mapping parameter entry.
     *
     * @param {number} cobId - COB-ID used by the TPDO.
     * @deprecated
     */
    removeTransmit(cobId) {
        deprecate(() => this.eds.removeTransmitPdo(cobId),
            'removeTransmit() is deprecated. Use Eds method instead.');
    }
}

module.exports = exports = { Pdo };
