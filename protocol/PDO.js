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
        for(const [index, data] of Object.entries(this.device.dataObjects))
        {
            if((index & 0xFF00) == 0x1800)
            {
                let objectId = data.value[1];
                if(defaultTPDOs.includes(objectId))
                    objectId += this.device.deviceId;

                this.TPDO[objectId] = {
                    type: data.value[2],
                    inhibitTime: data.value[3],
                    eventTime: data.value[5],
                    syncStart: data.value[6],
                    map: [],
                };

                const map = this.device.dataObjects[0x1A00 + (index & 0xFF)];
                for(let j = 1; j < map.value.length; j++)
                {
                    this.TPDO[objectId].map[j-1] = {
                        index:      (map.value[j] >> 16),
                        subIndex:   (map.value[j] >> 8) & 0xFF,
                        bitLength:  (map.value[j] & 0xFF),
                    }
                }
            }
            else if((index & 0xFF00) == 0x1400)
            {
                let objectId = data.value[1];
                if(defaultRPDOs.includes(objectId))
                    objectId += this.device.deviceId;

                this.RPDO[objectId] = {
                    type: data.value[2],
                    map: [],
                };

                const map = this.device.dataObjects[0x1600 + (index & 0xFF)];
                for(let j = 1; j < map.value.length; j++)
                {
                    this.RPDO[objectId].map[j-1] = {
                        index:      (map.value[j] >> 16),
                        subIndex:   (map.value[j] >> 8) & 0xFF,
                        bitLength:  (map.value[j] & 0xFF),
                    }
                }
            }
        }
    }

    parse(message)
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

                for(let j = 0; j < bitLength/8; j++)
                {
                    entry.raw[subIndex][j] = message.data[dataOffset+j];
                    dataOffset += 1;
                }
                entry.value[subIndex] = this.device._rawToType(entry.raw[subIndex], entry.dataType);
            }
        }
    }
};

module.exports=exports=PDO;