const clientCommands = {
    CCS_DOWNLOAD_INITIATE : 1,
    CCS_DOWNLOAD_SEGMENT : 0,
    CCS_UPLOAD_INITIATE : 2,
    CCS_UPLOAD_SEGMENT : 3,
    CCS_ABORT : 4,
    CCS_UPLOAD_BLOCK : 5,
    CCS_DOWNLOAD_BLOCK : 6,
};

const serverCommands = {
    SCS_UPLOAD_INITIATE : 2,
    SCS_UPLAOD_SEGMENT : 0,
    SCS_DOWNLOAD_INITIATED : 3,
    SCS_DOWNLOAD_SEGMENT : 1,
    SCS_ABORT : 4,
    SCS_DOWNLOAD_BLOCK : 5,
    SCS_UPLOAD_BLOCK : 6,
};

class SDO
{
    constructor(device)
    {
        this.device = device
        this.message = {
            id: 0x600 + this.device.deviceId,
            ext: false,
            rtr: false,
            data: Buffer.alloc(8),
        };
        this.timeout = null;
    }

    read(index, subindex=0)
    {
        return new Promise((resolve, reject)=>{
            resolve();
        });
    }

    write(section, subindex=0, timeout=1000)
    {
        return new Promise((resolve, reject)=>{
            if(this.device[section] == undefined)
                reject('Not a data object');

            let dataSize, dataRaw;
            if(subindex == 0)
            {
                dataSize = this.device[section].size;
                dataRaw = this.device[section].raw;
            }
            else
            {
                dataSize = this.device[section][subindex].size;
                dataRaw = this.device[section][subindex].raw;
            }

            let index = this.device[section].index;
            this.message.data[1] = (index & 0xFF);
            this.message.data[2] = (index >> 8);
            this.message.data[3] = subindex;

            if(dataSize > 4)
            {
                // Segmented transfer
                this.message.data[0] = 0x21;
                this.message.data[4] = dataSize;
                this.message.data[5] = dataSize >> 8;
                this.message.data[6] = dataSize >> 16;
                this.message.data[7] = dataSize >> 24;
            }
            else
            {
                // Expedited transfer
                this.message.data[0] = 0x23 | ((4-dataSize) << 2);
                for(let i = 0; i < dataSize; i++)
                    this.message.data[4+i] = dataRaw[i];
            }

            this.device.channel.send(this.message);
            this.device.on("SDO"+index.toString(16), resolve);
            this.device.on("Abort"+index.toString(16), reject);
            setTimeout(()=>{ reject("SDO protocol timed out"); }, timeout);
        });
    }
};

module.exports=exports=SDO;
