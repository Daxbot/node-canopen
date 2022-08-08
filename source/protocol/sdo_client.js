/**
 * @file Implements the CANopen Service Data Object (SDO) protocol client.
 * @author Wilkins White
 * @copyright 2021 Daxbot
 */

const Device = require('../device');
const { EdsError, DataObject } = require('../eds');
const { ObjectType, AccessType, DataType } = require('../types');
const { SdoCode, SdoTransfer, ClientCommand, ServerCommand } = require('./sdo');
const calculateCrc = require('../functions/crc');
const rawToType = require('../functions/raw_to_type');
const typeToRaw = require('../functions/type_to_raw');

/**
 * Queue of pending transfers.
 *
 * @see https://medium.com/@karenmarkosyan/how-to-manage-promises-into-dynamic-queue-with-vanilla-javascript-9d0d1f8d4df5
 * @memberof SdoClient
 * @private
 */
class Queue {
    constructor() {
        this.queue = [];
        this.pending = false;
    }

    /**
     * Add a transfer to the queue.
     *
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
 * CANopen SDO protocol handler (Client).
 *
 * The service data object (SDO) protocol uses a client-server structure where
 * a client can initiate the transfer of data from the server's object
 * dictionary. An SDO is transfered as a sequence of segments with basic
 * error checking.
 *
 * @param {Device} device - parent device.
 * @see CiA301 'Service data object (SDO)' (§7.2.4)
 * @example
 * const can = require('socketcan');
 *
 * const channel = can.createRawChannel('can0');
 * const device = new Device({ id: 0xA });
 *
 * channel.addListener('onMessage', (message) => device.receive(message));
 * device.setTransmitFunction((message) => channel.send(message));
 *
 * device.init();
 * channel.start();
 *
 * device.sdo.addServer(0xB);
 * device.sdo.download({
 *     serverId:    0xB,
 *     data:        'Test string data',
 *     dataType:    DataType.VISIBLE_STRING,
 *     index:       0x2000
 * });
 */
class SdoClient {
    constructor(device) {
        this.device = device;
        this.servers = {};
        this.transfers = {};
        this._blockSize = 127;
    }

    /**
     * Number of segments per block when serving block transfers.
     *
     * @type {number}
     */
    get blockSize() {
        return this._blockSize;
    }

    set blockSize(value) {
        if(value < 1 || value > 127)
            throw RangeError('blockSize must be in range 1-127');

        this._blockSize = value;
    }

    /** Initialize members and begin serving SDO transfers. */
    init() {
        for(let index of Object.keys(this.device.dataObjects)) {
            index = parseInt(index);
            if(index < 0x1280 || index > 0x12FF)
                continue;

            this._parseSdo(index);
        }

        this.device.addListener('message', this._onMessage.bind(this));
    }

    /**
     * Get an SDO client parameter entry.
     *
     * @param {number} serverId - server COB-ID of the entry to get.
     * @returns {DataObject | null} the matching entry.
     */
    getServer(serverId) {
        for(let [index, entry] of Object.entries(this.device.dataObjects)) {
            index = parseInt(index);
            if(index < 0x1280 || index > 0x12FF)
                continue;

            if(entry[3] !== undefined && entry[3].value === serverId)
                return entry;
        }

        return null;
    }

    /**
     * Add an SDO client parameter entry.
     *
     * @param {number} serverId - server COB-ID to add.
     * @param {number} cobIdTx - Sdo COB-ID for outgoing messages (to server).
     * @param {number} cobIdRx - Sdo COB-ID for incoming messages (from server).
     */
    addServer(serverId, cobIdTx=0x600, cobIdRx=0x580) {
        if(serverId < 1 || serverId > 0x7F)
            throw RangeError('serverId must be in range 1-127');

        if(this.getServer(serverId) !== null) {
            serverId = '0x' + serverId.toString(16);
            throw new EdsError(`Entry for server ${serverId} already exists`);
        }

        let index = 0x1280;
        for(; index <= 0x12FF; ++index) {
            if(this.device.eds.getEntry(index) === undefined)
                break;
        }

        this.device.eds.addEntry(index, {
            parameterName:  'SDO client parameter',
            objectType:     ObjectType.RECORD,
        });

        this.device.eds.addSubEntry(index, 1, {
            parameterName:  'COB-ID client to server',
            dataType:       DataType.UNSIGNED32,
            accessType:     AccessType.READ_WRITE,
            defaultValue:   cobIdTx
        });

        this.device.eds.addSubEntry(index, 2, {
            parameterName:  'COB-ID server to client',
            dataType:       DataType.UNSIGNED32,
            accessType:     AccessType.READ_WRITE,
            defaultValue:   cobIdRx
        });

        this.device.eds.addSubEntry(index, 3, {
            parameterName:  'Node-ID of the SDO server',
            dataType:       DataType.UNSIGNED8,
            accessType:     AccessType.READ_WRITE,
            defaultValue:   serverId
        });

        this._parseSdo(index);
    }

