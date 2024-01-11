/**
 * @file Implements the CANopen Service Data Object (SDO) protocol server.
 * @author Wilkins White
 * @copyright 2024 Daxbot
 */

const Device = require('../device');
const { EdsError, DataObject } = require('../eds');
const { ObjectType, AccessType, DataType } = require('../types');
const { SdoCode, SdoTransfer, ClientCommand, ServerCommand } = require('./sdo');
const calculateCrc = require('../functions/crc');
const rawToType = require('../functions/raw_to_type');

/**
 * CANopen SDO protocol handler (Server).
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
 * const device = new Device({ id: 0xB });
 *
 * channel.addListener('onMessage', (message) => device.receive(message));
 * device.setTransmitFunction((message) => channel.send(message));
 *
 * device.init();
 * channel.start();
 *
 * device.eds.addEntry(0x2000, {
 *     parameterName:  'Test string',
 *     objectType:     ObjectType.VAR,
 *     dataType:       DataType.VISIBLE_STRING,
 *     accessType:     AccessType.READ_WRITE,
 * });
 *
 * device.sdoServer.addClient(0xA);
 */
class SdoServer {
    constructor(device) {
        this.device = device;
        this.clients = {};
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
        if (value < 1 || value > 127)
            throw RangeError('blockSize must be in range [1-127]');

        this._blockSize = value;
    }

    /** Initialize members and begin serving SDO transfers. */
    init() {
        for (let index of Object.keys(this.device.dataObjects)) {
            index = parseInt(index);
            if (index < 0x1200 || index > 0x127F)
                continue;

            this._parseSdo(index);
        }

        this.device.addListener('message', this._onMessage.bind(this));
    }

    /**
     * Get an SDO server parameter entry.
     *
     * @param {number} clientId - client COB-ID of the entry to get.
     * @returns {DataObject | null} the matching entry.
     */
    getClient(clientId) {
        for (let [index, entry] of Object.entries(this.device.dataObjects)) {
            index = parseInt(index);
            if (index < 0x1200 || index > 0x127F)
                continue;

            if (entry[3] !== undefined && entry[3].value === clientId)
                return entry;
        }

        return null;
    }

    /**
     * Add an SDO server parameter entry.
     *
     * @param {number} clientId - client COB-ID to add.
     * @param {number} cobIdTx - Sdo COB-ID for outgoing messages (to client).
     * @param {number} cobIdRx - Sdo COB-ID for incoming messages (from client).
     */
    addClient(clientId, cobIdTx = 0x580, cobIdRx = 0x600) {
        if (clientId < 0 || clientId > 0x7F)
            throw RangeError('clientId must be in range [0-127]');

        if (this.getClient(clientId) !== null) {
            clientId = '0x' + clientId.toString(16);
            throw new EdsError(`SDO client ${clientId} already exists`);
        }

        let index = 0x1200;
        for (; index <= 0x127F; ++index) {
            if (this.device.eds.getEntry(index) === undefined)
                break;
        }

        this.device.eds.addEntry(index, {
            parameterName: 'SDO server parameter',
            objectType: ObjectType.RECORD,
        });

        this.device.eds.addSubEntry(index, 1, {
            parameterName: 'COB-ID client to server',
            dataType: DataType.UNSIGNED32,
            accessType: AccessType.READ_WRITE,
            defaultValue: cobIdRx
        });

        this.device.eds.addSubEntry(index, 2, {
            parameterName: 'COB-ID server to client',
            dataType: DataType.UNSIGNED32,
            accessType: AccessType.READ_WRITE,
            defaultValue: cobIdTx
        });

        this.device.eds.addSubEntry(index, 3, {
            parameterName: 'Node-ID of the SDO client',
            dataType: DataType.UNSIGNED8,
            accessType: AccessType.READ_WRITE,
            defaultValue: clientId
        });

        this._parseSdo(index);
    }

    /**
     * Remove an SDO server parameter entry.
     *
     * @param {number} clientId - client COB-ID of the entry to remove.
     */
    removeClient(clientId) {
        const entry = this.getClient(clientId);
        if (entry === null)
            throw ReferenceError(`SDO client ${clientId} does not exist`);

        this.device.eds.removeEntry(entry.index);
    }

