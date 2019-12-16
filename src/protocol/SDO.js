 /** CANopen SDO abort codes.
  * @protected
  * @const {string}
  * @memberof SDO
  * @see CiA301 "Protocol SDO abort transfer" (§7.2.4.3.17)
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
    0x08000023: "Object dictionary not present or dynamic generation failed",
    0x08000024: "No data available",
};

/** CANOpen SDO abort error generator
 * @private
 * @param {number} abortCode - The abort code number to generate the error for
 * @returns {Error}
 */
function getSDOError(abortCode) {
    const error = new Error(abortCodes[abortCode]);
    error.code = abortCode;

    return error;
}

 /** CANopen SDO "Client Command Specifier" codes.
  * @private
  * @const {number}
  * @memberof SDO
  * @see CiA301 "SDO protocols" (§7.2.4.3)
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
  * @see CiA301 "SDO protocols" (§7.2.4.3)
  */
const SCS = {
    UPLOAD_SEGMENT: 0,
    DOWNLOAD_SEGMENT: 1,
    UPLOAD_INITIATE: 2,
    DOWNLOAD_INITIATE: 3,
    ABORT: 4,
};

/** Represents a SDO transfer.
 * @private
 * @param {Object} context - transfer context.
 * @param {function} init - callback to begin the transfer.
 * @memberof SDO
 */
class Transfer {
    constructor(context, init) {
        this.ctx = context;

        this._init = init;
        this._resolve = context.resolve;
        this._reject = context.reject;

        this.done = false;
        this.toggle = 0;
        this.buffer = Buffer.allocUnsafe(0);
        this.size = context.size;
        this.timer = null;
    }

    get entry() {
        return this.ctx.entry;
    }

    get subIndex() {
        return this.ctx.subIndex;
    }

    /** Begin the transfer. */
    start() {
        this.timer = setTimeout(
            () => { this.abort(0x05040000); },
            this.ctx.timeout
        );
        this._init(this.ctx);
    }

    /** Complete the transfer and resolve its promise. */
    resolve() {
        this.done = true;
        clearTimeout(this.timer);
        this._resolve();
    }

    /** Abort the transfer and reject its promise. */
    abort(code) {
        clearTimeout(this.timer);
        const sendBuffer = Buffer.alloc(8);
        sendBuffer[0] = 0x80;
        sendBuffer[1] = this.index;
        sendBuffer[2] = (this.index >> 8);
        sendBuffer[3] = this.subIndex;
        sendBuffer.writeUInt32LE(code, 4);

        this.ctx.channel.send({
            id:     0x600 + this.ctx.deviceId,
            ext:    false,
            rtr:    false,
            data:   sendBuffer,
        });

        this.done = true;
        this._reject(getSDOError(code));
    }
}

/** CANopen 'Service Data Object' protocol.
 *
 * This class provides methods for direct access to a Device's
 * object dictionary using the SDO protocol.
 *
 * @param {Device} device - parent device.
 * @see CiA301 "Service data objects (SDO)" (§7.2.4)
 * @todo implement block transfer
 */
