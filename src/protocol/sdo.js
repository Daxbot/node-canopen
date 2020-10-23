const { AccessType, rawToType, typeToRaw } = require('../eds');

/**
 * CANopen abort codes.
 * @enum {string}
 * @see CiA301 'Protocol SDO abort transfer' (§7.2.4.3.17)
 * @memberof Sdo
 */
const AbortCode = {
    TOGGLE_BIT: 0x05030000,
    TIMEOUT: 0x05040000,
    BAD_COMMAND: 0x05040001,
    BAD_BLOCK_SIZE: 0x05040002,
    BAD_BLOCK_SEQUENCE: 0x05040003,
    BAD_BLOCK_CRC: 0x05040004,
    OUT_OF_MEMORY: 0x05040005,
    UNSUPPORTED_ACCESS: 0x06010000,
    WRITE_ONLY: 0x06010001,
    READ_ONLY: 0x06010002,
    OBJECT_UNDEFINED: 0x06020000,
    OBJECT_NOT_MAPPABLE: 0x06040041,
    MAP_LENGTH: 0x06040042,
    PARAMETER_INCOMPATIBILITY: 0x06040043,
    DEVICE_INCOMPATIBILITY: 0x06040047,
    HARDWARE_ERROR: 0x06060000,
    BAD_LENGTH: 0x06070010,
    DATA_LONG: 0x06070012,
    DATA_SHORT: 0x06070012,
    BAD_SUB_INDEX: 0x06090011,
    BAD_VALUE: 0x06090030,
    VALUE_HIGH: 0x06090031,
    VALUE_LOW: 0x06090032,
    RANGE_ERROR: 0x06090036,
    SDO_NOT_AVAILBLE: 0x060A0023,
    GENERAL_ERROR: 0x08000000,
    DATA_TRANSFER: 0x08000020,
    LOCAL_CONTROL: 0x08000021,
    DEVICE_STATE: 0x08000022,
    OD_ERROR: 0x08000023,
    NO_DATA: 0x08000024,
};

/**
 * CANopen SDO 'Client Command Specifier' codes.
 * @enum {number}
 * @see CiA301 'SDO protocols' (§7.2.4.3)
 * @private
 */
const ClientCommand = {
    DOWNLOAD_SEGMENT: 0,
    DOWNLOAD_INITIATE: 1,
    UPLOAD_INITIATE: 2,
    UPLOAD_SEGMENT: 3,
    ABORT: 4,
};

 /**
  * CANopen SDO 'Server Command Specifier' codes.
  * @enum {number}
  * @see CiA301 'SDO protocols' (§7.2.4.3)
  * @private
  */
const ServerCommand = {
    UPLOAD_SEGMENT: 0,
    DOWNLOAD_SEGMENT: 1,
    UPLOAD_INITIATE: 2,
    DOWNLOAD_INITIATE: 3,
    ABORT: 4,
};

/**
 * Return the error message associated with an AbortCode.
 * @param {AbortCode} code - message to lookup.
 * @private
 */