    /**
     * Parse a SDO client parameter.
     *
     * @param {number} index - entry index.
     * @private
     */
    _parseSdo(index) {
        const entry = this.device.eds.getEntry(index);
        if (!entry) {
            index = '0x' + (index + 0x200).toString(16);
            throw new EdsError(`SDO server parameter does not exist (${index})`);
        }

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
        if (!cobIdRx || ((cobIdRx >> 31) & 0x1) == 0x1)
            return;

        if (((cobIdRx >> 30) & 0x1) == 0x1)
            throw TypeError('dynamic assignment is not supported');

        if (((cobIdRx >> 29) & 0x1) == 0x1)
            throw TypeError('CAN extended frames are not supported');

        cobIdRx &= 0x7FF;
        if ((cobIdRx & 0xF) == 0x0)
            cobIdRx |= this.device.id;

        let cobIdTx = entry[2].value;
        if (!cobIdTx || ((cobIdTx >> 31) & 0x1) == 0x1)
            return;

        if (((cobIdTx >> 30) & 0x1) == 0x1)
            throw TypeError('dynamic assignment is not supported');

        if (((cobIdTx >> 29) & 0x1) == 0x1)
            throw TypeError('CAN extended frames are not supported');

        cobIdTx &= 0x7FF;
        if ((cobIdTx & 0xF) == 0x0)
            cobIdTx |= this.device.id;

        this.clients[cobIdRx] = new SdoTransfer({
            device: this.device,
            cobId: cobIdTx
        });
    }

