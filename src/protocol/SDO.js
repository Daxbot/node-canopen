 /** CANopen SDO abort codes.
  * @protected
  * @const {string}
  * @memberof SDO
  * @see CiA301 'Protocol SDO abort transfer' (§7.2.4.3.17)
  */
 const abortCodes = {
    0x05030000: 'Toggle bit not altered',
    0x05040000: 'SDO protocol timed out',
    0x05040001: 'Command specifier not valid or unknown',
    0x05040002: 'Invalid block size in block mode',
    0x05040003: 'Invalid sequence number in block mode',
    0x05040004: 'CRC error (block mode only)',
    0x05040005: 'Out of memory',
    0x06010000: 'Unsupported access to an object',
    0x06010001: 'Attempt to read a write only object',
    0x06010002: 'Attempt to write a read only object',
    0x06020000: 'Object does not exist',
    0x06040041: 'Object cannot be mapped to the PDO',
    0x06040042: 'Number and length of object to be mapped exceeds PDO length',
    0x06040043: 'General parameter incompatibility reasons',
    0x06040047: 'General internal incompatibility in device',
    0x06060000: 'Access failed due to hardware error',
    0x06070010: 'Data type does not match: length of service parameter does not match',
    0x06070012: 'Data type does not match: length of service parameter too high',
    0x06070013: 'Data type does not match: length of service parameter too short',
    0x06090011: 'Sub index does not exist',
    0x06090030: 'Invalid value for parameter (download only).',
    0x06090031: 'Value range of parameter written too high',
    0x06090032: 'Value range of parameter written too low',
    0x06090036: 'Maximum value is less than minimum value.',
    0x060A0023: 'Resource not available: SDO connection',
    0x08000000: 'General error',
    0x08000020: 'Data cannot be transferred or stored to application',
    0x08000021: 'Data cannot be transferred or stored to application because of local control',
    0x08000022: 'Data cannot be transferred or stored to application because of present device state',
    0x08000023: 'Object dictionary not present or dynamic generation failed',
    0x08000024: 'No data available',
};

 /** CANopen SDO 'Client Command Specifier' codes.
  * @private
  * @const {number}
  * @memberof SDO
  * @see CiA301 'SDO protocols' (§7.2.4.3)
  */
 const CCS = {
    DOWNLOAD_SEGMENT: 0,
    DOWNLOAD_INITIATE: 1,
    UPLOAD_INITIATE: 2,
    UPLOAD_SEGMENT: 3,
    ABORT: 4,
};

 /** CANopen SDO 'Server Command Specifier' codes.
  * @private
  * @const {number}
  * @memberof SDO
  * @see CiA301 'SDO protocols' (§7.2.4.3)
  */
const SCS = {
    UPLOAD_SEGMENT: 0,
    DOWNLOAD_SEGMENT: 1,
    UPLOAD_INITIATE: 2,
    DOWNLOAD_INITIATE: 3,
    ABORT: 4,
};

/** SDO transfer error.
 * @param {number} code - SDO abort code.
 */
class SDOError extends Error {
    constructor(code) {
        super(abortCodes(code));
        this.name = this.constructor.name;
        this.code = code;
        Error.captureStackTrace(this, this.constructor);
    }
}

/** Represents a SDO transfer.
 * @private
 * @memberof SDO
 */
class Transfer {
    constructor(args) {
        const {
            device,
            resolve,
            reject,
            index,
            subIndex,
            data,
            timeout,
            cobId,
        } = args;

        this._resolve = resolve;
        this._reject = reject;

        this.device = device;
        this.index = index;
        this.subIndex = subIndex;
        this.timeout = timeout;
        this.cobId = cobId;
        this.data = (data) ? data : Buffer.alloc(0);
        this.size = this.data.length;

        this.active = false;
        this.toggle = 0;
        this.timer = null;
    }

    /** Begin the transfer timeout. */
    start() {
        this.active = true;
        if(this._timeout) {
            this.timer = setTimeout(() => {
                this.abort(0x05040000);
            }, this._timeout);
        }
    }

    /** Refresh the transfer timeout. */
    refresh() {
        if(this._timeout)
            this.timer.refresh();
    }

    /** Complete the transfer and resolve its promise.
     * @param {Buffer | undefined} data - return data.
     */
    resolve(data) {
        this.active = false;
        clearTimeout(this.timer);
        if(this._resolve)
            this._resolve(data);
    }