class SDO {
    constructor(device) {
        this.device = device;
        this.deviceId = device.deviceId;
        this.transfer = null;
        this.queue_size = Infinity;
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
     * @param {Object | number | string} entry - entry, index, or name to upload.
     * @param {number} subIndex - data subIndex to upload.
     * @param {number} timeout - time before transfer is aborted.
     */
    upload(entry, subIndex=0, timeout=30) {
        if(Array.isArray(entry)) {
            for(let i = 0; i < entry.length; i++) {
                return this.upload(entry[i], subIndex, timeout);
            }
        }

        return new Promise((resolve, reject) => {
            if(typeof(entry) != 'object') {
                entry = this.device.getEntry(entry);
                if(!entry) {
                    // Bad entry
                    reject(getSDOError(0x06020000));
                    return;
                }
            }

            if(!entry.data[subIndex]) {
                // Bad subIndex
                reject(getSDOError(0x06090011));
                return;
            }

            if(!timeout) {
                // Bad timeout
                reject(getSDOError(0x05040000));
                return;
            }

            if(this.queue.length >= this.queue_size) {
                // Queue overflow
                reject(getSDOError(0x08000021));
                return;
            }

            const context = {
                deviceId: this.deviceId,
                channel: this.device.channel,
                entry: entry,
                subIndex: subIndex,
                timeout: timeout,
                resolve: resolve,
                reject: reject,
            };

            function init_upload(ctx) {
                const sendBuffer = Buffer.alloc(8);
                sendBuffer[0] = (CCS.UPLOAD_INITIATE << 5);
                sendBuffer[1] = ctx.entry.index;
                sendBuffer[2] = (ctx.entry.index >> 8);
                sendBuffer[3] = ctx.subIndex;

                ctx.channel.send({
                    id:     0x600 + ctx.deviceId,
                    ext:    false,
                    rtr:    false,
                    data:   sendBuffer,
                });
            };

            const transfer = new Transfer(context, init_upload);

            if(!this.transfer) {
                this.transfer = transfer;
                transfer.start();
            }
            else {
                this.queue.push(transfer);
            }
        })
        .finally(() => {
            if(!this.transfer || this.transfer.done) {
                // Start the next transfer
                this.transfer = this.queue.shift();
                if(this.transfer)
                    this.transfer.start();
            }
        });
    }

    /** Download the value from the local copy to the remote device.
     * @param {Object | number | string} entry - entry, index, or name to download.
     * @param {number} subIndex - data subIndex to download.
     * @param {number} timeout - time before transfer is aborted.
     */
    download(entry, subIndex=0, timeout=30) {
        if(Array.isArray(entry)) {
            for(let i = 0; i < entry.length; i++) {
                return this.download(entry[i], subIndex, timeout);
            }
        }

        return new Promise((resolve, reject) => {
            if(typeof(entry) != 'object') {
                entry = this.device.getEntry(entry);
                if(!entry) {
                    // Bad entry
                    reject(getSDOError(0x06020000));
                    return;
                }
            }

            if(!entry.data[subIndex]) {
                // Bad subIndex
                reject(getSDOError(0x06090011));
                return;
            }

            if(!timeout) {
                // Bad timeout
                reject(getSDOError(0x05040000));
                return;
            }

            if(this.queue.length >= this.queue_size) {
                // Queue overflow
                reject(getSDOError(0x08000021));
                return;
            }

            const context = {
                deviceId: this.deviceId,
                channel: this.device.channel,
                entry: entry,
                subIndex: subIndex,
                timeout: timeout,
                size: entry.data[subIndex].size,
                resolve: resolve,
                reject: reject,
            };

            function init_download(ctx) {
                const sendBuffer = Buffer.alloc(8);
                sendBuffer[1] = ctx.entry.index;
                sendBuffer[2] = (ctx.entry.index >> 8);
                sendBuffer[3] = ctx.subIndex;

                if(ctx.size <= 4) {
                    // Expedited transfer
                    sendBuffer[0] = (CCS.DOWNLOAD_INITIATE << 5);
                    sendBuffer[0] |= ((4-ctx.size) << 2) | 0x2;
                    for(let i = 0; i < ctx.size; i++)
                        sendBuffer[4+i] = ctx.entry.data[ctx.subIndex].raw[i];

                    if(ctx.size < 4)
                        sendBuffer[0] |= ((4 - ctx.size) << 2) | 0x1;
                }
                else {
                    // Segmented transfer
                    sendBuffer[0] = (CCS.DOWNLOAD_INITIATE << 5) | 0x1;
                    sendBuffer[4] = ctx.size;
                    sendBuffer[5] = ctx.size >> 8;
                    sendBuffer[6] = ctx.size >> 16;
                    sendBuffer[7] = ctx.size >> 24;
                }

                ctx.channel.send({
                    id:     0x600 + ctx.deviceId,
                    ext:    false,
                    rtr:    false,
                    data:   sendBuffer,
                });
            };

            const transfer = new Transfer(context, init_download);

            if(!this.transfer) {
                this.transfer = transfer;
                transfer.start();
            }
            else {
                this.queue.push(transfer);
            }
        })
        .finally(() => {
            if(!this.transfer || this.transfer.done) {
                // Start the next transfer
                this.transfer = this.queue.shift();
                if(this.transfer)
                    this.transfer.start();
            }
        });
    }

    /** Handle transfers as a client.
     * @param {Object} message - CAN frame to parse.
     */
    clientReceive(message) {
        const data = message.data;
        try {
            switch(data[0] >> 5) {
                case SCS.ABORT:
                    this._clientAbort(data.readUInt32LE(4));
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
        catch(e) {
            if(this.transfer) {
                this._clientAbort(0x08000000);
            }
        }
    }

    /** Resolve the current transfer.
     * @private
     */
    _clientResolve() {
        if(this.transfer)
            this.transfer.resolve();
    }

    /** Abort the current transfer.
     * @private
     */
    _clientAbort(code) {
        if(this.transfer)
            this.transfer.abort(code);
    }

    /** Handle SCS.UPLOAD_INITIATE.
     * @private
     * @param {Buffer} data - message data.
     */
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

            this.transfer.timer.refresh();

            this.device.channel.send({
                id: 0x600 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        }
    }

    /** Handle SCS.UPLOAD_SEGMENT.
     * @private
     * @param {Buffer} data - message data.
     */
    _clientUploadSegment(data) {
        if((data[0] & 0x10) != (this.transfer.toggle << 4)) {
            this._clientAbort(0x05030000);
            return;
        }

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
                this._clientAbort(0x06070010);
        }
        else {
            this.transfer.toggle ^= 1;
            this.transfer.buffer = buffer;

            const sendBuffer = Buffer.alloc(8);
            sendBuffer[0] = (CCS.UPLOAD_SEGMENT << 5);
            sendBuffer[0] |= (this.transfer.toggle << 4);

            this.transfer.timer.refresh();

            this.device.channel.send({
                id: 0x600 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        }
    }

    /** Handle SCS.DOWNLOAD_INITIATE.
     * @private
     * @param {Buffer} data - message data.
     */
    _clientDownloadInitiate(data) {
        if(this.transfer.size <= 4) {
            // Expedited transfer
            this._clientResolve();
            return;
        }

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

        this.transfer.timer.refresh();

        this.device.channel.send({
            id: 0x600 + this.deviceId,
            ext: false,
            rtr: false,
            data: sendBuffer,
        });
    }

    /** Handle SCS.DOWNLOAD_SEGMENT.
     * @private
     * @param {Buffer} data - message data.
     */
    _clientDownloadSegment(data)
    {
        if((data[0] & 0x10) != (this.transfer.toggle << 4)) {
            this.transfer.abort(0x05030000);
            return;
        }

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

            this.transfer.timer.refresh();

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
     * @param {Object} message - CAN frame to parse.
     */
    serverReceive(message) {
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

    /** Abort the current transfer.
     * @private
     * @param {number} code - abort code.
     */
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

    /** Handle CCS.DOWNLOAD_INITIATE.
     * @private
     * @param {Buffer} data - message data.
     */
    _serverDownloadInitiate(data) {
        const index = (data.readUInt16LE(1));
        const entry = this.device.getEntry(index);
        if(!entry)
            return this._serverAbort(0x06020000);

        const subIndex = (data.readUInt8(3));
        if(!entry.data[subIndex])
            return this._serverAbort(0x06090011);

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
            this.server.timer = setTimeout(
                () => { this._serverAbort(0x05040000); },
                100
            );

            this.device.channel.send({
                id: 0x580 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        }
    }

    /** Handle CCS.UPLOAD_INITIATE.
     * @private
     * @param {Buffer} data - message data.
     */
    _serverUploadInitiate(data) {
        const index = (data.readUInt16LE(1));
        const entry = this.device.getEntry(index);
        if(!entry)
            return this._serverAbort(0x06020000);

        const subIndex = (data.readUInt8(3));
        if(!entry.data[subIndex])
            return this._serverAbort(0x06090011);

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
            this.server.timer = setTimeout(
                () => { this._serverAbort(0x05040000); },
                100
            );

            this.device.channel.send({
                id: 0x580 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        }
    }

    /** Handle CCS.UPLOAD_SEGMENT.
     * @private
     * @param {Buffer} data - message data.
     */
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
            else {
                this.server.timer.refresh();
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

    /** Handle CCS.DOWNLOAD_SEGMENT.
     * @private
     * @param {Buffer} data - message data.
     */
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
            else {
                this.server.timer.refresh();
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