function codeToString(code) {
    switch(code) {
        case AbortCode.TOGGLE_BIT:
            return 'Toggle bit not altered';
        case AbortCode.TIMEOUT:
            return 'SDO protocol timed out';
        case AbortCode.BAD_COMMAND:
            return 'Command specifier not valid or unknown';
        case AbortCode.BAD_BLOCK_SIZE:
            return 'Invalid block size in block mode';
        case AbortCode.BAD_BLOCK_SEQUENCE:
            return 'Invalid sequence number in block mode';
        case AbortCode.BAD_BLOCK_CRC:
            return 'CRC error in block mode';
        case AbortCode.OUT_OF_MEMORY:
            return 'Out of memory';
        case AbortCode.UNSUPPORTED_ACCESS:
            return 'Unsupported access to an object';
        case AbortCode.WRITE_ONLY:
            return 'Attempt to read a write only object'
        case AbortCode.READ_ONLY:
            return 'Attempt to write a read only object';
        case AbortCode.OBJECT_UNDEFINED:
            return 'Object does not exist';
        case AbortCode.OBJECT_NOT_MAPPABLE:
            return 'Object cannot be mapped to the PDO';
        case AbortCode.MAP_LENGTH:
            return 'Number and length of object to be mapped exceeds PDO length';
        case AbortCode.PARAMETER_INCOMPATIBILITY:
            return 'General parameter incompatibility reasons';
        case AbortCode.DEVICE_INCOMPATIBILITY:
            return 'General internal incompatibility in device';
        case AbortCode.HARDWARE_ERROR:
            return 'Access failed due to hardware error';
        case AbortCode.BAD_LENGTH:
            return 'Data type does not match: length of service parameter does not match';
        case AbortCode.DATA_LONG:
            return 'Data type does not match: length of service parameter too high';
        case AbortCode.DATA_SHORT:
            return 'Data type does not match: length of service parameter too short';
        case AbortCode.BAD_SUB_INDEX:
            return 'Sub index does not exist';
        case AbortCode.BAD_VALUE:
            return 'Invalid value for download parameter';
        case AbortCode.VALUE_HIGH:
            return 'Value range of parameter written too high';
        case AbortCode.VALUE_LOW:
            return 'Value range of parameter written too low';
        case AbortCode.RANGE_ERROR:
            return 'Maximum value is less than minimum value';
        case AbortCode.SDO_NOT_AVAILBLE:
            return 'Resource not available: SDO connection';
        case AbortCode.GENERAL_ERROR:
            return 'General error';
        case AbortCode.DATA_TRANSFER:
            return 'Data cannot be transferred or stored to application';
        case AbortCode.LOCAL_CONTROL:
            return 'Data cannot be transferred or stored to application because of local control';
        case AbortCode.DEVICE_STATE:
            return 'Data cannot be transferred or stored to application because of present device state';
        case AbortCode.OD_ERROR:
            return 'Object dictionary not present or dynamic generation failed';
        case AbortCode.NO_DATA:
            return 'No data available';
        default:
            return 'Unknown error';
    }
}

/**
 * Represents an SDO transfer error.
 * @param {AbortCode} code - error code.
 * @param {number} index - object index.
 * @param {number} subIndex - object subIndex.
 * @memberof Sdo
 */
class SdoError extends Error {
    constructor(code, index, subIndex=null) {
        const message = codeToString(code);

        let tag = index
        if (typeof index === 'number')
            tag = `0x${index.toString(16)}`;
        if(subIndex !== null)
            tag += `.${subIndex.toString()}`;

        super(`${message} [${tag}]`);

        this.code = code;
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Represents an SDO transfer.
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
                this.abort(AbortCode.TIMEOUT);
            }, this.timeout);
        }
    }

    /** Refresh the transfer timeout. */
    refresh() {
        if(this.timeout)
            this.timer.refresh();
    }

    /** Send a data buffer. */
    send(data) {
        this.device.send({
            id:     this.cobId,
            data:   data,
        });
    }

    /**
     * Complete the transfer and resolve its promise.
     * @param {Buffer | undefined} data - return data.
     */
    resolve(data) {
        this.active = false;
        clearTimeout(this.timer);
        if(this._resolve)
            this._resolve(data);
    }

    /**
     * Complete the transfer and reject its promise.
     * @param {AbortCode} code - SDO abort code.
     */
    reject(code) {
        this.active = false;
        clearTimeout(this.timer);
        if(this._reject)
            this._reject(new SdoError(code, this.index, this.subIndex));
    }

    /**
     * Abort the transfer.
     * @param {AbortCode} code - SDO abort code.
     */
    abort(code) {
        const sendBuffer = Buffer.alloc(8);
        sendBuffer.writeUInt8(0x80, 0);
        sendBuffer.writeUInt16LE(this.index, 1);
        sendBuffer.writeUInt8(this.subIndex, 3);
        sendBuffer.writeUInt32LE(code, 4);

        this.send(sendBuffer);
        this.reject(code);
    }
}

/**
 * Queue of pending transfers.
 * @see https://medium.com/@karenmarkosyan/how-to-manage-promises-into-dynamic-queue-with-vanilla-javascript-9d0d1f8d4df5
 * @private
 */
class Queue {
    constructor() {
        this.queue = [];
        this.pending = false;
    }

    /**
     * Add a transfer to the queue.
     * @param {Function} start - start the transfer.
     */
    push(start) {
        return new Promise((resolve, reject) => {
            this.queue.push({ start, resolve, reject });
            this.pop();
        });
    }

