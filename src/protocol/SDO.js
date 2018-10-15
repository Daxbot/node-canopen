 /** CANopen SDO abort codes.
  * @protected
  * @const {string}
  * @memberof SDO
  */
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

 /** CANopen SDO "Client Command Specifier" codes.
  * @private
  * @const {number}
  * @memberof SDO
  */
 const CCS = {
    DOWNLOAD_SEGMENT: 0,
    DOWNLOAD_INITIATE: 1,
    UPLOAD_INITIATE: 2,
    UPLOAD_SEGMENT: 3,
    ABORT: 4,
};

 /** CANopen SDO "Server Command Specifier" codes.
  * @private
  * @const {number}
  * @memberof SDO
  */
const SCS = {
    UPLOAD_SEGMENT: 0,
    DOWNLOAD_SEGMENT: 1,
    UPLOAD_INITIATE: 2,
    DOWNLOAD_INITIATE: 3,
    ABORT: 4,
};

class Transfer {
    constructor(context, init) {
        this.device = context.device;
        this.entry = context.entry;
        this.subIndex = context.subIndex;
        this.timeout = context.timeout;
        this.size = context.size;

        this._init = init;
        this._resolve = context.resolve;
        this._reject = context.reject;

        this.toggle = 0;
        this.buffer = Buffer.allocUnsafe(0);
    }

    _send(buffer) {
        const id = 0x600 + this.device.deviceId;
        this.device.channel.send({
            id:     id,
            ext:    false,
            rtr:    false,
            data:   buffer,
        });
    }

    start() {
        this.timer = setTimeout( () => { this.abort(0x05040000); }, this.timeout);
        this._init();
    }

    resolve() {
        clearTimeout(this.timer);
        this._resolve();

    }

    reject(code) {
        clearTimeout(this.timer);
        this._reject(new Error(abortCodes[code]));
    }

    abort(code) {
        const sendBuffer = Buffer.alloc(8);
        sendBuffer[0] = 0x80;
        sendBuffer[1] = this.index;
        sendBuffer[2] = (this.index >> 8);
        sendBuffer[3] = this.subIndex;
        sendBuffer.writeUInt32LE(code, 4);
        this._send(sendBuffer);
        this.reject(code);
    }
}

/** CANopen SDO protocol handler. 
 * @param {Device} device - parent device.
 * @todo rework server state machine
 */
class SDO {
    constructor(device) {
        this.device = device;
        this.deviceId = device.deviceId;
        this.transfer = null;
        this.queue = [];
        this.server = {
            enable: false,
        };
    }

    get abortCodes() {
        return abortCodes;
    }

    /** Start serving SDO requests */
    serverStart() {
        this.server.enable = true;
    }

    /** Stop serving SDO requests */
    serverStop() {
        this.server.enable = false;
        if(this.server.timer) {
            clearTimeout(this.server.timer);
            this.server.timer = null;
        }
    }

    /** Upload the value from the remote device to the local copy.
     * @param {object | number | string} index - entry or index to upload.
     * @param {number} subIndex - data subIndex to upload.
     * @param {number} timeout - time before transfer is aborted.
     */
    upload(entry, subIndex=0, timeout=1000) {
        if(Array.isArray(entry)) {
            for(let i = 0; i < entry.length; i++) {
                return this.upload(entry[i], subIndex, timeout);
            }
        }

        return new Promise((resolve, reject) => {
            if(typeof(entry) != 'object') {
                entry = this.device.getEntry(entry);
                if(!entry) reject(new Error(abortCodes[0x06020000]));
            }

            const context = {
                device: this.device,
                entry: entry,
                subIndex: subIndex,
                timeout: timeout,
                resolve: resolve,
                reject: reject,
            };

            const transfer = new Transfer(context, () => {
                const sendBuffer = Buffer.alloc(8);
                sendBuffer[0] = (CCS.UPLOAD_INITIATE << 5);
                sendBuffer[1] = entry.index;
                sendBuffer[2] = (entry.index >> 8);
                sendBuffer[3] = subIndex;

                this.device.channel.send({
                    id:     0x600 + this.deviceId,
                    ext:    false,
                    rtr:    false,
                    data:   sendBuffer,
                });
            });

            if(!this.transfer) {
                this.transfer = transfer;
                transfer.start();
            }
            else this.queue.push(transfer);
        });
    }

