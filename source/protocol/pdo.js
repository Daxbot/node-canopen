/**
 * @file Implements the CANopen Process Data Object (PDO) protocol.
 * @author Wilkins White
 * @copyright 2024 Daxbot
 */

const Protocol = require('./protocol');
const { DataObject, Eds, EdsError } = require('../eds');
const { deprecate } = require('util');


/**
 * Parse a pair of PDO communication/mapping parameters.
 *
 * @param {Eds} eds - Eds object.
 * @param {number} index - PDO communication parameter index.
 * @returns {object} parsed PDO data.
 */
function parsePdo(eds, index) {
    const commEntry = eds.getEntry(index);
    if (!commEntry) {
        index = '0x' + index.toString(16);
        throw new EdsError(`missing PDO communication parameter (${index})`);
    }

    const mapEntry = eds.getEntry(index + 0x200);
    if (!mapEntry) {
        index = '0x' + (index + 0x200).toString(16);
        throw new EdsError(`missing PDO mapping parameter (${index})`);
    }

    /* sub-index 1 (mandatory):
        *   bit 0..10      11-bit CAN base frame.
        *   bit 11..28     29-bit CAN extended frame.
        *   bit 29         Frame type.
        *   bit 30         RTR allowed.
        *   bit 31         PDO valid.
        */
    if (commEntry[1] === undefined)
        throw new EdsError('missing PDO COB-ID');

    let cobId = commEntry[1].value;
    if (!cobId || ((cobId >> 31) & 0x1) == 0x1)
        return;

    if (((cobId >> 29) & 0x1) == 0x1)
        throw new EdsError('CAN extended frames are not supported');

    cobId &= 0x7FF;

    /* sub-index 2 (mandatory):
        *   bit 0..7       Transmission type.
        */
    if (commEntry[2] === undefined)
        throw new EdsError('missing PDO transmission type');

    const transmissionType = commEntry[2].value;

    /* sub-index 3 (optional):
        *   bit 0..15      Inhibit time.
        */
    const inhibitTime = (commEntry[3] !== undefined)
        ? commEntry[3].value : 0;

    /* sub-index 5 (optional):
        *   bit 0..15      Event timer value.
        */
    const eventTime = (commEntry[5] !== undefined)
        ? commEntry[5].value : 0;

    /* sub-index 6 (optional):
        *   bit 0..7       SYNC start value.
        */
    const syncStart = (commEntry[6] !== undefined)
        ? commEntry[6].value : 0;

    let pdo = {
        cobId,
        transmissionType,
        inhibitTime,
        eventTime,
        syncStart,
        dataObjects: [],
        dataSize: 0,
    };

    if (mapEntry[0].value == 0xFE)
        throw new EdsError('SAM-MPDO not supported');

    if (mapEntry[0].value == 0xFF)
        throw new EdsError('DAM-MPDO not supported');

    if (mapEntry[0].value > 0x40) {
        throw new EdsError('invalid PDO mapping value '
            + `(${mapEntry[0].value})`);
    }

    for (let i = 1; i <= mapEntry[0].value; ++i) {
        if (mapEntry[i].raw.length == 0)
            continue;

        /* sub-index 1+:
            *   bit 0..7       Bit length.
            *   bit 8..15      Sub-index.
            *   bit 16..31     Index.
            */
        const dataLength = mapEntry[i].raw.readUInt8(0);
        const dataSubIndex = mapEntry[i].raw.readUInt8(1);
        const dataIndex = mapEntry[i].raw.readUInt16LE(2);

        let obj = eds.getEntry(dataIndex);
        if (dataSubIndex)
            obj = obj[dataSubIndex];

        pdo.dataObjects[i - 1] = obj;
        pdo.dataSize += dataLength / 8;
    }

    return pdo;
}

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
 */
class Pdo extends Protocol {
    constructor(eds) {
        super();

        if (!Eds.isEds(eds))
            throw new TypeError('not an Eds');

        this.eds = eds;
        this.receiveMap = {};
        this.transmitMap = {};
        this.eventTimers = {};
        this.events = [];
        this.syncTpdo = [];
        this.syncCobId = null;
    }

    /**
     * RPDO communication/mapping parameter entries.
     *   Object 0x1400..0x15FF - RPDO communication parameter
     *   Object 0x1600..0x17FF - RPDO mapping parameter
     *
     * @type {Array<object>}
     * @since 6.0.0
     */
    get rpdo() {
        const rpdo = [];

        for (let index of Object.keys(this.eds.dataObjects)) {
            index = parseInt(index);
            if (index < 0x1400 || index > 0x15FF)
                continue;

            const pdo = parsePdo(this.eds, index);
            delete pdo.syncStart; // Not used by RPDOs

            rpdo.push(pdo);
        }

        return rpdo;
    }

    /**
     * TPDO communication/mapping parameter entries.
     *   Object 0x1800..0x19FF - TPDO communication parameter
     *   Object 0x2000..0x21FF - TPDO mapping parameter
     *
     * @type {Array<object>}
     * @since 6.0.0
     */
    get tpdo() {
        const tpdo = [];

        for (let index of Object.keys(this.eds.dataObjects)) {
            index = parseInt(index);
            if (index < 0x1800 || index > 0x19FF)
                continue;

            const pdo = parsePdo(this.eds, index);
            tpdo.push(pdo);
        }

        return tpdo;
    }