    /** Run the next transfer in queue. */
    pop() {
        if(this.pending)
            return;

        const transfer = this.queue.shift();
        if(!transfer)
            return;

        this.pending = true;
        transfer.start().then((value) => {
            this.pending = false;
            transfer.resolve(value);
            this.pop();
        })
        .catch((error) => {
            this.pending = false;
            transfer.reject(error);
            this.pop();
        });
    }
}

/**
 * CANopen SDO protocol handler.
 *
 * The service data object (SDO) protocol uses a client-server structure where
 * a client can initiate the transfer of data from the server's object
 * dictionary. An SDO is transfered as a sequence of segments with basic
 * error checking.
 *
 * @param {Device} device - parent device.
 * @see CiA301 'Service data object (SDO)' (§7.2.4)
 */
class Sdo {
    constructor(device) {
        this.device = device;
        this.clients = {};
        this.servers = {};
        this.transfers = {};
    }

    /** Initialize members and begin serving SDO transfers. */
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

                this.clients[cobIdRx] = new Transfer({ cobId: cobIdTx });
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
                if(serverId === undefined)
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

                this.servers[serverId] = {
                    cobIdTx:    cobIdTx,
                    cobIdRx:    cobIdRx,
                    queue:      new Queue(),
                };
            }
        }

        this.device.addListener('message', this._onMessage.bind(this));
    }

    /**
     * Service: SDO upload
     *
     * Read data from an SDO server.
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
        let server = this.servers[serverId];
        if(server === undefined) {
            // Attempt to use default server
            if(this.servers[0] === undefined) {
                const id = serverId.toString(16);
                throw new ReferenceError(`SDO server 0x${id} not mapped.`);
            }

            let cobIdRx = this.servers[0].cobIdRx;
            if((cobIdRx & 0xF) == 0x0)
                cobIdRx |= serverId

            let cobIdTx = this.servers[0].cobIdTx;
            if((cobIdTx & 0xF) == 0x0)
                cobIdTx |= serverId

            server = this.servers[serverId] = {
                cobIdRx:    cobIdRx,
                cobIdTx:    cobIdTx,
                pending:    {},
                queue:      new Queue(),
            };
        }

        if(index === undefined)
            throw ReferenceError("Must provide an index.");

        return server.queue.push(() => {
            return new Promise((resolve, reject) => {
                this.transfers[server.cobIdRx] = new Transfer({
                    device:     this.device,
                    resolve:    resolve,
                    reject:     reject,
                    index:      index,
                    subIndex:   subIndex,
                    timeout:    timeout,
                    cobId:      server.cobIdTx,
                });

                const sendBuffer = Buffer.alloc(8);
                sendBuffer.writeUInt8(ClientCommand.UPLOAD_INITIATE << 5);
                sendBuffer.writeUInt16LE(index, 1);
                sendBuffer.writeUInt8(subIndex, 3);

                this.device.send({
                    id:     server.cobIdTx,
                    data:   sendBuffer
                });

                this.transfers[server.cobIdRx].start();
            })
        })
        .then((data) => {
            return rawToType(data, dataType);
        })
    }

    /**
     * Service: SDO download.
     *
     * Write data to an SDO server.
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
        let server = this.servers[serverId];
        if(server === undefined) {
            // Attempt to use default server
            if(this.servers[0] === undefined) {
                const id = serverId.toString(16);
                throw new ReferenceError(`SDO server 0x${id} not mapped.`);
            }

            let cobIdRx = this.servers[0].cobIdRx;
            if((cobIdRx & 0xF) == 0x0)
                cobIdRx |= serverId

            let cobIdTx = this.servers[0].cobIdTx;
            if((cobIdTx & 0xF) == 0x0)
                cobIdTx |= serverId

            server = this.servers[serverId] = {
                cobIdRx:    cobIdRx,
                cobIdTx:    cobIdTx,
                pending:    Promise.resolve(),
                queue:      new Queue(),
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

        return server.queue.push(() => {
            return new Promise((resolve, reject) => {
                this.transfers[server.cobIdRx] = new Transfer({
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
                let header = (ClientCommand.DOWNLOAD_INITIATE << 5);

                sendBuffer.writeUInt16LE(index, 1);
                sendBuffer.writeUInt8(subIndex, 3);

                if(data.length > 4) {
                    // Segmented transfer
                    sendBuffer.writeUInt8(header | 0x1);
                    sendBuffer.writeUInt32LE(data.length, 4);
                }
                else {
                    // Expedited transfer
                    header |= ((4-data.length) << 2) | 0x3;

                    sendBuffer.writeUInt8(header);
                    data.copy(sendBuffer, 4);
                }

                this.device.send({
                    id:     server.cobIdTx,
                    data:   sendBuffer
                });

                this.transfers[server.cobIdRx].start();
            });
        });
    }

    /**
     * Handle SCS.UPLOAD_INITIATE.
     * @param {Transfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _clientUploadInitiate(transfer, data) {
        if(data[0] & 0x02) {
            // Expedited transfer
            const size = (data[0] & 1) ? (4 - ((data[0] >> 2) & 3)) : 4;
            transfer.resolve(data.slice(4, 4 + size));
        }
        else {
            // Segmented transfer
            const sendBuffer = Buffer.alloc(8);
            sendBuffer.writeUInt8(ClientCommand.UPLOAD_SEGMENT << 5);

            if(data[0] & 0x1)
                transfer.size = data.readUInt32LE(4);

            transfer.send(sendBuffer);
            transfer.refresh();
        }
    }

    /**
     * Handle SCS.UPLOAD_SEGMENT.
     * @param {Transfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _clientUploadSegment(transfer, data) {
        if((data[0] & 0x10) != (transfer.toggle << 4))
            return transfer.abort(AbortCode.TOGGLE_BIT);

        const count = (7 - ((data[0] >> 1) & 0x7));
        const payload = data.slice(1, count+1);
        const size = transfer.data.length + count;
        const buffer = Buffer.concat([transfer.data, payload], size);

        if(data[0] & 1) {
            if(transfer.size != size)
                return transfer.abort(AbortCode.BAD_LENGTH);

            transfer.resolve(buffer);
        }
        else {
            transfer.toggle ^= 1;
            transfer.data = buffer;

            const sendBuffer = Buffer.alloc(8);
            const header = (ClientCommand.UPLOAD_SEGMENT << 5) | (transfer.toggle << 4);
            sendBuffer.writeUInt8(header);

            transfer.send(sendBuffer);
            transfer.refresh();
        }
    }

    /**
     * Handle SCS.DOWNLOAD_INITIATE.
     * @param {Transfer} transfer - SDO context.
     * @private
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

        let header = (ClientCommand.DOWNLOAD_SEGMENT << 5) | ((7-transfer.size) << 1);
        if(transfer.data.length == transfer.size)
            header |= 1;

        sendBuffer.writeUInt8(header);

        transfer.send(sendBuffer);
        transfer.refresh();
    }

    /**
     * Handle SCS.DOWNLOAD_SEGMENT.
     * @param {Transfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _clientDownloadSegment(transfer, data) {
        if((data[0] & 0x10) != (transfer.toggle << 4))
            return transfer.abort(AbortCode.TOGGLE_BIT);

        if(transfer.size == transfer.data.length)
            return transfer.resolve();

        const sendBuffer = Buffer.alloc(8);
        const count = Math.min(7, (transfer.data.length - transfer.size));

        transfer.data.copy(
            sendBuffer, 1, transfer.size, transfer.size + count);

        transfer.toggle ^= 1;
        transfer.size += count;

        let header = (ClientCommand.DOWNLOAD_SEGMENT << 5)
                   | (transfer.toggle << 4)
                   | ((7-count) << 1);

        if(transfer.size == transfer.data.length)
            header |= 1;

        sendBuffer.writeUInt8(header);

        transfer.send(sendBuffer);
        transfer.refresh();
    }

    /**
     * Handle CCS.DOWNLOAD_INITIATE.
     * @param {Transfer} client - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _serverDownloadInitiate(client, data) {
        client.index = data.readUInt16LE(1);
        client.subIndex = data.readUInt8(3);

        if(data[0] & 0x02) {
            // Expedited client
            let entry = this.device.eds.getEntry(client.index);
            if(entry === undefined)
                return client.abort(AbortCode.OBJECT_UNDEFINED);

            if(entry.subNumber > 0) {
                entry = entry[client.subIndex];
                if(entry === undefined)
                    return client.abort(AbortCode.BAD_SUB_INDEX);
            }

            if(entry.accessType == AccessType.CONSTANT
                || entry.accessType == AccessType.READ_ONLY) {
                return client.abort(AbortCode.READ_ONLY);
            }

            const count = (data[0] & 1) ? (4 - ((data[0] >> 2) & 3)) : 4;
            const raw = Buffer.alloc(count);
            data.copy(raw, 0, 4, count+4);

            const value = rawToType(raw, entry.dataType);
            if(entry.highLimit !== undefined && value > entry.highLimit)
                return client.abort(AbortCode.VALUE_HIGH);

            if(entry.lowLimit !== undefined && value < entry.lowLimit)
                return client.abort(AbortCode.VALUE_LOW);

            entry.raw = raw;

            const sendBuffer = Buffer.alloc(8);
            sendBuffer.writeUInt8(ServerCommand.DOWNLOAD_INITIATE << 5);
            sendBuffer.writeUInt16LE(client.index, 1);
            sendBuffer.writeUInt8(client.subIndex, 3);

            this.device.send({
                id:     client.cobId,
                data:   sendBuffer,
            });
        }
        else {
            // Segmented client
            client.data = Buffer.alloc(0);
            client.size = 0;
            client.toggle = 0;

            const sendBuffer = Buffer.alloc(8);
            sendBuffer.writeUInt8(ServerCommand.DOWNLOAD_INITIATE << 5);
            sendBuffer.writeUInt16LE(client.index, 1);
            sendBuffer.writeUInt8(client.subIndex, 3);

            this.device.send({
                id:     client.cobId,
                data:   sendBuffer,
            });

            client.start();
        }
    }

    /**
     * Handle CCS.UPLOAD_INITIATE.
     * @param {Transfer} client - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _serverUploadInitiate(client, data) {
        client.index = data.readUInt16LE(1);
        client.subIndex = data.readUInt8(3);

        let entry = this.device.eds.getEntry(client.index);
        if(entry === undefined)
            return client.abort(AbortCode.OBJECT_UNDEFINED);

        if(entry.subNumber > 0) {
            entry = entry[client.subIndex];
            if(entry === undefined)
                return client.abort(AbortCode.BAD_SUB_INDEX);
        }

        if(entry.accessType == AccessType.WRITE_ONLY)
            return client.abort(AbortCode.WRITE_ONLY);

        if(entry.size <= 4) {
            // Expedited client
            const sendBuffer = Buffer.alloc(8);
            const header = (ServerCommand.UPLOAD_INITIATE << 5)
                         | ((4-entry.size) << 2)
                         | 0x2;

            sendBuffer.writeUInt8(header, 0);
            sendBuffer.writeUInt16LE(client.index, 1);
            sendBuffer.writeUInt8(client.subIndex, 3);

            entry.raw.copy(sendBuffer, 4);

            if(entry.size < 4)
                sendBuffer[0] |= ((4 - entry.size) << 2) | 0x1;

            this.device.send({
                id:     client.cobId,
                data:   sendBuffer,
            });
        }
        else {
            // Segmented client
            client.data = Buffer.from(entry.raw);
            client.size = 0;
            client.toggle = 0;

            const sendBuffer = Buffer.alloc(8);
            const header = (ServerCommand.UPLOAD_INITIATE << 5) | 0x1;

            sendBuffer.writeUInt8(header, 0);
            sendBuffer.writeUInt16LE(client.index, 1);
            sendBuffer.writeUInt8(client.subIndex, 3);
            sendBuffer.writeUInt32LE(client.data.length, 4);

            this.device.send({
                id:     client.cobId,
                data:   sendBuffer,
            });

            client.start();
        }
    }

    /**
     * Handle CCS.UPLOAD_SEGMENT.
     * @param {Transfer} client - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _serverUploadSegment(client, data) {
        if((data[0] & 0x10) != (client.toggle << 4))
            return client.abort(AbortCode.TOGGLE_BIT);

        const sendBuffer = Buffer.alloc(8);
        let count = Math.min(7, (client.data.length - client.size));
        client.data.copy(
            sendBuffer, 1, client.size, client.size + count);

        let header = (client.toggle << 4) | (7-count) << 1;
        if(client.size == client.data.length) {
            header |= 1;
            client.resolve();
        }

        sendBuffer.writeUInt8(header, 0);
        client.toggle ^= 1;
        client.size += count;

        this.device.send({
            id:     client.cobId,
            data:   sendBuffer,
        });

        client.refresh();;
    }

    /**
     * Handle CCS.DOWNLOAD_SEGMENT.
     * @param {Transfer} client - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _serverDownloadSegment(client, data) {
        if((data[0] & 0x10) != (client.toggle << 4))
            return client.abort(AbortCode.TOGGLE_BIT);

        const count = (7 - ((data[0] >> 1) & 0x7));
        const payload = data.slice(1, count+1);
        const size = client.data.length + count;

        client.data = Buffer.concat([client.data, payload], size);

        if(data[0] & 1) {
            let entry = this.device.eds.getEntry(client.index);
            if(entry === undefined)
                return client.abort(AbortCode.OBJECT_UNDEFINED);

            if(entry.subNumber > 0) {
                entry = entry[client.subIndex];
                if(entry === undefined)
                    return client.abort(AbortCode.BAD_SUB_INDEX);
            }

            if(entry.accessType == AccessType.CONSTANT
                || entry.accessType == AccessType.READ_ONLY) {
                return client.abort(AbortCode.READ_ONLY);
            }

            const raw = Buffer.alloc(size);
            client.data.copy(raw);

            const value = rawToType(raw, entry.dataType);
            if(entry.highLimit !== undefined && value > entry.highLimit)
                return client.abort(AbortCode.VALUE_HIGH);

            if(entry.lowLimit !== undefined && value < entry.lowLimit)
                return client.abort(AbortCode.VALUE_LOW);

            entry.raw = raw;

            client.resolve();
        }

        const sendBuffer = Buffer.alloc(8);
        const header = (ServerCommand.DOWNLOAD_SEGMENT << 5) | (client.toggle << 4);

        sendBuffer.writeUInt8(header);
        client.toggle ^= 1;

        this.device.send({
            id:     client.cobId,
            data:   sendBuffer,
        });

        client.refresh();
    }

    /**
     * Called when a new CAN message is received.
     * @param {Object} message - CAN frame.
     * @private
     */
    _onMessage(message) {
        // Handle transfers as a client (remote object dictionary)
        const serverTransfer = this.transfers[message.id];
        if(serverTransfer) {
            switch(message.data[0] >> 5) {
                case ServerCommand.ABORT:
                    serverTransfer.abort(message.data.readUInt32LE(4));
                    break;
                case ServerCommand.UPLOAD_INITIATE:
                    this._clientUploadInitiate(serverTransfer, message.data);
                    break;
                case ServerCommand.UPLOAD_SEGMENT:
                    this._clientUploadSegment(serverTransfer, message.data);
                    break;
                case ServerCommand.DOWNLOAD_INITIATE:
                    this._clientDownloadInitiate(serverTransfer);
                    break;
                case ServerCommand.DOWNLOAD_SEGMENT:
                    this._clientDownloadSegment(serverTransfer, message.data);
                    break;
                default:
                    serverTransfer.abort(AbortCode.BAD_COMMAND);
                    break;
            }
        }

        // Handle transfers as a server (local object dictionary)
        const client = this.clients[message.id];
        if(client) {
            switch(message.data[0] >> 5) {
                case ClientCommand.ABORT:
                    client.reject();
                    break;
                case ClientCommand.DOWNLOAD_INITIATE:
                    this._serverDownloadInitiate(client, message.data);
                    break;
                case ClientCommand.UPLOAD_INITIATE:
                    this._serverUploadInitiate(client, message.data);
                    break;
                case ClientCommand.UPLOAD_SEGMENT:
                    this._serverUploadSegment(client, message.data);
                    break;
                case ClientCommand.DOWNLOAD_SEGMENT:
                    this._serverDownloadSegment(client, message.data);
                    break;
                default:
                    client.abort(AbortCode.BAD_COMMAND);
                    break;
            }
        }
    }
}

module.exports=exports={ AbortCode, SdoError, Sdo };