    /** Complete the transfer and reject its promise.
     * @param {number} code - SDO abort code.
     */
    reject(code) {
        this.active = true;
        clearTimeout(this.timer);
        if(this._reject)
            this._reject(new SDOError(code));
    }
}

/** CANopen SDO protocol handler.
 *
 * The service data object (SDO) protocol uses a client-server structure where
 * a client can initiate the transfer of data from the server's object
 * dictionary. An SDO is transfered as a sequence of segments with basic
 * error checking.
 *
 * @param {Device} device - parent device.
 * @see CiA301 'Service data object (SDO)' (§7.2.4)
 */
class SDO {
    constructor(device) {
        this.device = device;
        this.clients = {};
        this._clientTransfers = {};
        this.servers = {}
        this._serverTransfers = {};
    }

    /** Begin serving SDO transfers. */
    init() {
        for(let [index, entry] of Object.entries(this.device.dataObjects)) {
            index = parseInt(index);
            if(0x1200 <= index && index < 0x1280) {
                /* Object 0x1200..0x127F - SDO server parameter.
                 *   sub-index 1/2:
                 *     bit 0..10      11-bit CAN base frame.
                 *     bit 11..28     29-bit CAN extended frame.
                 *     bit 29         Frame type (base or extended).
                 *     bit 30         Dynamically allocated.
                 *     bit 31         SDO exists / is valid.
                 *
                 *   sub-index 3 (optional):
                 *     bit 0..7      Node-ID of the SDO client.
                 */
                const clientId = (entry[3]) ? entry[3].value : 0;

                let cobIdRx = entry[1].value;
                if(!cobIdRx || ((cobIdRx >> 31) & 0x1) == 0x1)
                    continue;

                if(((cobIdRx >> 30) & 0x1) == 0x1)
                    throw TypeError('Dynamic assignment is not supported.');

                if(((cobIdRx >> 29) & 0x1) == 0x1)
                    throw TypeError('CAN extended frames are not supported.');

                cobIdRx &= 0x7FF;
                if((cobIdRx & 0xF) == 0x0)
                    cobIdRx |= this.device.id;

                let cobIdTx = entry[2].value;
                if(!cobIdTx || ((cobIdTx >> 31) & 0x1) == 0x1)
                    continue;

                if(((cobIdTx >> 30) & 0x1) == 0x1)
                    throw TypeError('Dynamic assignment is not supported.');

                if(((cobIdTx >> 29) & 0x1) == 0x1)
                    throw TypeError('CAN extended frames are not supported.');

                cobIdTx &= 0x7FF;
                if((cobIdTx & 0xF) == 0x0)
                    cobIdTx |= this.device.id;

                this.clients[clientId] = {
                    cobIdRx:    cobIdRx,
                    cobIdTx:    cobIdTx,
                };

                this._clientTransfers[cobIdRx] = new Transfer({
                    device:     this.device,
                    cobId:      cobIdTx
                });
            }
            else if(0x1280 <= index && index < 0x12FF) {
                /* Object 0x1280..0x12FF - SDO client parameter.
                 *   sub-index 1/2:
                 *     bit 0..10      11-bit CAN base frame.
                 *     bit 11..28     29-bit CAN extended frame.
                 *     bit 29         Frame type (base or extended).
                 *     bit 30         Dynamically allocated.
                 *     bit 31         SDO exists / is valid.
                 *
                 *   sub-index 3:
                 *     bit 0..7      Node-ID of the SDO server.
                 */
                const serverId = entry[3].value;
                if(!serverId)
                    throw new DeviceError('ID of the SDO server is required.');

                let cobIdTx = entry[1].value;
                if(!cobIdTx || ((cobIdTx >> 31) & 0x1) == 0x1)
                    continue;

                if(((cobIdTx >> 30) & 0x1) == 0x1)
                    throw TypeError('Dynamic assignment is not supported.');

                if(((cobIdTx >> 29) & 0x1) == 0x1)
                    throw TypeError('CAN extended frames are not supported.');

                cobIdTx &= 0x7FF;
                if((cobIdTx & 0xF) == 0x0)
                    cobIdTx |= serverId;

                let cobIdRx = entry[2].value;
                if(!cobIdRx || ((cobIdRx >> 31) & 0x1) == 0x1)
                    continue;

                if(((cobIdRx >> 30) & 0x1) == 0x1)
                    throw TypeError('Dynamic assignment is not supported.');

                if(((cobIdRx >> 29) & 0x1) == 0x1)
                    throw TypeError('CAN extended frames are not supported.');

                cobIdRx &= 0x7FF;
                if((cobIdRx & 0xF) == 0x0)
                    cobIdRx |= serverId;

                this.servers[serverId] = {
                    cobIdTx:    cobIdTx,
                    cobIdRx:    cobIdRx,
                    pending:    Promise.resolve(),
                };
            }
        }

        this.device.channel.addListener('onMessage', this._onMessage, this);
    }