    /**
     * Remove an SDO client parameter entry.
     *
     * @param {number} serverId - server COB-ID of the entry to remove.
     */
    removeServer(serverId) {
        const entry = this.getServer(serverId);
        if(entry === null)
            throw ReferenceError(`Entry for server ${serverId} does not exist`);

        this.device.eds.removeEntry(entry.index);
    }

    /**
     * Service: SDO upload
     *
     * Read data from an SDO server.
     *
     * @param {object} args - arguments to destructure.
     * @param {number} args.serverId - SDO server.
     * @param {number} args.index - data index to upload.
     * @param {number} args.subIndex - data subIndex to upload.
     * @param {number} args.timeout - time before transfer is aborted.
     * @param {DataType} args.dataType - expected data type.
     * @param {boolean} args.blockTransfer - use block transfer protocol.
     * @returns {Promise<Buffer | number | bigint | string | Date>} resolves when the upload is complete.
     */
    upload({
        serverId,
        index,
        subIndex=null,
        timeout=30,
        dataType=null,
        blockTransfer=false,
    }) {
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
                this.transfers[server.cobIdRx] = new SdoTransfer({
                    device:     this.device,
                    resolve:    resolve,
                    reject:     reject,
                    index:      index,
                    subIndex:   subIndex,
                    timeout:    timeout,
                    cobId:      server.cobIdTx,
                });

                const sendBuffer = Buffer.alloc(8);
                sendBuffer.writeUInt16LE(index, 1);
                sendBuffer.writeUInt8(subIndex, 3);

                if(blockTransfer) {
                    const header = (ClientCommand.BLOCK_UPLOAD << 5)
                        | (1 << 2) // CRC supported

                    sendBuffer.writeUInt8(header);
                    sendBuffer.writeUInt16LE(this.blockSize, 4);
                }
                else {
                    const header = (ClientCommand.UPLOAD_INITIATE << 5);
                    sendBuffer.writeUInt8(header);
                }

                this.transfers[server.cobIdRx].start();

                this.device.send({
                    id: server.cobIdTx,
                    data: sendBuffer
                });
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
     * @param {object} args - arguments to destructure.
     * @param {number} args.serverId - SDO server.
     * @param {object} args.data - data to download.
     * @param {number} args.index - index or name to download to.
     * @param {number} args.subIndex - data subIndex to download to.
     * @param {number} args.timeout - time before transfer is aborted.
     * @param {DataType} args.dataType - type of data to download.
     * @param {boolean} args.blockTransfer - use block transfer protocol.
     * @returns {Promise} resolves when the download is complete.
     */
    download({
        serverId,
        data,
        index,
        subIndex=null,
        timeout=30,
        dataType=null,
        blockTransfer=false
    }) {
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
                this.transfers[server.cobIdRx] = new SdoTransfer({
                    device: this.device,
                    cobId: server.cobIdTx,
                    resolve,
                    reject,
                    index,
                    subIndex,
                    data,
                    timeout,
                });

                const sendBuffer = Buffer.alloc(8);
                sendBuffer.writeUInt16LE(index, 1);
                sendBuffer.writeUInt8(subIndex, 3);

                if(blockTransfer) {
                    // Block transfer
                    const header = (ClientCommand.BLOCK_DOWNLOAD << 5)
                        | (1 << 2)                  // CRC supported
                        | (1 << 1);                 // Data size indicated

                    sendBuffer.writeUInt8(header);
                    sendBuffer.writeUInt32LE(data.length, 4);
                }
                else if(data.length > 4) {
                    // Segmented transfer
                    const header = (ClientCommand.DOWNLOAD_INITIATE << 5)
                        | (1 << 0);                 // Data size indicated

                    sendBuffer.writeUInt8(header);
                    sendBuffer.writeUInt32LE(data.length, 4);
                }
                else {
                    // Expedited transfer
                    const header = (ClientCommand.DOWNLOAD_INITIATE << 5)
                        | ((4 - data.length) << 2)  // Number of empty bytes
                        | (1 << 1)                  // Expedited transfer
                        | (1 << 0);                 // Data size indicated

                    sendBuffer.writeUInt8(header);
                    data.copy(sendBuffer, 4);
                }

                this.transfers[server.cobIdRx].start();

                this.device.send({
                    id: server.cobIdTx,
                    data: sendBuffer
                });
            });
        });
    }

    /**
     * Parse a SDO client parameter.
     *
     * @param {number} index - entry index.
     * @private
     */
    _parseSdo(index) {
        const entry = this.device.eds.getEntry(index);
        if(!entry) {
            index = '0x' + (index + 0x200).toString(16);
            throw new EdsError(`missing SDO client parameter (${index})`);
        }

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
            return;

        if(((cobIdTx >> 30) & 0x1) == 0x1)
            throw TypeError('dynamic assignment is not supported.');

        if(((cobIdTx >> 29) & 0x1) == 0x1)
            throw TypeError('CAN extended frames are not supported.');

        cobIdTx &= 0x7FF;
        if((cobIdTx & 0xF) == 0x0)
            cobIdTx |= serverId;

        let cobIdRx = entry[2].value;
        if(!cobIdRx || ((cobIdRx >> 31) & 0x1) == 0x1)
            return;

        if(((cobIdRx >> 30) & 0x1) == 0x1)
            throw TypeError('dynamic assignment is not supported.');

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

    /**
     * Handle ServerCommand.UPLOAD_INITIATE.
     *
     * @param {SdoTransfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _uploadInitiate(transfer, data) {
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
     * Handle ServerCommand.UPLOAD_SEGMENT.
     *
     * @param {SdoTransfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _uploadSegment(transfer, data) {
        if(!transfer.active)
            return;

        if((data[0] & 0x10) != (transfer.toggle << 4)) {
            transfer.abort(SdoCode.TOGGLE_BIT);
            return;
        }

        const count = (7 - ((data[0] >> 1) & 0x7));
        const payload = data.slice(1, count+1);
        const size = transfer.data.length + count;
        const buffer = Buffer.concat([transfer.data, payload], size);

        if(data[0] & 1) {
            if(transfer.size != size) {
                transfer.abort(SdoCode.BAD_LENGTH);
                return;
            }

            transfer.resolve(buffer);
        }
        else {
            transfer.toggle ^= 1;
            transfer.data = buffer;

            const sendBuffer = Buffer.alloc(8);
            const header = (ClientCommand.UPLOAD_SEGMENT << 5)
                | (transfer.toggle << 4);

            sendBuffer.writeUInt8(header);

            transfer.send(sendBuffer);
            transfer.refresh();
        }
    }

    /**
     * Handle ServerCommand.DOWNLOAD_INITIATE.
     *
     * @param {SdoTransfer} transfer - SDO context.
     * @private
     */
    _downloadInitiate(transfer) {
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
     * Handle ServerCommand.DOWNLOAD_SEGMENT.
     *
     * @param {SdoTransfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _downloadSegment(transfer, data) {
        if(!transfer.active)
            return;

        if((data[0] & 0x10) != (transfer.toggle << 4)) {
            transfer.abort(SdoCode.TOGGLE_BIT);
            return;
        }

        if(transfer.size == transfer.data.length) {
            transfer.resolve();
            return;
        }

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
     * Minimum timeout for the sdo block download.
    */
    blockDownloadTimeout = 1

    /**
     * Download a data block.
     *
     * Sub-blocks are scheduled using setInterval to avoid blocking during
     * large transfers.
     *
     * @param {SdoTransfer} transfer - SDO context.
     * @private
     */
    _blockDownloadProcess(transfer) {
        if(transfer.blockInterval) {
            // Re-schedule timer
            clearInterval(transfer.blockInterval);
        }

        transfer.blockInterval = setInterval(() => {
            if(!transfer.active) {
                // Transfer was interrupted
                clearInterval(transfer.blockInterval);
                transfer.blockInterval = null;
                return;
            }

            if(this.blockDownloadTimeout > 1){
                this.blockDownloadTimeout = this.blockDownloadTimeout >> 1;
            }

            const sendBuffer = Buffer.alloc(8);
            const offset = 7 * (transfer.blockSequence
                + (transfer.blockCount * transfer.blockSize));

            sendBuffer[0] = ++transfer.blockSequence;
            if((offset + 7) >= transfer.data.length) {
                sendBuffer[0] |= 0x80; // Last block
                transfer.blockFinished = true;
            }

            transfer.data.copy(sendBuffer, 1, offset, offset + 7);
            const ret = transfer.send(sendBuffer);
            if(ret < 0 ){
                this.blockDownloadTimeout = this.blockDownloadTimeout << 8;
                transfer.blockSequence -= 1
            }
            transfer.refresh();

            if(transfer.blockFinished
                || transfer.blockSequence >= transfer.blockSize) {
                clearInterval(transfer.blockInterval);
                transfer.blockInterval = null;
            }
        }, this.blockDownloadTimeout);
    }

    /**
     * Initiate an SDO block download.
     *
     * @param {SdoTransfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _blockDownloadInitiate(transfer, data) {
        transfer.blockCrc = !!(data[0] & (1 << 2));
        transfer.blockSize = data[4];
        transfer.blockCount = 0;
        transfer.blockSequence = 0;
        transfer.blockFinished = false;

        if(transfer.blockSize < 1 || transfer.blockSize > 127) {
            transfer.abort(SdoCode.BAD_BLOCK_SIZE);
            return;
        }

        // Download first block
        this._blockDownloadProcess(transfer);
    }

    /**
     * Confirm the previous block and send the next one.
     *
     * @param {SdoTransfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _blockDownloadConfirm(transfer, data) {
        // Check that all sub-blocks were received.
        if(data[1] === transfer.blockSequence) {
            transfer.blockCount += 1;
            transfer.blockSequence = 0;

            if(transfer.blockFinished) {
                // End block download
                const sendBuffer = Buffer.alloc(8);

                let header = (ClientCommand.BLOCK_DOWNLOAD << 5)
                    | (1 << 0); // End block download

                const emptyBytes = transfer.data.length % 7;
                if(emptyBytes)
                    header |= (7 - emptyBytes) << 2;

                sendBuffer.writeUInt8(header);

                // Write CRC (if supported)
                if(transfer.blockCrc) {
                    const crcValue = calculateCrc(transfer.data);
                    sendBuffer.writeUInt16LE(crcValue, 1);
                }

                transfer.send(sendBuffer);
                transfer.refresh();
                return;
            }
        }

        // Update block size for next transfer.
        transfer.blockSize = data[2];
        if(transfer.blockSize < 1 || transfer.blockSize > 127) {
            transfer.abort(SdoCode.BAD_BLOCK_SIZE);
            return;
        }

        // Download next block
        this._blockDownloadProcess(transfer);
    }

    /**
     * Confirm the previous block and send the next one.
     *
     * @param {SdoTransfer} transfer - SDO context.
     * @private
     */
    _blockDownloadEnd(transfer) {
        transfer.resolve();
    }

    /**
     * Handle ServerCommand.BLOCK_UPLOAD.
     *
     * @param {SdoTransfer} transfer - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _blockUpload(transfer, data) {
        if(transfer.blockFinished) {
            // Number of bytes that do not contain segment data
            const count = (data[0] >> 2) & 7;
            if(count) {
                const size = transfer.data.length - count;
                transfer.data = transfer.data.slice(0, size);
            }

            // Check size
            if(transfer.data.length < transfer.size) {
                transfer.abort(SdoCode.DATA_SHORT);
                return;
            }

            if(transfer.data.length > transfer.size) {
                transfer.abort(SdoCode.DATA_LONG);
                return;
            }

            // Check CRC (if supported)
            if(transfer.blockCrc) {
                const crcValue = data.readUInt16LE(1);
                if(crcValue !== calculateCrc(transfer.data)) {
                    transfer.abort(SdoCode.BAD_BLOCK_CRC);
                    return;
                }
            }

            // End transfer
            const header = (ClientCommand.BLOCK_UPLOAD << 5)
                | (1 << 0); // End block upload

            const sendBuffer = Buffer.alloc(8);
            sendBuffer.writeUInt8(header);

            transfer.send(sendBuffer);
            transfer.resolve(transfer.data);
        }
        else {
            // Initiate block transfer
            transfer.index = data.readUInt16LE(1);
            transfer.subIndex = data.readUInt8(3);
            transfer.size = data.readUInt32LE(4);
            transfer.data = Buffer.alloc(0);
            transfer.blockTransfer = true;
            transfer.blockSequence = 0;
            transfer.blockFinished = false;
            transfer.blockCrc = !!(data[0] & (1 << 2));

            // Confirm transfer
            const header = (ClientCommand.BLOCK_UPLOAD << 5)
                | (3 << 0); // Start upload

            const sendBuffer = Buffer.alloc(8);
            sendBuffer.writeUInt8(header);

            transfer.send(sendBuffer);
            transfer.refresh();
        }
    }

    /**
     * Called when a new CAN message is received.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @param {number} message.len - CAN message length in bytes.
     * @private
     */
    _onMessage(message) {
        // Handle transfers as a client (remote object dictionary)
        const transfer = this.transfers[message.id];
        if(transfer === undefined)
            return;

        if(transfer.blockTransfer) {
            // Block transfer in progress
            const data = message.data;
            if((data[0] & 0x7f) === transfer.blockSequence + 1) {
                transfer.data = Buffer.concat([transfer.data, data.slice(1)]);
                transfer.blockSequence++;
                if(data[0] & 0x80) {
                    transfer.blockFinished = true;
                    transfer.blockTransfer = false;
                }
            }

            if(transfer.blockSequence > 127) {
                transfer.abort(SdoCode.BAD_BLOCK_SEQUENCE);
                return;
            }

            // Awknowledge block
            if(transfer.blockFinished || transfer.blockSequence == this.blockSize) {
                const header = (ClientCommand.BLOCK_UPLOAD << 5)
                    | (2 << 0); // Block upload response

                const sendBuffer = Buffer.alloc(8);
                sendBuffer.writeUInt8(header);
                sendBuffer.writeInt8(transfer.blockSequence, 1);
                sendBuffer.writeUInt8(this.blockSize, 2);

                transfer.send(sendBuffer);

                // Reset sequence
                transfer.blockSequence = 0;
            }

            transfer.refresh();
            return;
        }

        switch(message.data[0] >> 5) {
            case ServerCommand.UPLOAD_SEGMENT:
                this._uploadSegment(transfer, message.data);
                break;
            case ServerCommand.DOWNLOAD_SEGMENT:
                this._downloadSegment(transfer, message.data);
                break;
            case ServerCommand.UPLOAD_INITIATE:
                this._uploadInitiate(transfer, message.data);
                break;
            case ServerCommand.DOWNLOAD_INITIATE:
                this._downloadInitiate(transfer);
                break;
            case ServerCommand.ABORT:
                transfer.abort(message.data.readUInt32LE(4));
                break;
            case ServerCommand.BLOCK_DOWNLOAD:
                switch(message.data[0] & 0x3) {
                    case 0:
                        // Initiate download
                        this._blockDownloadInitiate(transfer, message.data);
                        break;
                    case 1:
                        // End download
                        this._blockDownloadEnd(transfer);
                        break;
                    case 2:
                        // Confirm block
                        this._blockDownloadConfirm(transfer, message.data);
                        break;
                }
                break;
            case ServerCommand.BLOCK_UPLOAD:
                this._blockUpload(transfer, message.data);
                break;
            default:
                transfer.abort(SdoCode.BAD_COMMAND);
                break;
        }
    }
}

module.exports=exports=SdoClient;