    /**
     * Handle ClientCommand.DOWNLOAD_INITIATE.
     *
     * @param {SdoTransfer} client - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _downloadInitiate(client, data) {
        client.index = data.readUInt16LE(1);
        client.subIndex = data.readUInt8(3);

        if (data[0] & 0x02) {
            // Expedited client
            let entry = this.device.eds.getEntry(client.index);
            if (entry === undefined) {
                client.abort(SdoCode.OBJECT_UNDEFINED);
                return;
            }

            if (entry.subNumber > 0) {
                entry = entry[client.subIndex];
                if (entry === undefined) {
                    client.abort(SdoCode.BAD_SUB_INDEX);
                    return;
                }
            }

            if (entry.accessType == AccessType.CONSTANT
                || entry.accessType == AccessType.READ_ONLY) {
                client.abort(SdoCode.READ_ONLY);
                return;
            }

            const count = (data[0] & 1) ? (4 - ((data[0] >> 2) & 3)) : 4;
            const raw = Buffer.alloc(count);
            data.copy(raw, 0, 4, count + 4);

            const value = rawToType(raw, entry.dataType);
            if (entry.highLimit !== undefined && value > entry.highLimit) {
                client.abort(SdoCode.VALUE_HIGH);
                return;
            }

            if (entry.lowLimit !== undefined && value < entry.lowLimit) {
                client.abort(SdoCode.VALUE_LOW);
                return;
            }

            entry.raw = raw;

            const sendBuffer = Buffer.alloc(8);
            sendBuffer.writeUInt8(ServerCommand.DOWNLOAD_INITIATE << 5);
            sendBuffer.writeUInt16LE(client.index, 1);
            sendBuffer.writeUInt8(client.subIndex, 3);

            this.device.send({
                id: client.cobId,
                data: sendBuffer,
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
                id: client.cobId,
                data: sendBuffer,
            });

            client.start();
        }
    }

    /**
     * Handle ClientCommand.UPLOAD_INITIATE.
     *
     * @param {SdoTransfer} client - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _uploadInitiate(client, data) {
        client.index = data.readUInt16LE(1);
        client.subIndex = data.readUInt8(3);

        let entry = this.device.eds.getEntry(client.index);
        if (entry === undefined) {
            client.abort(SdoCode.OBJECT_UNDEFINED);
            return;
        }

        if (entry.subNumber > 0) {
            entry = entry[client.subIndex];
            if (entry === undefined) {
                client.abort(SdoCode.BAD_SUB_INDEX);
                return;
            }
        }

        if (entry.accessType == AccessType.WRITE_ONLY) {
            client.abort(SdoCode.WRITE_ONLY);
            return;
        }

        if (entry.size <= 4) {
            // Expedited client
            const sendBuffer = Buffer.alloc(8);
            const header = (ServerCommand.UPLOAD_INITIATE << 5)
                | ((4 - entry.size) << 2)
                | 0x2;

            sendBuffer.writeUInt8(header, 0);
            sendBuffer.writeUInt16LE(client.index, 1);
            sendBuffer.writeUInt8(client.subIndex, 3);

            entry.raw.copy(sendBuffer, 4);

            if (entry.size < 4)
                sendBuffer[0] |= ((4 - entry.size) << 2) | 0x1;

            this.device.send({
                id: client.cobId,
                data: sendBuffer,
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
                id: client.cobId,
                data: sendBuffer,
            });

            client.start();
        }
    }

    /**
     * Handle ClientCommand.UPLOAD_SEGMENT.
     *
     * @param {SdoTransfer} client - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _uploadSegment(client, data) {
        if ((data[0] & 0x10) != (client.toggle << 4)) {
            client.abort(SdoCode.TOGGLE_BIT);
            return;
        }

        const sendBuffer = Buffer.alloc(8);
        let count = Math.min(7, (client.data.length - client.size));
        client.data.copy(
            sendBuffer, 1, client.size, client.size + count);

        let header = (client.toggle << 4) | (7 - count) << 1;
        if (client.size == client.data.length) {
            header |= 1;
            client.resolve();
        }

        sendBuffer.writeUInt8(header, 0);
        client.toggle ^= 1;
        client.size += count;

        this.device.send({
            id: client.cobId,
            data: sendBuffer,
        });

        client.refresh();
    }

    /**
     * Handle ClientCommand.DOWNLOAD_SEGMENT.
     *
     * @param {SdoTransfer} client - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _downloadSegment(client, data) {
        if ((data[0] & 0x10) != (client.toggle << 4)) {
            client.abort(SdoCode.TOGGLE_BIT);
            return;
        }

        const count = (7 - ((data[0] >> 1) & 0x7));
        const payload = data.slice(1, count + 1);
        const size = client.data.length + count;

        client.data = Buffer.concat([client.data, payload], size);

        if (data[0] & 1) {
            let entry = this.device.eds.getEntry(client.index);
            if (entry === undefined) {
                client.abort(SdoCode.OBJECT_UNDEFINED);
                return;
            }

            if (entry.subNumber > 0) {
                entry = entry[client.subIndex];
                if (entry === undefined) {
                    client.abort(SdoCode.BAD_SUB_INDEX);
                    return;
                }
            }

            if (entry.accessType == AccessType.CONSTANT
                || entry.accessType == AccessType.READ_ONLY) {
                client.abort(SdoCode.READ_ONLY);
                return;
            }

            const raw = Buffer.alloc(size);
            client.data.copy(raw);

            const value = rawToType(raw, entry.dataType);
            if (entry.highLimit !== undefined && value > entry.highLimit) {
                client.abort(SdoCode.VALUE_HIGH);
                return;
            }

            if (entry.lowLimit !== undefined && value < entry.lowLimit) {
                client.abort(SdoCode.VALUE_LOW);
                return;
            }

            entry.raw = raw;

            client.resolve();
        }

        const sendBuffer = Buffer.alloc(8);
        const header = (ServerCommand.DOWNLOAD_SEGMENT << 5) | (client.toggle << 4);

        sendBuffer.writeUInt8(header);
        client.toggle ^= 1;

        this.device.send({
            id: client.cobId,
            data: sendBuffer,
        });

        client.refresh();
    }

    /**
     * Download a data block.
     *
     * Sub-blocks are scheduled using setInterval to avoid blocking during
     * large transfers.
     *
     * @param {SdoTransfer} client - SDO context.
     * @private
     */
    _blockUploadProcess(client) {
        if (client.blockInterval) {
            // Re-schedule timer
            clearInterval(client.blockInterval);
        }

        client.blockInterval = setInterval(() => {
            if (!client.active) {
                // Transfer was interrupted
                clearInterval(client.blockInterval);
                client.blockInterval = null;
                return;
            }

            const sendBuffer = Buffer.alloc(8);
            const offset = 7 * (client.blockSequence
                + (client.blockCount * client.blockSize));

            sendBuffer[0] = ++client.blockSequence;
            if ((offset + 7) >= client.data.length) {
                sendBuffer[0] |= 0x80; // Last block
                client.blockFinished = true;
            }

            client.data.copy(sendBuffer, 1, offset, offset + 7);
            this.device.send({
                id: client.cobId,
                data: sendBuffer,
            });

            client.refresh();

            if (client.blockFinished
                || client.blockSequence >= client.blockSize) {
                clearInterval(client.blockInterval);
                client.blockInterval = null;
            }
        });
    }