    /** Service: SDO upload
     * @param {number} serverId - SDO server.
     * @param {number} index - data index to upload.
     * @param {number} subIndex - data subIndex to upload.
     * @param {number} timeout - time before transfer is aborted.
     */
    upload(serverId, index, subIndex=0, timeout=30) {
        let server = this.servers[serverId];
        if(server === undefined) {
            if(this.servers[0] === undefined)
                throw new DeviceError('0x1280 is required for upload.');

            server = this.servers[serverId] = {
                cobIdRx:    this.servers[0].cobIdRx,
                cobIdTx:    this.servers[0].cobIdTx,
                pending:    Promise.resolve(),
            };
        }

        if(index === undefined)
            throw ReferenceError("Must provide an index.");

        server.pending = server.pending.then(() => {
            return new Promise((resolve, reject) => {
                this._serverTransfers[server.cobIdRx] = new Transfer({
                    device:     this.device,
                    resolve:    resolve,
                    reject:     reject,
                    index:      index,
                    subIndex:   subIndex,
                    timeout:    timeout,
                    cobId:      server.cobIdTx,
                });

                const sendBuffer = Buffer.alloc(8);
                sendBuffer.writeUInt8(CCS.UPLOAD_INITIATE << 5);
                sendBuffer.writeUInt16LE(index, 1);
                sendBuffer.writeUInt8(subIndex, 3);

                this.device.channel.send({
                    id:     server.cobIdTx,
                    data:   sendBuffer
                });

                this._serverTransfers[server.cobIdRx].start();
            });
        });

        return server.pending;
    }

    /** Service: SDO download.
     * @param {number} serverId - SDO server.
     * @param {Buffer} data - data to download.
     * @param {number} index - index or name to download to.
     * @param {number} subIndex - data subIndex to download to.
     * @param {number} timeout - time before transfer is aborted.
     */
    download(serverId, data, index, subIndex=0, timeout=30) {
        let server = this.servers[serverId];
        if(server === undefined) {
            if(this.servers[0] === undefined)
                throw new DeviceError('0x1280 is required for download.');

            server = this.servers[serverId] = {
                cobIdRx:    this.servers[0].cobIdRx,
                cobIdTx:    this.servers[0].cobIdTx,
                pending:    Promise.resolve(),
            };
        }

        if(index === undefined)
            throw ReferenceError("Must provide an index.");

        if(!Buffer.isBuffer(data))
            throw ReferenceError("Must provide a Buffer.");

        server.pending = server.pending.then(() => {
            return new Promise((resolve, reject) => {
                this._serverTransfers[server.cobIdRx] = new Transfer({
                    device:     this.device,
                    resolve:    resolve,
                    reject:     reject,
                    index:      index,
                    subIndex:   subIndex,
                    data:       data,
                    timeout:    timeout,
                    cobId:      server.cobIdTx,
                });

                const sendBuffer = Buffer.alloc(8);
                let header = (CCS.DOWNLOAD_INITIATE << 5);

                sendBuffer.writeUInt16LE(index, 1);
                sendBuffer.writeUInt8(subIndex, 3);

                if(data.length > 4) {
                    /* Segmented transfer. */
                    sendBuffer.writeUInt8(header | 0x1);
                    sendBuffer.writeUInt32LE(data.length, 4);
                }
                else {
                    /* Expedited transfer. */
                    header |= ((4-data.length) << 2) | 0x2;
                    if(data.length < 4)
                        header |= ((4 - data.length) << 2) | 0x1;

                    sendBuffer.writeUInt8(header);
                    data.copy(sendBuffer, 4);
                }

                this.device.channel.send({
                    id:     server.cobIdTx,
                    data:   sendBuffer
                });

                this._serverTransfers[server.cobIdRx].start();
            });
        });

        return server.pending;
    }

