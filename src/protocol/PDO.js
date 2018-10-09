/** PDO communication object identifiers are formed from the baseCOB + deviceId.
 * 
 * @private
 * @const {number}
 * @memberof PDO
 */
const baseCOB = [0x180, 0x200, 0x280, 0x300, 0x380, 0x400, 0x480, 0x500];

/** CANopen PDO protocol handler. 
 * @param {Device} device - parent device.
 */
class PDO {
    constructor(device) {
        this.device = device;
        this.map = {};
    }

    /** Initialize PDO mapping from the parent's dataObjects */
    init() {
        for(const [index, entry] of Object.entries(this.device.dataObjects)) {
            if((index & 0xFF00) == 0x1800) {
                let objectId = entry.data[1].value;
                if(baseCOB.includes(objectId))
                    objectId += this.device.deviceId;

                objectId = objectId.toString(16);
                this.map[objectId] = {
                    type:           entry.data[2].value,
                    inhibitTime:    entry.data[3].value,
                    eventTime:      entry.data[5].value,
                    syncStart:      entry.data[6].value,
                    size:           0,
                    dataObjects:    [],
                };

                const mapEntry = this.device.dataObjects[0x1A00 + (index & 0xFF)];
                for(let j = 1; j < mapEntry.data.length; j++) {
                    const mapIndex = (mapEntry.data[j].value >> 16);
                    const mapSubIndex = (mapEntry.data[j].value >> 8) & 0xFF;
                    const mapBitLength = (mapEntry.data[j].value & 0xFF);

                    this.map[objectId].dataObjects[j-1] = {
                        index:      mapIndex,
                        subIndex:   mapSubIndex,
                        bitLength:  mapBitLength,
                    };
                    this.device.dataObjects[mapIndex].PDO = objectId;
                    this.map[objectId].size += mapBitLength/8;
                }
            }
            else if((index & 0xFF00) == 0x1400) {
                let objectId = entry.data[1].value;
                if(baseCOB.includes(objectId))
                    objectId += this.device.deviceId;

                objectId = objectId.toString(16);
                this.map[objectId] = {
                    type:           entry.data[2].value,
                    size:           0,
                    dataObjects:    [],
                };

                const mapEntry = this.device.dataObjects[0x1600 + (index & 0xFF)];
                for(let j = 1; j < mapEntry.data.length; j++) {
                    const mapIndex = (mapEntry.data[j].value >> 16);
                    const mapSubIndex = (mapEntry.data[j].value >> 8) & 0xFF;
                    const mapBitLength = (mapEntry.data[j].value & 0xFF);

                    this.map[objectId].dataObjects[j-1] = {
                        index:      mapIndex,
                        subIndex:   mapSubIndex,
                        bitLength:  mapBitLength,
                    };
                    this.device.dataObjects[mapIndex].PDO = objectId;
                    this.map[objectId].size += mapBitLength/8;
                }
            }
        }
    }

    /** Transmit PDOs. @todo check inhibit time. */
    transmit() {
        for(const [id, map] of Object.entries(this.map)) {
            const entryMap = map.dataObjects;
            const data = Buffer.alloc(this.map[id].size);
            let valueChanged = false;
            let dataOffset = 0;

            for(let i = 0; i < entryMap.length; i++) {
                const index = entryMap[i].index;
                const subIndex = entryMap[i].subIndex;
                const bitLength = entryMap[i].bitLength;
                const entry = this.device.dataObjects[index];

                for(let j = 0; j < bitLength/8; j++) {
                    data[dataOffset+j] = entry.data[subIndex].raw[j];
                    dataOffset += 1;
                }

                if(entry.data[subIndex].changed)
                    valueChanged = true;
            }

            if(valueChanged)
            {
                this.device.channel.send({
                    id:     parseInt(id, 16),
                    ext:    false,
                    rtr:    false,
                    data:   data,
                });
            }
        }
    }

    /** Parse a CANopen Emergency message.
     * @private
     * @param {Object} message - CAN frame to parse.
     */
    _process(message) {
        const id = (message.id.toString(16));
        if(id in this.map) {
            const map = this.map[id].dataObjects;
            let dataOffset = 0;

            for(let i = 0; i < map.length; i++) {
                const entry = this.device.dataObjects[map[i].index];
                const bitLength = map[i].bitLength;
                const subIndex = map[i].subIndex;

                const dataSize = entry.data[subIndex].size;
                const dataType = entry.data[subIndex].type;

                let raw = Buffer.alloc(dataSize);
                for(let j = 0; j < bitLength/8; j++) {
                    raw[j] = message.data[dataOffset+j];
                    dataOffset += 1;
                }
                entry.data[subIndex].value = this.device._rawToType(raw, dataType);
                entry.data[subIndex].raw = raw;
            }
        }
    }
}

module.exports=exports=PDO;