    /**
     * Begin TPDO generation.
     *
     * @fires Protocol#start
     */
    start() {
        if (this.started)
            return;

        this.receiveMap = {};
        for (const pdo of this.rpdo)
            this.receiveMap[pdo.cobId] = pdo;

        this.transmitMap = {};
        for (const pdo of this.tpdo)
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

        if (this.syncTpdo.length > 0)
            this.syncCobId = this.eds.getSyncCobId().cobId;

        super.start();
    }

    /**
     * Stop TPDO generation.
     *
     * @fires Protocol#stop
     */
    stop() {
        for (const [emitter, eventName, func] of this.events)
            emitter.removeListener(eventName, func);

        for (const timer of Object.values(this.eventTimers))
            clearInterval(timer);

        this.eventTimers = {};
        this.events = [];
        this.syncTpdo = [];
        super.stop();
    }

    /**
     * Service: PDO write
     *
     * @param {number} cobId - mapped TPDO to send.
     * @fires Protocol#message
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

        this.send(cobId, data);
    }

    /**
     * Call when a new CAN message is received.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @fires Pdo#pdo
     */
    receive({ id, data }) {
        if ((id & 0x7FF) === this.syncCobId) {
            const counter = data[1];
            for (const pdo of this.syncTpdo) {
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
        else if (id >= 0x180 && id < 0x580) {
            if (id in this.receiveMap) {
                const pdo = this.receiveMap[id];
                let dataOffset = 0;

                let updated = false;
                for (const obj of pdo.dataObjects) {
                    const size = obj.size;
                    if (data.length < dataOffset + size)
                        continue;

                    const lastValue = obj.value;
                    data.copy(obj.raw, 0, dataOffset, dataOffset + size);
                    dataOffset += obj.raw.length;

                    if (!updated && lastValue !== obj.value)
                        updated = true;
                }

                if (updated)
                    this._emitPdo(pdo);
            }
        }
    }

    /////////////////////////////// Private ////////////////////////////////

    /**
     * Emit a PDO object.
     *
     * @param {object} pdo - object to emit.
     * @fires Pdo#pdo
     * @private
     */
    _emitPdo(pdo) {
        /**
         * New Pdo data is available.
         *
         * @event Pdo#pdo
         * @type {object}
         * @property {number} cobId - object identifier.
         * @property {number} transmissionType - transmission type.
         * @property {number} inhibitTime - minimum time between updates.
         * @property {Array<DataObject>} dataObjects - mapped objects.
         */
        this.emit('pdo', pdo);
    }

    ////////////////////////////// Deprecated //////////////////////////////

    /**
     * Initialize the device and audit the object dictionary.
     *
     * @deprecated since 6.0.0
     */
    init() {
        deprecate(() => this.start(),
            'init() is deprecated. Use start() instead.');
    }

    /**
     * Get a RPDO communication parameter entry.
     *
     * @param {number} cobId - COB-ID used by the RPDO.
     * @returns {DataObject | null} the matching entry.
     * @deprecated since 6.0.0
     */
    getReceive(cobId) {
        return deprecate(() => {
            for (let [index, entry] of Object.entries(this.eds.dataObjects)) {
                index = parseInt(index);
                if (index < 0x1400 || index > 0x15FF)
                    continue;

                if (entry[1] !== undefined && entry[1].value === cobId)
                    return entry;
            }

            return null;
        }, 'getReceive is deprecated. Use this.rpdo instead');
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
     * @deprecated since 6.0.0
     */
    addReceive(cobId, entries, args = {}) {
        args.cobId = cobId;
        args.dataObjects = entries;
        deprecate(() => this.eds.addReceivePdo(args),
            'addReceive() is deprecated. Use Eds method instead.');
    }

    /**
     * Remove a RPDO communication/mapping parameter entry.
     *
     * @param {number} cobId - COB-ID used by the RPDO.
     * @deprecated since 6.0.0
     */
    removeReceive(cobId) {
        deprecate(() => this.eds.removeReceivePdo(cobId),
            'removeReceive() is deprecated. Use Eds method instead.');
    }

    /**
     * Get a TPDO communication parameter entry.
     *
     * @param {number} cobId - COB-ID used by the TPDO.
     * @returns {DataObject | null} the matching entry.
     * @deprecated since 6.0.0
     */
    getTransmit(cobId) {
        return deprecate(() => {
            for (let [index, entry] of Object.entries(this.eds.dataObjects)) {
                index = parseInt(index);
                if (index < 0x1800 || index > 0x19FF)
                    continue;

                if (entry[1] !== undefined && entry[1].value === cobId)
                    return entry;
            }

            return null;
        }, 'getTransmit is deprecated. Use this.tpdo instead.');
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
     * @deprecated since 6.0.0
     */
    addTransmit(cobId, entries, args = {}) {
        args.cobId = cobId;
        args.dataObjects = entries;
        deprecate(() => this.eds.addTransmitPdo(args),
            'addTransmit() is deprecated. Use Eds method instead.');
    }

    /**
     * Remove a TPDO communication/mapping parameter entry.
     *
     * @param {number} cobId - COB-ID used by the TPDO.
     * @deprecated since 6.0.0
     */
    removeTransmit(cobId) {
        deprecate(() => this.eds.removeTransmitPdo(cobId),
            'removeTransmit() is deprecated. Use Eds method instead.');
    }
}

module.exports = exports = { Pdo, parsePdo };
