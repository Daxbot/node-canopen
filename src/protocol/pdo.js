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
 */
class Pdo {
    constructor(device) {
        this.device = device;
        this.receiveMap = {};
        this.writeMap = {};
        this.eventTimers = {};
        this.events = [];
    }

    /** Initialize members and begin RPDO monitoring. */
    init() {
        this.load();
        this.device.addListener('message', this._onMessage.bind(this));
    }

    /** Load PDO configuration.  */
    load() {
        this.receiveMap = {};
        this.writeMap = {};

        for(let [index, entry] of Object.entries(this.device.dataObjects)) {
            index = parseInt(index);
            if((index & 0xFF00) == 0x1400 || (index & 0xFF00) == 0x1500) {
                // Object 0x1400..0x15FF - RPDO communication parameter
                if(entry[1] === undefined) {
                    index = `0x${index.toString(16)}`;
                    throw ReferenceError(
                        `COB-ID is mandatory for RPDO (${index})`);
                }

                if(entry[2] === undefined) {
                    index = `0x${index.toString(16)}`;
                    throw ReferenceError(
                        `transmission type is mandatory for RPDO (${index})`);
                }

                const pdo = this._parsePDO(index, entry);
                if(pdo)
                    this.receiveMap[pdo.cobId] = pdo;
            }
            else if((index & 0xFF00) == 0x1800 || (index & 0xFF00) == 0x1900) {
                // Object 0x1800..0x19FF - TPDO communication parameter
                if(entry[1] === undefined) {
                    index = `0x${index.toString(16)}`;
                    throw ReferenceError(
                        `COB-ID is mandatory for TPDO (${index})`);
                }

                if(entry[2] === undefined) {
                    index = `0x${index.toString(16)}`;
                    throw ReferenceError(
                        `transmission type is mandatory for TPDO (${index})`);
                }

                const pdo = this._parsePDO(index, entry);
                if(pdo)
                    this.writeMap[pdo.cobId] = pdo;
            }
        }
    }

    /** Begin TPDO generation. */
    start() {
        for(const [cobId, pdo] of Object.entries(this.writeMap)) {
            if(pdo.type < 0xF1) {
                const listener = (counter) => {
                    if(pdo.started) {
                        if(pdo.type == 0) {
                            // Acyclic - send only if data changed
                            this.write(cobId, true);
                        }
                        else if(++pdo.counter >= pdo.type) {
                            // Cyclic - send every 'n' sync objects
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
                    // Send on a timer
                    const timer = setInterval(() => {
                        this.write(cobId);
                    }, pdo.eventTime);

                    this.eventTimers[cobId] = timer;
                }
                else if(pdo.inhibitTime > 0) {
                    // Send on value change, but no faster than inhibit time
                    for(const dataObject of pdo.dataObjects) {
                        const listener = () => {
                            // TODO - fix this, it should keep track of the last
                            // send time and count off that rather than using
                            // a naive timer.
                            if(!this.eventTimers[cobId]) {
                                const timer = setTimeout(() => {
                                    this.eventTimers[cobId] = null;
                                    this.write(cobId);
                                }, pdo.inhibitTime);

                                this.eventTimers[cobId] = timer;
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
                        const listener = () => {
                            this.write(cobId);
                        }

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

    /** Stop TPDO generation. */
    stop() {
        for(const [emitter, eventName, listener] in this.events)
            emitter.removeListener(eventName, listener);

        for(const timer in Object.values(this.eventTimers))
            clearInterval(timer);

        this.eventTimers = {};
        this.events = [];
    }

    /**
     * Service: PDO write
     * @param {number} cobId - mapped TPDO to send.
     * @param {bool} update - only write if data has changed.
     */
    write(cobId, update=false) {
        const pdo = this.writeMap[cobId];
        if(!pdo)
            throw ReferenceError(`TPDO 0x${cobId.toString(16)} not mapped.`);

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
     * @param {Object} message - CAN frame.
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
     * @param {number} index - entry index.
     * @param {DataObject} entry - entry to parse.
     * @private
     */
    _parsePDO(index, entry) {
        /* sub-index 1 (mandatory):
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

        // Add the device id iff the provided id is a base value, e.g. 0x180.
        if((cobId % 0x80) == 0x0)
            cobId |= this.device.id;

        /* sub-index 2 (mandatory):
         *   bit 0..7       Transmission type.
         */
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

        const mapIndex = index + 0x200;
        const mapEntry = this.device.eds.getEntry(mapIndex);
        if(!mapEntry) {
            throw ReferenceError(
                `Missing TPDO mapping parameter 0x${mapIndex.toString(16)}`);
        }

        if(mapEntry[0].value == 0xFE)
            throw TypeError('SAM-MPDO not supported.');

        if(mapEntry[0].value == 0xFF)
            throw TypeError('DAM-MPDO not supported.');

        if(mapEntry[0].value > 0x40) {
            throw TypeError(
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

module.exports=exports={ Pdo };