    /**
     * Handle ClientCommand.BLOCK_UPLOAD.
     *
     * @param {SdoTransfer} client - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _blockUploadInitiate(client, data) {
        client.index = data.readUInt16LE(1);
        client.subIndex = data.readUInt8(3);
        client.blockSize = data.readUInt32LE(4);
        client.blockCrc = !!(data[0] & (1 << 2));

        let entry = this.device.eds.getEntry(client.index);
        if (entry === undefined) {
            client.abort(SdoCode.OBJECT_UNDEFINED);
            return;
        }

        if (entry.subNumber > 0) {
            entry = entry[client.subIndex];
            if (entry === undefined) {
                client.abort(SdoCode.BAD_SUB_INDEX);
                return;
            }
        }

        if (entry.accessType == AccessType.WRITE_ONLY) {
            client.abort(SdoCode.WRITE_ONLY);
            return;
        }

        client.data = Buffer.from(entry.raw);
        client.size = 0;
        client.blockCount = 0;
        client.blockSequence = 0;
        client.blockFinished = false;

        // Confirm transfer
        const header = (ServerCommand.BLOCK_UPLOAD << 5)
            | (1 << 2)      // CRC supported
            | (1 << 1);     // Data size indicated

        const sendBuffer = Buffer.alloc(8);
        sendBuffer.writeUInt8(header);
        sendBuffer.writeUInt16LE(client.index, 1);
        sendBuffer.writeUInt8(client.subIndex, 3);
        sendBuffer.writeUInt16LE(client.data.length, 4);

        this.device.send({
            id: client.cobId,
            data: sendBuffer,
        });

        client.start();
    }

    /**
     * Handle ClientCommand.BLOCK_UPLOAD.
     *
     * @param {SdoTransfer} client - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _blockUploadConfirm(client, data) {
        // Check that all sub-blocks were received.
        if (data[1] === client.blockSequence) {
            client.blockCount += 1;
            client.blockSequence = 0;

            if (client.blockFinished) {
                // End block upload
                const sendBuffer = Buffer.alloc(8);

                let header = (ServerCommand.BLOCK_UPLOAD << 5)
                    | (1 << 0); // End block upload

                const emptyBytes = client.data.length % 7;
                if (emptyBytes)
                    header |= (7 - emptyBytes) << 2;

                sendBuffer.writeUInt8(header);

                // Write CRC (if supported)
                if (client.blockCrc) {
                    const crcValue = calculateCrc(client.data);
                    sendBuffer.writeUInt16LE(crcValue, 1);
                }

                this.device.send({
                    id: client.cobId,
                    data: sendBuffer,
                });

                client.refresh();
                return;
            }
        }

        // Update block size for next transfer.
        client.blockSize = data[2];
        if (client.blockSize < 1 || client.blockSize > 127) {
            client.abort(SdoCode.BAD_BLOCK_SIZE);
            return;
        }

        // Upload next block
        this._blockUploadProcess(client);
    }

    /**
     * Handle ClientCommand.BLOCK_UPLOAD.
     *
     * @param {SdoTransfer} client - SDO context.
     * @private
     */
    _blockUploadEnd(client) {
        client.resolve();
    }