    /** Download the value from the local copy to the remote device. 
     * @param {object | number | string} index - entry or index to download.
     * @param {number} subIndex - data subIndex to download.
     * @param {number} timeout - time before transfer is aborted.
     */
    download(entry, subIndex=0, timeout=1000) {
        if(Array.isArray(entry)) {
            for(let i = 0; i < entry.length; i++) {
                return this.download(entry[i], subIndex, timeout);
            }
        }

        return new Promise((resolve, reject) => {
            if(typeof(entry) != 'object') {
                entry = this.device.getEntry(entry);
                if(!entry) reject(new Error(abortCodes[0x06020000]));
            }

            if(!entry.data[subIndex])
                reject(new Error(abortCodes[0x06090011]));

            const size = entry.data[subIndex].size;
            const context = {
                device: this.device,
                entry: entry,
                subIndex: subIndex,
                timeout: timeout,
                size: size,
                resolve: resolve,
                reject: reject,
            };

            const transfer = new Transfer(context, () => {
                const sendBuffer = Buffer.alloc(8);
                sendBuffer[1] = entry.index;
                sendBuffer[2] = (entry.index >> 8);
                sendBuffer[3] = subIndex;

                if(size <= 4) {
                    // Expedited transfer
                    sendBuffer[0] = (CCS.DOWNLOAD_INITIATE << 5);
                    sendBuffer[0] |= ((4-size) << 2) | 0x2;
                    for(let i = 0; i < size; i++)
                        sendBuffer[4+i] = entry.data[subIndex].raw[i];

                    if(size < 4)
                        sendBuffer[0] |= ((4 - size) << 2) | 0x1;
                }
                else {
                    // Segmented transfer
                    sendBuffer[0] = (CCS.DOWNLOAD_INITIATE << 5) | 0x1;
                    sendBuffer[4] = size;
                    sendBuffer[5] = size >> 8;
                    sendBuffer[6] = size >> 16;
                    sendBuffer[7] = size >> 24;
                }

                this.device.channel.send({
                    id:     0x600 + this.deviceId,
                    ext:    false,
                    rtr:    false,
                    data:   sendBuffer,
                });
            });

            if(!this.transfer) {
                this.transfer = transfer;
                transfer.start();
            }
            else this.queue.push(transfer);
        });
    }

    /** Handle transfers as a client.
     * @private
     * @param {Object} message - CAN frame to parse.
     */
    _clientProcess(message) {
        if(!this.transfer)
            return;

        const data = message.data;
        switch(data[0] >> 5) {
            case SCS.ABORT:
                this._clientReject(data.readUInt32LE(4));
                break;
            case SCS.UPLOAD_INITIATE:
                this._clientUploadInitiate(data);
                break;
            case SCS.UPLOAD_SEGMENT:
                this._clientUploadSegment(data);
                break;
            case SCS.DOWNLOAD_INITIATE:
                this._clientDownloadInitiate(data); 
                break;
            case SCS.DOWNLOAD_SEGMENT:
                this._clientDownloadSegment(data);
                break;
            default:
                this.transfer.abort(0x05040001);
                break;
        }
    }

    _clientResolve() {
        this.transfer.resolve();
        this.transfer = this.queue.shift();
        if(this.transfer) this.transfer.start();
    }

    _clientReject(code) {
        this.transfer.reject(code);
        this.transfer = this.queue.shift();
        if(this.transfer) this.transfer.start();
    }

