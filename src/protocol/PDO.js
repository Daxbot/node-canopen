const {DeviceError} = require('../Device');

/** CANopen PDO protocol handler.
 *
 * The process data object (PDO) protocol follows a producer-consumer structure
 * where one device broadcasts data that can be consumed by any device on the
 * network. Unlike the SDO protocol, PDO transfers are performed with no
 * protocol overhead.
 *
 * @param {Device} device - parent device.
 * @see CiA301 "Process data objects (PDO)" (§7.2.2)
 * @memberof Device
 */
class PDO {
    constructor(device) {
        this.device = device;
        this.receiveMap = {};
        this.writeMap = {};
        this.eventTimers = {};
        this.events = [];
    }

    /** Begin RPDO monitoring. */
    init() {
        for(let [index, entry] of Object.entries(this.device.EDS.dataObjects)) {
            index = parseInt(index);
            if((index & 0xFF00) == 0x1400 || (index & 0xFF00) == 0x1500) {
                /* Object 0x1400..0x15FF - RPDO communication parameter. */
                const pdo = this._parsePDO(index, entry);
                if(pdo)
                    this.receiveMap[pdo.cobId] = pdo;
            }
            else if((index & 0xFF00) == 0x1800 || (index & 0xFF00) == 0x1900) {
                /* Object 0x1800..0x19FF - TPDO communication parameter. */
                const pdo = this._parsePDO(index, entry);
                if(pdo)
                    this.writeMap[pdo.cobId] = pdo;
            }
        }

        this.device.channel.addListener("onMessage", this._onMessage.bind(this));
    }

    /** Begin TPDO generation. */
    start() {
        for(const [cobId, pdo] of Object.entries(this.writeMap)) {
            if(pdo.type < 0xF1) {
                const listener = function(counter) {
                    if(pdo.started) {
                        if(pdo.type == 0) {
                            /* Acyclic - send only if data changed. */
                            this.write(cobId, true);
                        }
                        else if(++pdo.counter >= pdo.type) {
                            /* Cyclic - send every 'n' sync objects. */
                            this.write(cobId);
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
                    /* Send on a timer. */
                    const timer = setInterval(() => {
                        this.write(cobId);
                    }, pdo.eventTime);

                    this.eventTimers[cobId] = timer;
                }
                else if(pdo.inhibitTime > 0) {
                    /* Send on value change, but no faster than inhibit time. */
                    for(const dataObject of pdo.dataObjects) {
                        const listener = function() {
                            if(!this.eventTimers[cobId]) {
                                const timer = setTimeout(() => {
                                    this.eventTimers[cobId] = null;
                                    this.write(cobId);
                                }, pdo.inhibitTime);

                                this.eventTimers[cobId] = timer;
                            }
                        }

                        this.events.push([dataObject, 'update', listener]);
                        dataObject.on('update', listener);
                    }
                }
                else {
                    /* Send immediately on value change. */
                    for(const dataObject of pdo.dataObjects) {
                        const listener = function() {
                            this.write(cobId);
                        }

                        this.events.push([dataObject, 'update', listener]);
                        dataObject.on('update', listener);
                    }
                }
            }
            else {
                throw new DeviceError(`Unsupported TPDO type (${pdo.type}).`);
            }
        }
    }

    /** Stop TPDO generation. */
    stop() {
        for(const [emitter, eventName, listener] in this.events)
            emitter.removeListener(eventName, listener);

        for(const timer in Object.values(this.eventTimers))
            clearInterval(timer);
    }

    /** Service: PDO write
     * @param {number} cobId - mapped TPDO to send.
     * @param {bool} update - only write if data has changed.
     */
    write(cobId, update=false) {
        const pdo = this.writeMap[cobId];
        if(!pdo)
            throw new DeviceError(`TPDO 0x${cobId.toString(16)} not mapped.`);

        const data = Buffer.alloc(pdo.dataSize);
        let dataOffset = 0;
        let dataUpdated = false;

        for(let i = 0; i < pdo.dataObjects.length; i++) {
            let entry = this.device.EDS.getEntry(pdo.dataObjects[i].index);
            if(entry.subNumber > 0)
                entry = entry[pdo.subIndex];

            entry.raw.copy(data, dataOffset);
            dataOffset += entry.raw.length;

            const newValue = entry.value;
            if(pdo.lastValue != newValue) {
                pdo.lastValue = newValue;
                dataUpdated = true;
            }
        }

        if(!update || dataUpdated)
            this.device.channel.send({ id: cobId, data: data });
    }

    /** socketcan 'onMessage' listener.
     * @private
     * @param {Object} message - CAN frame.
     */
    _onMessage(message) {
        if(!message || message.id < 0x180 || message.id >= 0x580)
            return;

        const updated = [];
        if(message.id in this.receiveMap) {
            const pdo = this.receiveMap[message.id];
            let dataOffset = 0;

            for(let i = 0; i < pdo.dataObjects.length; ++i) {
                const index = pdo.dataObjects[i].index;
                const entry = this.device.dataObjects[index];
                const size = entry.raw.length;

                message.data.copy(entry.raw, 0, dataOffset, dataOffset + size);
                dataOffset += size;

                const newValue = entry.value;
                if(pdo.lastValue != newValue) {
                    pdo.lastValue = newValue;
                    updated.push(entry);
                }
            }
        }

        if(updated.length > 0)
            this.device.emit('pdo', updated);
    }

    /** Parse a PDO communication/mapping parameter.
     * @private
     * @param {number} index - entry index.
     * @param {DataObject} entry - entry to parse.
     */
    _parsePDO(index, entry) {
        /* sub-index 1:
         *   bit 0..10      11-bit CAN base frame.
         *   bit 11..28     29-bit CAN extended frame.
         *   bit 29         Frame type.
         *   bit 30         RTR allowed.
         *   bit 31         TPDO valid.
         */
        let cobId = entry[1].value;
        if(!cobId || ((cobId >> 31) & 0x1) == 0x1)
            return;

        if(((cobId >> 29) & 0x1) == 0x1)
            throw TypeError("CAN extended frames are not supported.")

        cobId &= 0x7FF;
        if((cobId & 0xF) == 0x0)
            cobId |= this.device.id;

        /* sub-index 2:
         *   bit 0..7       Transmission type.
         */
        const transmissionType = entry[2].value;

        /* sub-index 3:
         *   bit 0..15      Inhibit time.
         */
        const inhibitTime = entry[3].value;

        /* sub-index 5:
         *   bit 0..15      Event timer value.
         */
        const eventTime = entry[5].value;

        /* sub-index 6:
         *   bit 0..7       SYNC start value.
         */
        const syncStart = entry[6].value;

        let pdo = {
            cobId:          cobId,
            type:           transmissionType,
            inhibitTime:    inhibitTime,
            eventTime:      eventTime,
            syncStart:      syncStart,
            dataObjects:    [],
            dataSize:       0,
        };

        const mapIndex = index + 0x200;
        const mapEntry = this.device.EDS.getEntry(mapIndex);
        if(!mapEntry) {
            throw new DeviceError(
                `Missing TPDO mapping parameter 0x${mapIndex.toString(16)}`);
        }

        if(mapEntry[0].value == 0xFE)
            throw new DeviceError('SAM-MPDO not supported.');

        if(mapEntry[0].value == 0xFF)
            throw new DeviceError('DAM-MPDO not supported.');

        if(mapEntry[0].value > 0x40) {
            throw new DeviceError(
                `Invalid TPDO mapping value (${mapEntry[0].value}).`);
        }

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
}

module.exports=exports=PDO;
