/**
 * @file Implements the CANopen Process Data Object (PDO) protocol.
 * @author Wilkins White
 * @copyright 2021 Nova Dynamics LLC
 */

const Device = require('../device');
const { ObjectType, AccessType, DataType, EdsError, DataObject } = require('../eds');

/**
 * CANopen PDO protocol handler.
 *
 * The process data object (PDO) protocol follows a producer-consumer structure
 * where one device broadcasts data that can be consumed by any device on the
 * network. Unlike the SDO protocol, PDO transfers are performed with no
 * protocol overhead.
 *
 * @param {Device} device - parent device.
 * @see CiA301 "Process data objects (PDO)" (§7.2.2)
 * @example
 * const can = require('socketcan');
 *
 * const channel = can.createRawChannel('can0');
 * const device = new Device({ id: 0xa });
 *
 * channel.addListener('onMessage', (message) => device.receive(message));
 * device.setTransmitFunction((message) => channel.send(message));
 *
 * device.init();
 * channel.start();
 *
 * const entry = device.eds.addEntry(0x2000, {
 *     parameterName:  'Test object',
 *     objectType:     ObjectType.VAR,
 *     dataType:       DataType.UNSIGNED32,
 *     accessType:     AccessType.READ_WRITE,
 * });
 *
 * device.pdo.addTransmit(0x180, [entry]);
 * device.pdo.write(0x180 + device.id);
 */
class Pdo {
    constructor(device) {
        this.device = device;
        this.receiveMap = {};
        this.writeMap = {};
        this.eventTimers = {};
        this.events = [];
        this.started = false;
    }