    /** Handle SCS.UPLOAD_INITIATE.
     * @private
     * @param {Transfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     */
    _clientUploadInitiate(transfer, data) {
        if(data[0] & 0x02) {
            /* Expedited transfer. */
            const size = (data[0] & 1) ? (4 - ((data[0] >> 2) & 3)) : 4;
            transfer.resolve(data.slice(4, 4 + size));
        }
        else {
            /* Segmented transfer. */
            const sendBuffer = Buffer.alloc(8);
            sendBuffer.writeUInt8(CCS.UPLOAD_SEGMENT << 5);

            if(data[0] & 0x1)
                transfer.size = data.readUInt32LE(4);

            transfer.device.channel.send({
                id: transfer.cobId,
                data: sendBuffer
            });

            transfer.refresh();
        }
    }

    /** Handle SCS.UPLOAD_SEGMENT.
     * @private
     * @param {Transfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     */
    _clientUploadSegment(transfer, data) {
        if((data[0] & 0x10) != (transfer.toggle << 4))
            return _clientAbort(transfer, 0x05030000);

        const count = (7 - ((data[0] >> 1) & 0x7));
        const payload = data.slice(1, count+1);
        const size = transfer.data.length + count;
        const buffer = Buffer.concat([transfer.data, payload], size);

        if(data[0] & 1) {
            if(transfer.size != size)
                return _clientAbort(transfer, 0x06070010);

            transfer.resolve(buffer);
        }
        else {
            transfer.toggle ^= 1;
            transfer.data = buffer;

            const sendBuffer = Buffer.alloc(8);
            const header = (CCS.UPLOAD_SEGMENT << 5) | (transfer.toggle << 4);
            sendBuffer.writeUInt8(header);

            transfer.device.channel.send({
                id:     transfer.cobId,
                data:   sendBuffer
            });

            transfer.refresh();
        }
    }

    /** Handle SCS.DOWNLOAD_INITIATE.
     * @private
     * @param {Transfer} transfer - SDO context.
     */
    _clientDownloadInitiate(transfer) {
        if(transfer.size <= 4) {
            /* Expedited transfer. */
            transfer.resolve();
            return;
        }

        const sendBuffer = Buffer.alloc(8);
        transfer.size = Math.min(7, transfer.data.length);
        transfer.data.copy(sendBuffer, 1, 0, transfer.size);

        let header = (CCS.DOWNLOAD_SEGMENT << 5) | ((7-transfer.size) << 1);
        if(transfer.data.length == transfer.size)
            header |= 1;

        sendBuffer.writeUInt8(header);

        transfer.device.channel.send({
            id:     transfer.cobId,
            data:   sendBuffer,
        });

        transfer.refresh();
    }

    /** Handle SCS.DOWNLOAD_SEGMENT.
     * @private
     * @param {Transfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     */
    _clientDownloadSegment(transfer, data) {
        if((data[0] & 0x10) != (transfer.toggle << 4))
            return _clientAbort(transfer, 0x05030000);

        if(transfer.size == transfer.data.length)
            return transfer.resolve();

        const sendBuffer = Buffer.alloc(8);
        const count = Math.min(7, (transfer.data.length - transfer.size));

        transfer.data.copy(
            sendBuffer, 1, transfer.size, transfer.size + count);

        transfer.toggle ^= 1;
        transfer.size += count;

        let header = (CCS.DOWNLOAD_SEGMENT << 5)
                   | (transfer.toggle << 4)
                   | ((7-count) << 1);

        if(transfer.size == transfer.data.length)
            header |= 1;

        sendBuffer.writeUInt8(header);

        transfer.device.channel.send({
            id:     transfer.cobId,
            data:   sendBuffer,
        });

        transfer.refresh();
    }

    /** Abort a transfer as a client.
     * @private
     * @param {Transfer} transfer - SDO context.
     * @param {number} code - SDO abort code.
     */
    _clientAbort(transfer, code) {
        const sendBuffer = Buffer.alloc(8);
        sendBuffer.writeUInt8(CCS.ABORT << 5, 0);
        sendBuffer.writeUInt16LE(transfer.index, 1);
        sendBuffer.writeUInt8(transfer.subIndex, 3);
        sendBuffer.writeUInt32LE(code, 4);

        transfer.device.channel.send({
            id:     transfer.cobId,
            data:   sendBuffer,
        });

        transfer.reject();
    }