    _clientUploadInitiate(data) {
        if(data[0] & 0x02) {
            // Expedited transfer
            const size = (data[0] & 1) ? (4 - ((data[0] >> 2) & 3)) : 4;
            const entry = this.transfer.entry;
            const subIndex = this.transfer.subIndex;
            const dataType = entry.data[subIndex].type;
            const raw = Buffer.from(data.slice(4, size+4));
            const value = this.device.rawToType(raw, dataType);

            entry.data[subIndex] = {
                value:  value,
                type:   dataType,
                raw:    raw,
                size:   size,
            };
            this._clientResolve();
        }
        else {
            // Segmented transfer
            const sendBuffer = Buffer.alloc(8);
            sendBuffer[0] = (CCS.UPLOAD_SEGMENT << 5);

            if(data[0] & 0x1)
                this.transfer.size = data.readUInt32LE(4);

            this.device.channel.send({
                id: 0x600 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        }
    }

    _clientUploadSegment(data) {
        if((data[0] & 0x10) != (this.transfer.toggle << 4)) 
            this._clientAbort(0x05030000);

        const count = (7 - ((data[0] >> 1) & 0x7));
        const payload = data.slice(1, count+1);
        const size = this.transfer.buffer.length + count;
        const buffer = Buffer.concat([this.transfer.buffer, payload], size);

        if(data[0] & 1) {
            const entry = this.transfer.entry;
            const dataType = entry.data[this.transfer.subIndex].type;
            const value = this.device.rawToType(buffer, dataType);

            entry.data[this.transfer.subIndex] = {
                value:  value,
                type:   dataType,
                raw:    buffer,
                size:   size,
            };

            if(this.transfer.size == size)
                this._clientResolve();
            else
                this._clientReject(0x06070010);
        }
        else {
            this.transfer.toggle ^= 1;
            this.transfer.buffer = buffer;

            const sendBuffer = Buffer.alloc(8);
            sendBuffer[0] = (CCS.UPLOAD_SEGMENT << 5);
            sendBuffer[0] |= (this.transfer.toggle << 4);

            this.device.channel.send({
                id: 0x600 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        }
    }

    _clientDownloadInitiate(data) {
        if(this.transfer.size <= 4) {
            // Expedited transfer
            this._clientResolve();
        }
        else {
            const sendBuffer = Buffer.alloc(8);
            const count = Math.min(7, this.transfer.size);
            const entry = this.transfer.entry;
            const subIndex = this.transfer.subIndex;

            for(let i = 0; i < count; i++)
                sendBuffer[1+i] = entry.data[subIndex].raw[i];

            this.transfer.bufferOffset = count;

            sendBuffer[0] = (CCS.DOWNLOAD_SEGMENT << 5);
            sendBuffer[0] |= (7-count) << 1;
            if(this.transfer.bufferOffset == this.transfer.size)
                sendBuffer[0] |= 1;

            this.device.channel.send({
                id: 0x600 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        }
    }

    _clientDownloadSegment(data)
    {
        if((data[0] & 0x10) != (this.transfer.toggle << 4))
            this.transfer.abort(0x05030000);

        const bufferOffset = this.transfer.bufferOffset;
        const size = this.transfer.size;

        if(bufferOffset < size) {
            const sendBuffer = Buffer.alloc(8);
            const count = Math.min(7, (size - bufferOffset));
            const entry = this.transfer.entry;
            const subIndex = this.transfer.subIndex;

            for(let i = 0; i < count; i++)
                sendBuffer[1+i] = entry.data[subIndex].raw[bufferOffset+i];

            this.transfer.toggle ^= 1;
            this.transfer.bufferOffset += count;

            sendBuffer[0] = (CCS.DOWNLOAD_SEGMENT << 5);
            sendBuffer[0] |= (this.transfer.toggle << 4) | (7-count) << 1;
            if(this.transfer.bufferOffset == size)
                sendBuffer[0] |= 1;

            this.device.channel.send({
                id: 0x600 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        }
        else this._clientResolve();
    }

    /** Handle transfers as a server. 
     * @private
     * @param {Object} message - CAN frame to parse.
     */
    _serverProcess(message) {
        if(!this.server.enable)
            return;

        const data = message.data;
        switch(data[0] >> 5)
        {
            case CCS.ABORT:
                if(this.server.timer) {
                    clearTimeout(this.server.timer);
                    this.server.timer = null;
                }
                break;
            case CCS.DOWNLOAD_INITIATE:
                this._serverDownloadInitiate(data);
                break;
            case CCS.UPLOAD_INITIATE:
                this._serverUploadInitiate(data);
                break;
            case CCS.UPLOAD_SEGMENT:
                this._serverUploadSegment(data);
                break;
            case CCS.DOWNLOAD_SEGMENT:
                this._serverDownloadSegment(data);
                break;
            default:
                this._serverAbort(0x05040001);
                break;
        }
    }

    _serverAbort(code) {
        const sendBuffer = Buffer.alloc(8);
        sendBuffer[0] = 0x80;
        sendBuffer[1] = this.server.index;
        sendBuffer[2] = (this.server.index >> 8);
        sendBuffer[3] = this.server.subIndex;
        sendBuffer.writeUInt32LE(code, 4);

        this.device.channel.send({
            id: 0x580 + this.deviceId,
            ext: false,
            rtr: false,
            data: sendBuffer,
        });

        if(this.server.timer) {
            clearTimeout(this.server.timer);
            this.server.timer = null;
        }
    }

    _serverDownloadInitiate(data) {
        const index = (data.readUInt16LE(1));
        const entry = this.device.getEntry(index);
        if(!entry)
            return this._serverAbort(0x06020000)

        const subIndex = (data.readUInt8(3));
        if(!entry.data[subIndex])
            return this._serverAbort(0x06090011)

        if(data[0] & 0x02) {
            // Expedited transfer
            const count = (data[0] & 1) ? (4 - ((data[0] >> 2) & 3)) : 4;
            const dataType = entry.data[subIndex].type;
            const raw = data.slice(4, count+4);

            entry.data[subIndex] = {
                value:  this.device.rawToType(raw, dataType),
                type:   dataType,
                raw:    raw,
                size:   raw.length,
            };

            const sendBuffer = Buffer.alloc(8);
            sendBuffer[0] = (SCS.DOWNLOAD_INITIATE << 5);
            sendBuffer[1] = entry.index;
            sendBuffer[2] = (entry.index >> 8);
            sendBuffer[3] = subIndex;

            this.device.channel.send({
                id: 0x580 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        }
        else {
            // Segmented transfer
            const sendBuffer = Buffer.alloc(8);
            sendBuffer[0] = (SCS.DOWNLOAD_INITIATE << 5);
            sendBuffer[1] = index;
            sendBuffer[2] = (index >> 8);
            sendBuffer[3] = subIndex;

            this.server.index = index;
            this.server.subIndex = subIndex;
            this.server.toggle = 0;
            this.server.buffer = Buffer.from([]);
            this.server.timer = setTimeout( () => { this._serverAbort(0x05040000); }, 1000);

            this.device.channel.send({
                id: 0x580 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        }
    }

    _serverUploadInitiate(data) {
        const index = (data.readUInt16LE(1));
        const entry = this.device.getEntry(index);
        if(!entry)
            return this._serverAbort(0x06020000)

        const subIndex = (data.readUInt8(3));
        if(!entry.data[subIndex])
            return this._serverAbort(0x06090011)

        const size = entry.data[subIndex].size;

        if(size <= 4) {
            // Expedited transfer
            const sendBuffer = Buffer.alloc(8);
            sendBuffer[0] = (SCS.UPLOAD_INITIATE << 5);
            sendBuffer[0] |= ((4-size) << 2) | 0x2;
            sendBuffer[1] = entry.index;
            sendBuffer[2] = (entry.index >> 8);
            sendBuffer[3] = subIndex;
            for(let i = 0; i < size; i++)
                sendBuffer[4+i] = entry.data[subIndex].raw[i];

            if(size < 4)
                sendBuffer[0] |= ((4 - size) << 2) | 0x1;

            this.device.channel.send({
                id: 0x580 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        }
        else {
            // Segmented transfer
            const sendBuffer = Buffer.alloc(8);
            sendBuffer[0] = (SCS.UPLOAD_INITIATE << 5) | 0x1;
            sendBuffer[1] = entry.index;
            sendBuffer[2] = (entry.index >> 8);
            sendBuffer[3] = subIndex;
            sendBuffer[4] = size;
            sendBuffer[5] = size >> 8;
            sendBuffer[6] = size >> 16;
            sendBuffer[7] = size >> 24;

            this.server.index = index;
            this.server.subIndex = subIndex;
            this.server.toggle = 0;
            this.server.bufferOffset = 0;
            this.server.timer = setTimeout( () => { this._serverAbort(0x05040000); }, 1000);

            this.device.channel.send({
                id: 0x580 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        }
    }

    _serverUploadSegment(data) {
        if((data[0] & 0x10) == (this.server.toggle << 4)) {
            const entry = this.device.getEntry(this.server.index);
            const subIndex = this.server.subIndex;
            const size = entry.data[subIndex].size;
            const bufferOffset = this.server.bufferOffset;
            const sendBuffer = Buffer.alloc(8);

            let count = Math.min(7, (size - bufferOffset));
            for(let i = 0; i < count; i++)
                sendBuffer[1+i] = entry.data[subIndex].raw[bufferOffset+i];

            for(let i = count; i < 7; i++)
                sendBuffer[1+i] = 0;

            this.server.bufferOffset += count;

            sendBuffer[0] = (this.server.toggle << 4) | (7-count) << 1;
            this.server.toggle ^= 1;

            if(this.server.bufferOffset == size) {
                sendBuffer[0] |= 1;
                clearTimeout(this.server.timer);
                this.server.timer = null;
            }

            this.device.channel.send({
                id: 0x580 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        }
        else this._serverAbort(0x05030000);
    }

    _serverDownloadSegment(data) {
        if((data[0] & 0x10) == (this.server.toggle << 4)) {
            const count = (7 - ((data[0] >> 1) & 0x7));
            const payload = data.slice(1, count+1);
            const size = this.server.buffer.length + count;

            this.server.buffer = Buffer.concat([this.server.buffer, payload], size);

            if(data[0] & 1) {
                const entry = this.device.getEntry(this.server.index);
                const dataType = entry.data[this.server.subIndex].type;

                entry.data[this.server.subIndex] = {
                    value:  this.device.rawToType(this.server.buffer, dataType),
                    type:   dataType,
                    raw:    this.server.buffer,
                    size:   this.server.buffer.length,
                };

                clearTimeout(this.server.timer);
                this.server.timer = null;
            }

            const sendBuffer = Buffer.alloc(8);
            sendBuffer[0] = (SCS.DOWNLOAD_SEGMENT << 5);
            sendBuffer[0] |= (this.server.toggle << 4);
            this.server.toggle ^= 1;

            this.device.channel.send({
                id: 0x580 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        }
        else this._serverAbort(0x05030000);
    }
}

module.exports=exports=SDO;