    /**
     * Handle ClientCommand.BLOCK_DOWNLOAD.
     *
     * @param {SdoTransfer} client - SDO context.
     * @param {Buffer} data - message data.
     * @private
     */
    _blockDownload(client, data) {
        if (client.blockFinished) {
            // Number of bytes that do not contain segment data
            const count = (data[0] >> 2) & 7;
            if (count) {
                const size = client.data.length - count;
                client.data = client.data.slice(0, size);
            }

            // Check size
            if (client.data.length < client.size) {
                client.abort(SdoCode.DATA_SHORT);
                return;
            }

            if (client.data.length > client.size) {
                client.abort(SdoCode.DATA_LONG);
                return;
            }

            // Check CRC (if supported)
            if (client.blockCrc) {
                const crcValue = data.readUInt16LE(1);
                if (crcValue !== calculateCrc(client.data)) {
                    client.abort(SdoCode.BAD_BLOCK_CRC);
                    return;
                }
            }

            // Get entry
            let entry = this.device.eds.getEntry(client.index);
            if (entry === undefined) {
                client.abort(SdoCode.OBJECT_UNDEFINED);
                return;
            }

            if (entry.subNumber > 0) {
                entry = entry[client.subIndex];
                if (entry === undefined) {
                    client.abort(SdoCode.BAD_SUB_INDEX);
                    return;
                }
            }

            // Check that the entry has write access
            if (entry.accessType == AccessType.CONSTANT
                || entry.accessType == AccessType.READ_ONLY) {
                client.abort(SdoCode.READ_ONLY);
                return;
            }

            // Check value limits
            const value = rawToType(client.data, entry.dataType);
            if (entry.highLimit !== undefined && value > entry.highLimit) {
                client.abort(SdoCode.VALUE_HIGH);
                return;
            }

            if (entry.lowLimit !== undefined && value < entry.lowLimit) {
                client.abort(SdoCode.VALUE_LOW);
                return;
            }

            // Write new data
            entry.raw = client.data;

            // End transfer
            const header = (ServerCommand.BLOCK_DOWNLOAD << 5)
                | (1 << 0); // End block download

            const sendBuffer = Buffer.alloc(8);
            sendBuffer.writeUInt8(header);

            this.device.send({
                id: client.cobId,
                data: sendBuffer,
            });

            client.resolve();
        }
        else {
            // Initiate block transfer
            client.index = data.readUInt16LE(1);
            client.subIndex = data.readUInt8(3);
            client.size = data.readUInt32LE(4);
            client.data = Buffer.alloc(0);
            client.blockTransfer = true;
            client.blockSequence = 0;
            client.blockFinished = false;
            client.blockCrc = !!(data[0] & (1 << 2));

            // Confirm transfer
            const header = (ServerCommand.BLOCK_DOWNLOAD << 5)
                | (1 << 2); // CRC supported

            const sendBuffer = Buffer.alloc(8);
            sendBuffer.writeUInt8(header);
            sendBuffer.writeUInt16LE(client.index, 1);
            sendBuffer.writeUInt8(client.subIndex, 3);
            sendBuffer.writeUInt8(this.blockSize, 4);

            this.device.send({
                id: client.cobId,
                data: sendBuffer,
            });

            client.start();
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
        // Handle transfers as a server (local object dictionary)
        const client = this.clients[message.id];
        if (client === undefined)
            return;

        if (client.blockTransfer) {
            // Block transfer in progress
            const data = message.data;
            if ((data[0] & 0x7f) === client.blockSequence + 1) {
                client.data = Buffer.concat([client.data, data.slice(1)]);
                client.blockSequence++;
                if (data[0] & 0x80) {
                    client.blockFinished = true;
                    client.blockTransfer = false;
                }
            }

            if (client.blockSequence > 127) {
                client.abort(SdoCode.BAD_BLOCK_SEQUENCE);
                return;
            }

            // Awknowledge block
            if (client.blockFinished || client.blockSequence == this.blockSize) {
                const header = (ServerCommand.BLOCK_DOWNLOAD << 5)
                    | (2 << 0); // Block download response

                const sendBuffer = Buffer.alloc(8);
                sendBuffer.writeUInt8(header);
                sendBuffer.writeInt8(client.blockSequence, 1);
                sendBuffer.writeUInt8(this.blockSize, 2);

                this.device.send({
                    id: client.cobId,
                    data: sendBuffer,
                });

                // Reset sequence
                client.blockSequence = 0;
            }

            client.refresh();
            return;
        }

        switch (message.data[0] >> 5) {
            case ClientCommand.DOWNLOAD_SEGMENT:
                this._downloadSegment(client, message.data);
                break;
            case ClientCommand.DOWNLOAD_INITIATE:
                this._downloadInitiate(client, message.data);
                break;
            case ClientCommand.UPLOAD_INITIATE:
                this._uploadInitiate(client, message.data);
                break;
            case ClientCommand.UPLOAD_SEGMENT:
                this._uploadSegment(client, message.data);
                break;
            case ClientCommand.ABORT:
                client.reject();
                break;
            case ClientCommand.BLOCK_UPLOAD:
                switch (message.data[0] & 0x3) {
                    case 0:
                        // Initiate upload
                        this._blockUploadInitiate(client, message.data);
                        break;
                    case 1:
                        // End upload
                        this._blockUploadEnd(client);
                        break;
                    case 2:
                        // Confirm block
                        this._blockUploadConfirm(client, message.data);
                        break;
                    case 3:
                        // Start upload
                        this._blockUploadProcess(client);
                        break;
                }
                break;
            case ClientCommand.BLOCK_DOWNLOAD:
                this._blockDownload(client, message.data);
                break;
            default:
                client.abort(SdoCode.BAD_COMMAND);
                break;
        }
    }
}

module.exports = exports = SdoServer;