    /**
     * Get a RPDO communication parameter entry.
     *
     * @param {number} cobId - COB-ID used by the RPDO.
     * @returns {DataObject | null} the matching entry.
     */
    getReceive(cobId) {
        for(let [index, entry] of Object.entries(this.device.dataObjects)) {
            index = parseInt(index);
            if(index < 0x1400 || index > 0x15FF)
                continue;

            if(entry[1] !== undefined && entry[1].value === cobId)
                return entry;
        }

        return null;
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
     */
    addReceive(cobId, entries, args={}) {
        if(this.getReceive(cobId) !== null) {
            cobId = '0x' + cobId.toString(16);
            throw new EdsError(`Entry for RPDO ${cobId} already exists`);
        }

        let index = 0x1400;
        for(; index <= 0x15FF; ++index) {
            if(this.device.eds.getEntry(index) === undefined)
                break;
        }

        this.device.eds.addEntry(index, {
            parameterName:  'RPDO communication parameter',
            objectType:     ObjectType.RECORD,
        });

        this.device.eds.addSubEntry(index, 1, {
            parameterName:  'COB-ID used by RPDO',
            dataType:       DataType.UNSIGNED32,
            accessType:     AccessType.READ_WRITE,
            defaultValue:   cobId
        });

        this.device.eds.addSubEntry(index, 2, {
            parameterName:  'transmission type',
            dataType:       DataType.UNSIGNED8,
            accessType:     AccessType.READ_WRITE,
            defaultValue:   args.type || 254
        });

        this.device.eds.addSubEntry(index, 3, {
            parameterName:  'inhibit time',
            dataType:       DataType.UNSIGNED16,
            accessType:     AccessType.READ_WRITE,
            defaultValue:   args.inhibitTime || 0
        });

        this.device.eds.addSubEntry(index, 4, {
            parameterName:  'compatibility entry',
            dataType:       DataType.UNSIGNED8,
            accessType:     AccessType.READ_WRITE,
        });

        this.device.eds.addSubEntry(index, 5, {
            parameterName:  'event timer',
            dataType:       DataType.UNSIGNED16,
            accessType:     AccessType.READ_WRITE,
            defaultValue:   args.eventTime || 0
        });

        this.device.eds.addSubEntry(index, 6, {
            parameterName:  'SYNC start value',
            dataType:       DataType.UNSIGNED8,
            accessType:     AccessType.READ_WRITE,
            defaultValue:   args.syncStart || 0
        });

        this.device.eds.addEntry(index+0x200, {
            parameterName:  'RPDO mapping parameter',
            objectType:     ObjectType.RECORD,
        });

        for(let i = 0; i < entries.length; ++i) {
            const entry = entries[i];
            const value = (entry.index << 16)
                        | (entry.subIndex << 8)
                        | (entry.size << 3);

            this.device.eds.addSubEntry(index+0x200, i+1, {
                parameterName:  `Mapped object ${i+1}`,
                dataType:       DataType.UNSIGNED32,
                accessType:     AccessType.READ_WRITE,
                defaultValue:   value
            });
        }

        const pdo = this._parsePdo(index);
        this.receiveMap[pdo.cobId] = pdo;
    }

    /**
     * Remove a RPDO communication/mapping parameter entry.
     *
     * @param {number} cobId - COB-ID used by the RPDO.
     */
    removeReceive(cobId) {
        const entry = this.getReceive(cobId);
        if(entry === null)
            throw new EdsError(`Entry for RPDO ${cobId} does not exist`);

        delete this.receiveMap[cobId];

        // RPDO communication parameter
        this.device.eds.removeEntry(entry.index);

        // RPDO mapping parameter
        this.device.eds.removeEntry(entry.index+0x200);
    }

    /**
     * Get a TPDO communication parameter entry.
     *
     * @param {number} cobId - COB-ID used by the TPDO.
     * @returns {DataObject | null} the matching entry.
     */
    getTransmit(cobId) {
        for(let [index, entry] of Object.entries(this.device.dataObjects)) {
            index = parseInt(index);
            if(index < 0x1800 || index > 0x19FF)
                continue;

            if(entry[1] !== undefined && entry[1].value === cobId)
                return entry;
        }

        return null;
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
     */
    addTransmit(cobId, entries, args={}) {
        if(this.getReceive(cobId) !== null) {
            cobId = '0x' + cobId.toString(16);
            throw new EdsError(`Entry for TPDO ${cobId} already exists`);
        }

        let index = 0x1800;
        for(; index <= 0x19FF; ++index) {
            if(this.device.eds.getEntry(index) === undefined)
                break;
        }

        this.device.eds.addEntry(index, {
            parameterName:  'TPDO communication parameter',
            objectType:     ObjectType.RECORD,
        });

        this.device.eds.addSubEntry(index, 1, {
            parameterName:  'COB-ID used by TPDO',
            dataType:       DataType.UNSIGNED32,
            accessType:     AccessType.READ_WRITE,
            defaultValue:   cobId
        });

        this.device.eds.addSubEntry(index, 2, {
            parameterName:  'transmission type',
            dataType:       DataType.UNSIGNED8,
            accessType:     AccessType.READ_WRITE,
            defaultValue:   args.type || 254
        });

        this.device.eds.addSubEntry(index, 3, {
            parameterName:  'inhibit time',
            dataType:       DataType.UNSIGNED16,
            accessType:     AccessType.READ_WRITE,
            defaultValue:   args.inhibitTime || 0
        });

        this.device.eds.addSubEntry(index, 4, {
            parameterName:  'compatibility entry',
            dataType:       DataType.UNSIGNED8,
            accessType:     AccessType.READ_WRITE,
        });

        this.device.eds.addSubEntry(index, 5, {
            parameterName:  'event timer',
            dataType:       DataType.UNSIGNED16,
            accessType:     AccessType.READ_WRITE,
            defaultValue:   args.eventTime || 0
        });

        this.device.eds.addSubEntry(index, 6, {
            parameterName:  'SYNC start value',
            dataType:       DataType.UNSIGNED8,
            accessType:     AccessType.READ_WRITE,
            defaultValue:   args.syncStart || 0
        });

        this.device.eds.addEntry(index+0x200, {
            parameterName:  'TPDO mapping parameter',
            objectType:     ObjectType.RECORD,
        });

        for(let i = 0; i < entries.length; ++i) {
            const entry = entries[i];
            const value = (entry.index << 16)
                        | (entry.subIndex << 8)
                        | (entry.size << 3);

            this.device.eds.addSubEntry(index+0x200, i+1, {
                parameterName:  `Mapped object ${i+1}`,
                dataType:       DataType.UNSIGNED32,
                accessType:     AccessType.READ_WRITE,
                defaultValue:   value
            });
        }

        const pdo = this._parsePdo(index);
        this.writeMap[pdo.cobId] = pdo;
        if(this.started)
            this._startTpdo(pdo);
    }

    /**
     * Remove a TPDO communication/mapping parameter entry.
     *
     * @param {number} cobId - COB-ID used by the TPDO.
     */
    removeTransmit(cobId) {
        const entry = this.getTransmit(cobId);
        if(entry === null)
            throw new EdsError(`Entry for TPDO ${cobId} does not exist`);

        delete this.writeMap[cobId];

        // TPDO communication parameter
        this.device.eds.removeEntry(entry.index);

        // TPDO mapping parameter
        this.device.eds.removeEntry(entry.index+0x200);
    }

    /** Initialize members and begin RPDO monitoring. */
    init() {
        this.receiveMap = {};
        this.writeMap = {};

        for(let index of Object.keys(this.device.dataObjects)) {
            index = parseInt(index);
            if(index >= 0x1400 && index <= 0x15FF) {
                // Object 0x1400..0x15FF - RPDO communication parameter
                const pdo = this._parsePdo(index);
                this.receiveMap[pdo.cobId] = pdo;
            }
            else if(index >= 0x1800 && index <= 0x19FF) {
                // Object 0x1800..0x19FF - TPDO communication parameter
                const pdo = this._parsePdo(index);
                this.writeMap[pdo.cobId] = pdo;
            }
        }

        this.device.addListener('message', this._onMessage.bind(this));
    }

    /** Begin TPDO generation. */
    start() {
        for(const pdo of Object.values(this.writeMap))
            this._startTpdo(pdo)

        this.started = true;
    }

    /** Stop TPDO generation. */
    stop() {
        for(const [emitter, eventName, listener] of this.events)
            emitter.removeListener(eventName, listener);

        for(const timer of Object.values(this.eventTimers))
            clearInterval(timer);

        this.started = false;
        this.eventTimers = {};
        this.events = [];
    }

    /**
     * Service: PDO write
     *
     * @param {number} cobId - mapped TPDO to send.
     * @param {boolean} update - only write if data has changed.
     */
    write(cobId, update=false) {
        const pdo = this.writeMap[cobId];
        if(!pdo)
            throw new EdsError(`TPDO 0x${cobId.toString(16)} not mapped.`);

        const data = Buffer.alloc(pdo.dataSize);
        let dataOffset = 0;
        let dataUpdated = false;

        for(const dataObject of pdo.dataObjects) {
            let entry = this.device.eds.getEntry(dataObject.index);
            if(entry.subNumber > 0)
                entry = entry[dataObject.subIndex];

            entry.raw.copy(data, dataOffset);
            dataOffset += entry.raw.length;

            const newValue = entry.value;
            if(dataObject.lastValue != newValue) {
                dataObject.lastValue = newValue;
                dataUpdated = true;
            }
        }

        if(!update || dataUpdated)
            this.device.send({ id: cobId, data: data });
    }

    /**
     * Called when a new CAN message is received.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @param {number} message.len - CAN message length in bytes.
     * @private
     */
    _onMessage(message) {
        if(message.id < 0x180 || message.id >= 0x580)
            return;

        const updated = [];
        if(message.id in this.receiveMap) {
            const pdo = this.receiveMap[message.id];
            let dataOffset = 0;

            for(const dataObject of pdo.dataObjects) {
                let entry = this.device.dataObjects[dataObject.index];
                if(entry.subNumber > 0)
                    entry = entry[dataObject.subIndex];

                const size = entry.raw.length;
                if(message.data.length < dataOffset + size)
                    continue;

                message.data.copy(entry.raw, 0, dataOffset, dataOffset + size);
                dataOffset += size;

                const newValue = entry.value;
                if(dataObject.lastValue != newValue) {
                    dataObject.lastValue = newValue;
                    updated.push(entry);
                }
            }
        }

        if(updated.length > 0)
            this.device.emit('pdo', updated, message.id);
    }

    /**
     * Parse a PDO communication/mapping parameter.
     *
     * @param {number} index - entry index.
     * @returns {object} parsed PDO data.
     * @private
     */
    _parsePdo(index) {
        const entry = this.device.eds.getEntry(index);
        if(!entry) {
            index = '0x' + (index + 0x200).toString(16);
            throw new EdsError(`Missing PDO communication parameter (${index})`);
        }

        const mapEntry = this.device.eds.getEntry(index + 0x200);
        if(!mapEntry) {
            index = '0x' + (index + 0x200).toString(16);
            throw new EdsError(`Missing PDO mapping parameter (${index})`);
        }

        /* sub-index 1 (mandatory):
         *   bit 0..10      11-bit CAN base frame.
         *   bit 11..28     29-bit CAN extended frame.
         *   bit 29         Frame type.
         *   bit 30         RTR allowed.
         *   bit 31         TPDO valid.
         */
        if(entry[1] === undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`Missing PDO COB-ID (${index})`);
        }

        let cobId = entry[1].value;
        if(!cobId || ((cobId >> 31) & 0x1) == 0x1)
            return;

        if(((cobId >> 29) & 0x1) == 0x1)
            throw TypeError("CAN extended frames are not supported")

        cobId &= 0x7FF;

        // Add the device id iff the provided id is a base value, e.g. 0x180.
        if((cobId % 0x80) == 0x0)
            cobId |= this.device.id;

        /* sub-index 2 (mandatory):
         *   bit 0..7       Transmission type.
         */
        if(entry[2] === undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`Missing PDO transmission type (${index})`);
        }

        const transmissionType = entry[2].value;

        /* sub-index 3 (optional):
         *   bit 0..15      Inhibit time.
         */
        const inhibitTime = (entry[3] !== undefined) ? entry[3].value : 0;

        /* sub-index 5 (optional):
         *   bit 0..15      Event timer value.
         */
        const eventTime = (entry[5] !== undefined) ? entry[5].value : 0;

        /* sub-index 6 (optional):
         *   bit 0..7       SYNC start value.
         */
        const syncStart = (entry[6] !== undefined) ? entry[6].value : 0;

        let pdo = {
            cobId:          cobId,
            type:           transmissionType,
            inhibitTime:    inhibitTime,
            eventTime:      eventTime,
            syncStart:      syncStart,
            dataObjects:    [],
            dataSize:       0,
        };


        if(mapEntry[0].value == 0xFE)
            throw new EdsError('SAM-MPDO not supported');

        if(mapEntry[0].value == 0xFF)
            throw new EdsError('DAM-MPDO not supported');

        if(mapEntry[0].value > 0x40)
            throw TypeError(`Invalid PDO mapping value (${mapEntry[0].value})`);

        for(let i = 1; i < mapEntry[0].value + 1; ++i) {
            if(mapEntry[i].raw.length == 0)
                continue;

            /* sub-index 1+:
             *   bit 0..7       Bit length.
             *   bit 8..15      Sub-index.
             *   bit 16..31     Index.
             */
            const dataLength = mapEntry[i].raw.readUInt8(0);
            const dataSubIndex = mapEntry[i].raw.readUInt8(1);
            const dataIndex = mapEntry[i].raw.readUInt16LE(2);

            if(!(dataIndex in this.device.dataObjects))
                continue;

            pdo.dataObjects[i-1] = {
                index:      dataIndex,
                subIndex:   dataSubIndex,
                length:     dataLength,
                lastValue:  undefined,
            };

            pdo.dataSize += dataLength / 8;
        }

        return pdo;
    }

