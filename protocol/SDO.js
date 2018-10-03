const abortCodes = {
    0x05030000: "Toggle bit not altered",
    0x05040000: "SDO protocol timed out",
    0x05040001: "Command specifier not valid or unknown",
    0x05040002: "Invalid block size in block mode",
    0x05040003: "Invalid sequence number in block mode",
    0x05040004: "CRC error (block mode only)",
    0x05040005: "Out of memory",
    0x06010000: "Unsupported access to an object",
    0x06010001: "Attempt to read a write only object",
    0x06010002: "Attempt to write a read only object",
    0x06020000: "Object does not exist",
    0x06040041: "Object cannot be mapped to the PDO",
    0x06040042: "Number and length of object to be mapped exceeds PDO length",
    0x06040043: "General parameter incompatibility reasons",
    0x06040047: "General internal incompatibility in device",
    0x06060000: "Access failed due to hardware error",
    0x06070010: "Data type does not match: length of service parameter does not match",
    0x06070012: "Data type does not match: length of service parameter too high",
    0x06070013: "Data type does not match: length of service parameter too short",
    0x06090011: "Sub index does not exist",
    0x06090030: "Invalid value for parameter (download only).",
    0x06090031: "Value range of parameter written too high",
    0x06090032: "Value range of parameter written too low",
    0x06090036: "Maximum value is less than minimum value.",
    0x060A0023: "Resource not available: SDO connection",
    0x08000000: "General error",
    0x08000020: "Data cannot be transferred or stored to application",
    0x08000021: "Data cannot be transferred or stored to application because of local control",
    0x08000022: "Data cannot be transferred or stored to application because of present device state",
    0x08000023: "Object dictionary not present or dynamic generation fails",
    0x08000024: "No data available",
};

const SCS = {
    UPLOAD_SEGMENT: 0,
    DOWNLOAD_SEGMENT: 1,
    UPLOAD_INITIATE: 2,
    DOWNLOAD_INITIATE: 3,
    ABORT: 4,
}

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
    }

    upload(index, subIndex, timeout=1000)
    {
        return new Promise((resolve, reject)=>
        {
            let entry = this.device.get(index);
            if(entry == undefined)
                reject("'" + index + "' not a data object");

            if(Array.isArray(entry))
                reject("'" + index + "' name is not unique")

            const timer = setTimeout(()=>{ reject(abortCodes[0x05040000]); }, timeout);

            this.message.data[0] = 0x40;
            this.message.data[1] = entry.index;
            this.message.data[2] = (entry.index >> 8);
            this.message.data[3] = subIndex;
            this.message.data.fill(0, 4);

            const buffer = Buffer.alloc(entry.size[subIndex]);

            let bufferOffset = 0;
            let toggle = 1;

            const handler = (data)=>
            {
                switch(data[0] >> 5)
                {
                    case SCS.ABORT:
                        clearTimeout(timer);
                        this.device.removeListener("SDO", handler);
                        reject(abortCodes[data.readUInt32LE(4)]);
                        break;

                    case SCS.UPLOAD_INITIATE:
                        if(data[0] & 0x02)
                        {
                            // Expedited transfer
                            const count = (data[0] & 1) ? (data[0] >> 2) & 3 : 4;
                            for(let i = 0; i < count; i++)
                                buffer[i] = data[i+1];

                            entry.value[subIndex] = this.device._rawToType(buffer, entry.dataType);
                            entry.raw[subIndex] = buffer;
                            entry.size[subIndex] = buffer.length;
                            this.device.removeListener("SDO", handler);
                            resolve();
                        }
                        else
                        {
                            // Segmented transfer
                            toggle ^= 1;
                            this.message.data[0] = 0x60 | (toggle << 4);
                            this.message.data.fill(0, 1);
                            this.device.channel.send(this.message);
                        }
                        break;
                    case SCS.UPLOAD_SEGMENT:
                        if((data[0] & 0x10) == (toggle << 4))
                        {
                            const count = (7 - ((data[0] >> 1) & 0x7));
                            for(let i = 0; i < count; i++)
                                buffer[bufferOffset+i] = data[1+i];

                            bufferOffset += count;

                            if(data[0] & 1)
                            {
                                entry.value[subIndex] = this.device._rawToType(buffer, entry.dataType);
                                entry.raw[subIndex] = buffer;
                                entry.size[subIndex] = buffer.length;
                                this.device.removeListener("SDO", handler);
                                resolve();
                            }
                            else
                            {
                                toggle ^= 1;
                                this.message.data[0] = 0x60 | (toggle << 4);
                                this.message.data.fill(0, 1);
                                this.device.channel.send(this.message);
                            }
                        }
                        break;
                }
            }
            this.device.on("SDO", handler);
            this.device.channel.send(this.message);
        });
    }

    download(index, subIndex, value, timeout=1000)
    {
        return new Promise((resolve, reject)=>
        {
            let entry = this.device.get(index);
            if(entry == undefined)
                reject("'" + index + "' not a data object");

            if(Array.isArray(entry))
                reject("'" + index + "' name is not unique")

            const timer = setTimeout(()=>{ reject(abortCodes[0x05040000]); }, timeout);

            this.message.data[1] = entry.index;
            this.message.data[2] = (entry.index >> 8);
            this.message.data[3] = subIndex;

            const raw = this.device._typeToRaw(value, entry.dataType)
            const size = raw.length;

            let bufferOffset = 0;
            let toggle = 1;

            if(size <= 4)
            {
                // Expedited transfer
                this.message.data[0] = 0x23 | ((4-size) << 2);
                for(let i = 0; i < size; i++)
                    this.message.data[4+i] = raw[i];

                bufferOffset = size;
            }
            else
            {
                // Segmented transfer
                this.message.data[0] = 0x21;
                this.message.data[4] = size;
                this.message.data[5] = size >> 8;
                this.message.data[6] = size >> 16;
                this.message.data[7] = size >> 24;
            }

            const handler = (data)=>
            {
                switch(data[0] >> 5)
                {
                    case SCS.ABORT:
                        clearTimeout(timer);
                        this.device.removeListener("SDO", handler);
                        reject(abortCodes[data.readUInt32LE(4)]);
                        break;
                    case SCS.DOWNLOAD_SEGMENT:
                        if((data[0] & 0x10) != (toggle << 4))
                            break;

                        toggle ^= 1;
                    case SCS.DOWNLOAD_INITIATE:
                        if(bufferOffset < size)
                        {
                            let count = Math.min(7, (size - bufferOffset));
                            for(let i = 0; i < count; i++)
                                this.message.data[1+i] = raw[bufferOffset+i];

                            for(let i = count; i < 7; i++)
                                this.message.data[1+i] = 0;

                            bufferOffset += count;
                            toggle ^= 1;

                            this.message.data[0] = (toggle << 4) | (7-count) << 1;
                            if(bufferOffset == size)
                                this.message.data[0] |= 1;

                            this.device.channel.send(this.message);
                        }
                        else
                        {
                            clearTimeout(timer);
                            entry.value[subIndex] = value;
                            entry.size[subIndex] = size;
                            entry.raw[subIndex] = raw;
                            this.device.removeListener("SDO", handler);
                            resolve();
                        }
                        break;
                }
            }
            this.device.on("SDO", handler);
            this.device.channel.send(this.message);
        });
    }
};

module.exports=exports=SDO;
