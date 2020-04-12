const {accessTypes, rawToType, typeToRaw} = require('../EDS');
const COError = require('../COError');

 /** CANopen SDO 'Client Command Specifier' codes.
  * @private
  * @const {number}
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
  * @see CiA301 'SDO protocols' (§7.2.4.3)
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
        if(this.timeout) {
            this.timer = setTimeout(() => {
                this.abort(0x05040000);
            }, this.timeout);
        }
    }

    /** Refresh the transfer timeout. */
    refresh() {
        if(this.timeout)
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
        this.active = false;
        clearTimeout(this.timer);
        if(this._reject)
            this._reject(new COError(code, this.index, this.subIndex));
    }

    /** Abort the transfer.
     * @param {number} code - SDO abort code.
     */
    abort(code) {
        const sendBuffer = Buffer.alloc(8);
        sendBuffer.writeUInt8(0x80, 0);
        sendBuffer.writeUInt16LE(this.index, 1);
        sendBuffer.writeUInt8(this.subIndex, 3);
        sendBuffer.writeUInt32LE(code, 4);

        this.device.send({
            id:     this.cobId,
            data:   sendBuffer,
        });

        this.reject(code);
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
 * @memberof Device
 */
class SDO {
    constructor(device) {
        this._device = device;
        this._clients = {};
        this._clientTransfers = {};
        this._servers = {}
        this._serverTransfers = {};
    }

    /** Initialize members and begin serving SDO transfers. */
    init() {
        for(let [index, entry] of Object.entries(this._device.dataObjects)) {
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
                    cobIdRx |= this._device.id;

                let cobIdTx = entry[2].value;
                if(!cobIdTx || ((cobIdTx >> 31) & 0x1) == 0x1)
                    continue;

                if(((cobIdTx >> 30) & 0x1) == 0x1)
                    throw TypeError('Dynamic assignment is not supported.');

                if(((cobIdTx >> 29) & 0x1) == 0x1)
                    throw TypeError('CAN extended frames are not supported.');

                cobIdTx &= 0x7FF;
                if((cobIdTx & 0xF) == 0x0)
                    cobIdTx |= this._device.id;

                this._clients[clientId] = {
                    cobIdRx:    cobIdRx,
                    cobIdTx:    cobIdTx,
                };

                this._clientTransfers[cobIdRx] = new Transfer({
                    device:     this._device,
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
                    throw new ReferenceError('ID of the SDO server is required.');

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

                this._servers[serverId] = {
                    cobIdTx:    cobIdTx,
                    cobIdRx:    cobIdRx,
                    pending:    Promise.resolve(),
                };
            }
        }

        this._device.addListener('message', this._onMessage.bind(this));
    }

    /** Service: SDO upload
     *
     * @param {Object} args
     * @param {number} args.serverId - SDO server.
     * @param {number} args.index - data index to upload.
     * @param {number} args.subIndex - data subIndex to upload.
     * @param {number} args.timeout - time before transfer is aborted.
     * @param {dataTypes} args.dataType - expected data type.
     * @returns {Promise<Object>}
     */
    upload({serverId, index, subIndex=null, timeout=30, dataType=null}) {
        let server = this._servers[serverId];
        if(server === undefined) {
            if(this._servers[0] === undefined)
                throw new ReferenceError('0x1280 is required for upload.');

            server = this._servers[serverId] = {
                cobIdRx:    this._servers[0].cobIdRx,
                cobIdTx:    this._servers[0].cobIdTx,
                pending:    Promise.resolve(),
            };
        }

        if(index === undefined)
            throw ReferenceError("Must provide an index.");

        server.pending = server.pending.then(() => {
            return new Promise((resolve, reject) => {
                this._serverTransfers[server.cobIdRx] = new Transfer({
                    device:     this._device,
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

                this._device.send({
                    id:     server.cobIdTx,
                    data:   sendBuffer
                });

                this._serverTransfers[server.cobIdRx].start();
            });
        });

        if(dataType) {
            server.pending = server.pending.then((data) => {
                return rawToType(data, dataType);
            });
        }

        return server.pending;
    }

    /** Service: SDO download.
     *
     * @param {Object} args
     * @param {number} args.serverId - SDO server.
     * @param {Object} args.data - data to download.
     * @param {number} args.index - index or name to download to.
     * @param {number} args.subIndex - data subIndex to download to.
     * @param {number} args.timeout - time before transfer is aborted.
     * @param {dataTypes} args.dataType - type of data to download.
     * @return {Promise}
     */
    download({serverId, data, index, subIndex=null, timeout=30, dataType=null}) {
        let server = this._servers[serverId];
        if(server === undefined) {
            // Attempt to use default server
            if(this._servers[0] === undefined)
                throw new ReferenceError('SDO server not found.');

            server = this._servers[serverId] = {
                cobIdRx:    this._servers[0].cobIdRx,
                cobIdTx:    this._servers[0].cobIdTx,
                pending:    Promise.resolve(),
            };
        }

        if(index === undefined)
            throw ReferenceError("Must provide an index.");

        if(!Buffer.isBuffer(data)) {
            if(!dataType)
                throw ReferenceError("Must provide dataType.");

            data = typeToRaw(data, dataType);
            if(data === undefined)
                throw TypeError(`Failed to convert data to type ${dataType}`);
        }

        server.pending = server.pending.then(() => {
            return new Promise((resolve, reject) => {
                this._serverTransfers[server.cobIdRx] = new Transfer({
                    device:     this._device,
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

                this._device.send({
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

            transfer.device.send({
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
            return transfer.abort(0x05030000);

        const count = (7 - ((data[0] >> 1) & 0x7));
        const payload = data.slice(1, count+1);
        const size = transfer.data.length + count;
        const buffer = Buffer.concat([transfer.data, payload], size);

        if(data[0] & 1) {
            if(transfer.size != size)
                return transfer.abort(0x06070010);

            transfer.resolve(buffer);
        }
        else {
            transfer.toggle ^= 1;
            transfer.data = buffer;

            const sendBuffer = Buffer.alloc(8);
            const header = (CCS.UPLOAD_SEGMENT << 5) | (transfer.toggle << 4);
            sendBuffer.writeUInt8(header);

            transfer.device.send({
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

        transfer.device.send({
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
            return transfer.abort(0x05030000);

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

        transfer.device.send({
            id:     transfer.cobId,
            data:   sendBuffer,
        });

        transfer.refresh();
    }

    /** Handle CCS.DOWNLOAD_INITIATE.
     * @private
     * @param {Transfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     */
    _serverDownloadInitiate(transfer, data) {
        transfer.index = data.readUInt16LE(1);
        transfer.subIndex = data.readUInt8(3);

        if(data[0] & 0x02) {
            // Expedited transfer
            let entry = transfer.device.EDS.getEntry(transfer.index);
            if(!entry)
                return transfer.abort(0x06020000);

            if(entry.subNumber > 0) {
                entry = entry[subIndex];
                if(!entry)
                    return transfer.abort(0x06090011);
            }

            if(entry.accessType == accessTypes.CONSTANT
            || entry.accessType == accessTypes.READ_ONLY) {
                return transfer.abort(0x06010002);
            }

            const count = (data[0] & 1) ? (4 - ((data[0] >> 2) & 3)) : 4;
            const raw = Buffer.alloc(count);
            data.copy(raw, 0, 4, count+4);

            try {
                entry.raw = raw;
            }
            catch(error) {
                return transfer.abort(error.code);
            }

            const sendBuffer = Buffer.alloc(8);
            sendBuffer.writeUInt8(SCS.DOWNLOAD_INITIATE << 5);
            sendBuffer.writeUInt16LE(transfer.index, 1);
            sendBuffer.writeUInt8(transfer.subIndex, 3);

            transfer.device.send({
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

            this._device.send({
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
            return transfer.abort(0x06020000);

        if(entry.subNumber > 0) {
            entry = entry[subIndex];
            if(!entry)
                return transfer.abort(0x06090011);
        }

        if(entry.accessType == accessTypes.WRITE_ONLY)
            return transfer.abort(0x06010001);

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

            transfer.device.send({
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

            transfer.device.send({
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
            return transfer.abort(0x05030000);

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

        this._device.send({
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
            return transfer.abort(0x05030000);

        const count = (7 - ((data[0] >> 1) & 0x7));
        const payload = data.slice(1, count+1);
        const size = transfer.data.length + count;

        transfer.data = Buffer.concat([transfer.data, payload], size);

        if(data[0] & 1) {
            let entry = transfer.device.EDS.getEntry(transfer.index);
            if(!entry)
                return transfer.abort(0x06020000);

            if(entry.subNumber > 0) {
                entry = entry[subIndex];
                if(!entry)
                    return transfer.abort(0x06090011);
            }

            if(entry.accessType == accessTypes.CONSTANT
            || entry.accessType == accessTypes.READ_ONLY) {
                return transfer.abort(0x06010002);
            }

            const raw = Buffer.alloc(size);
            transfer.data.copy(raw);

            try {
                entry.raw = raw;
            }
            catch(error) {
                if(error instanceof COError)
                    return transfer.abort(error.code);

                throw error;
            }

            transfer.resolve();
        }

        const sendBuffer = Buffer.alloc(8);
        const header = (SCS.DOWNLOAD_SEGMENT << 5) | (transfer.toggle << 4);

        sendBuffer.writeUInt8(header);
        transfer.toggle ^= 1;

        transfer.device.send({
            id:     transfer.cobId,
            data:   sendBuffer,
        });

        transfer.refresh();
    }

    /** Called when a new CAN message is received.
     * @private
     * @param {Object} message - CAN frame.
     */
    _onMessage(message) {
        /* Handle transfers as a client (remote object dictionary). */
        const serverTransfer = this._serverTransfers[message.id];
        if(serverTransfer) {
            switch(message.data[0] >> 5) {
                case SCS.ABORT:
                    serverTransfer.abort(message.data.readUInt32LE(4));
                    break;
                case SCS.UPLOAD_INITIATE:
                    this._clientUploadInitiate(serverTransfer, message.data);
                    break;
                case SCS.UPLOAD_SEGMENT:
                    this._clientUploadSegment(serverTransfer, message.data);
                    break;
                case SCS.DOWNLOAD_INITIATE:
                    this._clientDownloadInitiate(serverTransfer);
                    break;
                case SCS.DOWNLOAD_SEGMENT:
                    this._clientDownloadSegment(serverTransfer, message.data);
                    break;
                default:
                    serverTransfer.abort(0x05040001);
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
                    clientTransfer.abort(0x05040001);
                    break;
            }
        }
    }
}

module.exports=exports=SDO;