    /**
     * Prepare a TPDO based on transmission type.
     *
     * @param {object} pdo - parsed PDO data.
     * @private
     */
    _startTpdo(pdo) {
        if(pdo.type < 0xF1) {
            const listener = (counter) => {
                if(pdo.started) {
                    if(pdo.type == 0) {
                        // Acyclic - send only if data changed
                        this.write(pdo.cobId, true);
                    }
                    else if(++pdo.counter >= pdo.type) {
                        // Cyclic - send every 'n' sync objects
                        this.write(pdo.cobId);
                        pdo.counter = 0;
                    }
                }
                else if(counter >= pdo.syncStart) {
                    pdo.started = true;
                    pdo.counter = 0;
                }
            }

            this.events.push([this.device, 'sync', listener]);
            this.device.on('sync', listener);
        }
        else if(pdo.type == 0xFE) {
            if(pdo.eventTime > 0) {
                // Send on a timer
                const timer = setInterval(() => {
                    this.write(pdo.cobId);
                }, pdo.eventTime);

                this.eventTimers[pdo.cobId] = timer;
            }
            else if(pdo.inhibitTime > 0) {
                // Send on value change, but no faster than inhibit time
                for(const dataObject of pdo.dataObjects) {
                    const listener = () => {
                        // TODO - fix this, it should keep track of the last
                        // send time and count off that rather than using
                        // a naive timer.
                        if(!this.eventTimers[pdo.cobId]) {
                            const timer = setTimeout(() => {
                                this.eventTimers[pdo.cobId] = null;
                                this.write(pdo.cobId);
                            }, pdo.inhibitTime);

                            this.eventTimers[pdo.cobId] = timer;
                        }
                    }

                    let entry = this.device.eds.getEntry(dataObject.index);
                    if(entry.subNumber > 0)
                        entry = entry[dataObject.subIndex];

                    this.events.push([entry, 'update', listener]);
                    entry.on('update', listener)
                }
            }
            else {
                // Send immediately on value change
                for(const dataObject of pdo.dataObjects) {
                    const listener = () => this.write(pdo.cobId);

                    let entry = this.device.eds.getEntry(dataObject.index);
                    if(entry.subNumber > 0)
                        entry = entry[dataObject.subIndex];

                    this.events.push([entry, 'update', listener]);
                    entry.on('update', listener);
                }
            }
        }
        else {
            throw TypeError(`Unsupported TPDO type (${pdo.type}).`);
        }
    }
}

module.exports=exports={ Pdo };