    /** Handle CCS.DOWNLOAD_INITIATE.
     * @private
     * @param {Transfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     */
    _serverDownloadInitiate(transfer, data) {
        transfer.index = data.readUInt16LE(1);
        transfer.subIndex = data.readUInt8(3);

        let entry = transfer.device.EDS.getEntry(transfer.index);
        if(!entry)
            return _serverAbort(transfer, 0x06020000);

        if(entry.subNumber > 0) {
            entry = entry[subIndex];
            if(!entry)
                return _serverAbort(transfer, 0x06090011);
        }

        if(data[0] & 0x02) {
            // Expedited transfer
            const count = (data[0] & 1) ? (4 - ((data[0] >> 2) & 3)) : 4;

            const raw = Buffer.alloc(count);
            data.copy(raw, 0, 4, count+4);
            entry.raw = raw;

            const sendBuffer = Buffer.alloc(8);
            sendBuffer.writeUInt8(SCS.DOWNLOAD_INITIATE << 5);
            sendBuffer.writeUInt16LE(transfer.index, 1);
            sendBuffer.writeUInt8(transfer.subIndex, 3);

            transfer.device.channel.send({
                id:     transfer.cobId,
                data:   sendBuffer,
            });
        }
        else {
            // Segmented transfer
            transfer.data = Buffer.alloc(0);
            transfer.size = 0;
            transfer.toggle = 0;

            const sendBuffer = Buffer.alloc(8);
            sendBuffer.writeUInt8(SCS.DOWNLOAD_INITIATE << 5);
            sendBuffer.writeUInt16LE(transfer.index, 1);
            sendBuffer.writeUInt8(transfer.subIndex, 3);

            this.device.channel.send({
                id:     transfer.cobId,
                data:   sendBuffer,
            });

            transfer.start();
        }
    }

    /** Handle CCS.UPLOAD_INITIATE.
     * @private
     * @param {Transfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     */
    _serverUploadInitiate(transfer, data) {
        transfer.index = data.readUInt16LE(1);
        transfer.subIndex = data.readUInt8(3);

        let entry = transfer.device.EDS.getEntry(transfer.index);
        if(!entry)
            return _serverAbort(transfer, 0x06020000);

        if(entry.subNumber > 0) {
            entry = entry[subIndex];
            if(!entry)
                return _serverAbort(transfer, 0x06090011);
        }

        if(entry.size <= 4) {
            // Expedited transfer
            const sendBuffer = Buffer.alloc(8);
            const header = (SCS.UPLOAD_INITIATE << 5)
                         | ((4-entry.size) << 2)
                         | 0x2;

            sendBuffer.writeUInt8(header, 0);
            sendBuffer.writeUInt16LE(transfer.index, 1);
            sendBuffer.writeUInt8(transfer.subIndex, 3);

            entry.raw.copy(sendBuffer, 4);

            if(entry.size < 4)
                sendBuffer[0] |= ((4 - entry.size) << 2) | 0x1;

            transfer.device.channel.send({
                id:     transfer.cobId,
                data:   sendBuffer,
            });
        }
        else {
            // Segmented transfer
            transfer.data = Buffer.from(entry.raw);
            transfer.size = 0;
            transfer.toggle = 0;

            const sendBuffer = Buffer.alloc(8);
            const header = (SCS.UPLOAD_INITIATE << 5) | 0x1;

            sendBuffer.writeUInt8(header, 0);
            sendBuffer.writeUInt16LE(transfer.index, 1);
            sendBuffer.writeUInt8(transfer.subIndex, 3);
            sendBuffer.writeUInt32LE(transfer.data.length, 4);

            transfer.device.channel.send({
                id:     transfer.cobId,
                data:   sendBuffer,
            });

            transfer.start();
        }
    }

    /** Handle CCS.UPLOAD_SEGMENT.
     * @private
     * @param {Transfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     */
    _serverUploadSegment(transfer, data) {
        if((data[0] & 0x10) != (transfer.toggle << 4))
            return _serverAbort(transfer, 0x05030000);

        const sendBuffer = Buffer.alloc(8);
        let count = Math.min(7, (transfer.data.length - transfer.size));
        transfer.data.copy(
            sendBuffer, 1, transfer.size, transfer.size + count);

        let header = (transfer.toggle << 4) | (7-count) << 1;
        if(transfer.size == transfer.data.length) {
            header |= 1;
            transfer.resolve();
        }

        sendBuffer.writeUInt8(header, 0);
        transfer.toggle ^= 1;
        transfer.size += count;

        this.device.channel.send({
            id:     transfer.cobId,
            data:   sendBuffer,
        });

        transfer.refresh();;
    }

