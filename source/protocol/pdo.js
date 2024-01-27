/**
 * @file Implements the CANopen Process Data Object (PDO) protocol.
 * @author Wilkins White
 * @copyright 2024 Daxbot
 */

const Protocol = require('./protocol');
const { DataObject, Eds, EdsError } = require('../eds');
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
     * Begin TPDO generation.
     *
     * @fires Protocol#start
     */
    start() {
        if (this.started)
            return;

        this._init();

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

    /**
     * Initialize the PDO maps.
     *
     * @private
     */
    _init() {
        this.receiveMap = {};
        for (const pdo of this.eds.getReceivePdos())
            this.receiveMap[pdo.cobId] = pdo;

        this.transmitMap = {};
        for (const pdo of this.eds.getTransmitPdos())
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
            this.syncCobId = this.eds.getSyncCobId();
    }
}

////////////////////////////////// Deprecated //////////////////////////////////

/**
 * Initialize the device and audit the object dictionary.
 *
 * @deprecated Use {@link Pdo#start} instead.
 * @function
 */
Pdo.prototype.init = deprecate(
    function () {
        this._init();
    }, 'Pdo.init() is deprecated. Use Pdo.start() instead.');

/**
 * Get a RPDO communication parameter entry.
 *
 * @param {number} cobId - COB-ID used by the RPDO.
 * @returns {DataObject | null} the matching entry.
 * @deprecated Use {@link Eds#getReceivePdos} instead.
 * @function
 */
Pdo.prototype.getReceive = deprecate(
    function (cobId) {
        for (let [index, entry] of Object.entries(this.eds.dataObjects)) {
            index = parseInt(index);
            if (index < 0x1400 || index > 0x15FF)
                continue;

            if (entry[1] !== undefined && entry[1].value === cobId)
                return entry;
        }

        return null;
    }, 'Pdo.getReceive() is deprecated. Use Eds.getReceivePdos() instead.');

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
 * @deprecated Use {@link Eds#addReceivePdo} instead.
 * @function
 */
Pdo.prototype.addReceive = deprecate(
    function (cobId, entries, args = {}) {
        args.cobId = cobId;
        args.dataObjects = entries;
        this.eds.addReceivePdo(args);
    }, 'Pdo.addReceive() is deprecated. Use Eds.addReceivePdo() instead.');

/**
 * Remove a RPDO communication/mapping parameter entry.
 *
 * @param {number} cobId - COB-ID used by the RPDO.
 * @deprecated Use {@link Eds#removeReceivePdo} instead.
 * @function
 */
Pdo.prototype.removeReceive = deprecate(
    function (cobId) {
        this.eds.removeReceivePdo(cobId);
    }, 'Pdo.removeReceive() is deprecated. Use Eds.removeReceivePdo() instead.');

/**
 * Get a TPDO communication parameter entry.
 *
 * @param {number} cobId - COB-ID used by the TPDO.
 * @returns {DataObject | null} the matching entry.
 * @deprecated Use {@link Eds#getTransmitPdos} instead.
 * @function
 */
Pdo.prototype.getTransmit = deprecate(
    function (cobId) {
        for (let [index, entry] of Object.entries(this.eds.dataObjects)) {
            index = parseInt(index);
            if (index < 0x1800 || index > 0x19FF)
                continue;

            if (entry[1] !== undefined && entry[1].value === cobId)
                return entry;
        }

        return null;
    }, 'Pdo.getTransmit() is deprecated. Use Eds.getTransmitPdos() instead.');

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
 * @deprecated Use {@link Eds#addTransmitPdo} instead.
 * @function
 */
Pdo.prototype.addTransmit = deprecate(
    function (cobId, entries, args = {}) {
        args.cobId = cobId;
        args.dataObjects = entries;
        this.eds.addTransmitPdo(args);
    }, 'Pdo.addTransmit() is deprecated. Use Eds.addTransmitPdo() instead.');

/**
 * Remove a TPDO communication/mapping parameter entry.
 *
 * @param {number} cobId - COB-ID used by the TPDO.
 * @deprecated Use {@link Eds#removeTransmitPdo} instead.
 * @function
 */
Pdo.prototype.removeTransmit = deprecate(
    function (cobId) {
        this.eds.removeTransmitPdo(cobId);
    }, 'Pdo.removeTransmit() is deprecated. Use Eds.removeTransmitPdo() instead.');

module.exports = exports = { Pdo };
