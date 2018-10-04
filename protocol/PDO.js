const defaultTPDOs = [0x180, 0x280, 0x380, 0x480];
const defaultRPDOs = [0x200, 0x300, 0x400, 0x500];

class PDO
{
    constructor(device)
    {
        this.device = device;
        this.TPDO = {}
        this.RPDO = {}
    }

    init()
    {
        for(const [index, entry] of Object.entries(this.device.dataObjects))
        {
            if((index & 0xFF00) == 0x1800)
            {
                let objectId = entry.data[1].value;
                if(defaultTPDOs.includes(objectId))
                    objectId += this.device.deviceId;

                this.TPDO[objectId] = {
                    type:           entry.data[2].value,
                    inhibitTime:    entry.data[3].value,
                    eventTime:      entry.data[5].value,
                    syncStart:      entry.data[6].value,
                    size:           0,
                    map:            [],
                };

                const map = this.device.dataObjects[0x1A00 + (index & 0xFF)];
                for(let j = 1; j < map.data.length; j++)
                {
                    const mapIndex = (map.data[j].value >> 16);
                    const mapSubIndex = (map.data[j].value >> 8) & 0xFF;
                    const mapBitLength = (map.data[j].value & 0xFF);

                    this.TPDO[objectId].map[j-1] = {
                        index:      mapIndex,
                        subIndex:   mapSubIndex,
                        bitLength:  mapBitLength,
                    }

                    this.TPDO[objectId].size += mapBitLength/8;
                }
            }
            else if((index & 0xFF00) == 0x1400)
            {
                let objectId = entry.data[1].value;
                if(defaultRPDOs.includes(objectId))
                    objectId += this.device.deviceId;

                this.RPDO[objectId] = {
                    type:   entry.data[2].value,
                    size:   0,
                    map:    [],
                };

                const map = this.device.dataObjects[0x1600 + (index & 0xFF)];
                for(let j = 1; j < map.data.length; j++)
                {
                    const mapIndex = (map.data[j].value >> 16);
                    const mapSubIndex = (map.data[j].value >> 8) & 0xFF;
                    const mapBitLength = (map.data[j].value & 0xFF);

                    this.RPDO[objectId].map[j-1] = {
                        index:      mapIndex,
                        subIndex:   mapSubIndex,
                        bitLength:  mapBitLength,
                    }
                    this.device.dataObjects[mapIndex].PDO = objectId
                    this.RPDO[objectId].size += mapBitLength/8;
                }
            }
        }
    }

    transmit(id)
    {
        const map = this.RPDO[id].map;
        let dataOffset = 0;
        
        let data = Buffer.alloc(this.RPDO[id].size);
        for(let i = 0; i < map.length; i++)
        {
            const entry = this.device.dataObjects[map[i].index];
            const bitLength = map[i].bitLength;
            const subIndex = map[i].subIndex;

            for(let j = 0; j < bitLength/8; j++)
            {
                data[dataOffset+j] = entry.data[subIndex].raw[j];
                dataOffset += 1;
            }
        }

        this.device.channel.send({
            id: id,
            ext: false,
            rtr: false,
            data: data,
        });
    }

    _parse(message)
    {
        if(message.id in this.TPDO)
        {
            const map = this.TPDO[message.id].map;
            let dataOffset = 0;

            for(let i = 0; i < map.length; i++)
            {
                const entry = this.device.dataObjects[map[i].index];
                const bitLength = map[i].bitLength;
                const subIndex = map[i].subIndex;

                const dataSize = entry.data[subIndex].size;
                const dataType = entry.data[subIndex].type;

                let raw = Buffer.alloc(dataSize);
                for(let j = 0; j < bitLength/8; j++)
                {
                    raw[j] = message.data[dataOffset+j];
                    dataOffset += 1;
                }
                entry.data[subIndex].value = this.device._rawToType(raw, dataType);
                entry.data[subIndex].raw = raw;
            }
        }
    }
};

module.exports=exports=PDO;