    /** Handle CCS.DOWNLOAD_SEGMENT.
     * @private
     * @param {Transfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     */
    _serverDownloadSegment(transfer, data) {
        if((data[0] & 0x10) != (transfer.toggle << 4))
            return _serverAbort(transfer, 0x05030000);

        const count = (7 - ((data[0] >> 1) & 0x7));
        const payload = data.slice(1, count+1);
        const size = transfer.data.length + count;

        transfer.data = Buffer.concat([transfer.data, payload], size);

        if(data[0] & 1) {
            let entry = transfer.device.EDS.getEntry(transfer.index);
            if(!entry)
                return _serverAbort(transfer, 0x06020000);

            if(entry.subNumber > 0) {
                entry = entry[subIndex];
                if(!entry)
                    return _serverAbort(transfer, 0x06090011);
            }

            const raw = Buffer.alloc(size);
            transfer.data.copy(raw);
            entry.raw = raw;

            transfer.resolve();
        }

        const sendBuffer = Buffer.alloc(8);
        const header = (SCS.DOWNLOAD_SEGMENT << 5) | (transfer.toggle << 4);

        sendBuffer.writeUInt8(header);
        transfer.toggle ^= 1;

        transfer.device.channel.send({
            id:     transfer.cobId,
            data:   sendBuffer,
        });

        transfer.refresh();
    }

    /** Abort a transfer as a server.
     * @private
     * @param {Transfer} transfer - SDO context.
     * @param {number} code - SDO abort code.
     */
    _serverAbort(transfer, code) {
        const sendBuffer = Buffer.alloc(8);
        sendBuffer.writeUInt8(SCS.ABORT << 5, 0);
        sendBuffer.writeUInt16LE(transfer.index, 1);
        sendBuffer.writeUInt8(transfer.subIndex, 3);
        sendBuffer.writeUInt32LE(code, 4);

        transfer.device.channel.send({
            id:     transfer.cobId,
            data:   sendBuffer,
        });

        transfer.reject();
    }

    /** socketcan 'onMessage' listener.
     * @private
     * @param {Object} message - CAN frame.
     */
    _onMessage(message) {
        if(!message)
            return;

        /* Handle transfers as a client (remote object dictionary). */
        const server = this._serverTransfers[message.id];
        if(server) {
            switch(message.data[0] >> 5) {
                case SCS.ABORT:
                    this._clientAbort(server, data.readUInt32LE(4));
                    break;
                case SCS.UPLOAD_INITIATE:
                    this._clientUploadInitiate(server, message.data);
                    break;
                case SCS.UPLOAD_SEGMENT:
                    this._clientUploadSegment(server, message.data);
                    break;
                case SCS.DOWNLOAD_INITIATE:
                    this._clientDownloadInitiate(server);
                    break;
                case SCS.DOWNLOAD_SEGMENT:
                    this._clientDownloadSegment(server, message.data);
                    break;
                default:
                    this._clientAbort(server, 0x05040001);
                    break;
            }
        }

        /* Handle transfers as a server (local object dictionary). */
        const clientTransfer = this._clientTransfers[message.id];
        if(clientTransfer) {
            switch(message.data[0] >> 5) {
                case CCS.ABORT:
                    clientTransfer.reject();
                    break;
                case CCS.DOWNLOAD_INITIATE:
                    this._serverDownloadInitiate(clientTransfer, message.data);
                    break;
                case CCS.UPLOAD_INITIATE:
                    this._serverUploadInitiate(clientTransfer, message.data);
                    break;
                case CCS.UPLOAD_SEGMENT:
                    this._serverUploadSegment(clientTransfer, message.data);
                    break;
                case CCS.DOWNLOAD_SEGMENT:
                    this._serverDownloadSegment(clientTransfer, message.data);
                    break;
                default:
                    this._serverAbort(clientTransfer, 0x05040001);
                    break;
            }
        }
    }
}

module.exports=exports=SDO;
