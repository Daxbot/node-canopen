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

const State = {
    NONE: 0,
    IDLE: 1,
    UPLOAD: 2,
    DOWNLOAD: 3,
};

/** CANopen SDO protocol handler. 
 * @param {Device} device - parent device.
 * @todo rework server state machine
 */
class SDO {
    constructor(device) {
        this.device = device;
        this.deviceId = device.deviceId;
        this.server = {
            state: State.NONE,
        };
    }

    get abortCodes() {
        return abortCodes;
    }

    serverStart() {
        if(this.server.state == State.NONE)
            this.server.state = State.IDLE;
    }

    serverStop() {
        this.server.state = State.NONE;
        if(this.server.timer) {
            clearTimeout(this.server.timer);
            this.server.timer = null;
        }
    }

    /** Upload the value from the remote device to the local copy.
     * @param {Object} entry - dataObject to upload.
     * @param {number} subIndex - data subIndex to upload.
     * @param {number} timeout - time before transfer is aborted.
     */
    upload(entry, subIndex=0, timeout=1000) {
        if(Array.isArray(entry)) {
            if(entry.length > 1) {
                return this.upload(entry[0], subIndex, timeout)
                    .then( () => { return this.upload(entry.slice(1), subIndex, timeout); }
                );
            }
            else entry = entry[0];
        }

        return new Promise((resolve, reject) => {
            const timer = setTimeout( () => { reject(new Error(abortCodes[0x05040000])); }, timeout);

            const sendBuffer = Buffer.alloc(8);
            sendBuffer[0] = (CCS.UPLOAD_INITIATE << 5);
            sendBuffer[1] = entry.index;
            sendBuffer[2] = (entry.index >> 8);
            sendBuffer[3] = subIndex;
            sendBuffer.fill(0, 4);

            let buffer = Buffer.from([]);
            let size = 0;
            let toggle = 1;

            const handler = (data) => {
                switch(data[0] >> 5) {
                    case SCS.ABORT:
                        clearTimeout(timer);
                        this.device.removeListener("SDO", handler);
                        reject(new Error(abortCodes[data.readUInt32LE(4)]));
                        break;

                    case SCS.UPLOAD_INITIATE:
                        if(data[0] & 0x02) {
                            // Expedited transfer
                            const count = (data[0] & 1) ? (4 - ((data[0] >> 2) & 3)) : 4;
                            size += count;

                            buffer = Buffer.from(data.slice(4, count+4));

                            const dataType = entry.data[subIndex].type;
                            entry.data[subIndex] = {
                                value:  this.device.rawToType(buffer, dataType),
                                type:   dataType,
                                raw:    buffer,
                                size:   size,
                            };
                            this.device.removeListener("SDO", handler);
                            resolve();
                        }
                        else {
                            // Segmented transfer
                            toggle ^= 1;
                            sendBuffer[0] = (CCS.UPLOAD_SEGMENT << 5);
                            sendBuffer[0] |= (toggle << 4);
                            sendBuffer.fill(0, 1);
                            this.device.channel.send({
                                id: 0x600 + this.deviceId,
                                ext: false,
                                rtr: false,
                                data: sendBuffer,
                            });
                        }
                        break;
                    case SCS.UPLOAD_SEGMENT:
                        if((data[0] & 0x10) == (toggle << 4)) {
                            const count = (7 - ((data[0] >> 1) & 0x7));
                            const payload = data.slice(1, count+1);
                            size += count;

                            buffer = Buffer.concat([buffer, payload], size);

                            if(data[0] & 1) {
                                const dataType = entry.data[subIndex].type;
                                entry.data[subIndex] = {
                                    value:  this.device.rawToType(buffer, dataType),
                                    type:   dataType,
                                    raw:    buffer,
                                    size:   size,
                                };
                                this.device.removeListener("SDO", handler);
                                resolve();
                            }
                            else {
                                toggle ^= 1;
                                sendBuffer[0] = (CCS.UPLOAD_SEGMENT << 5);
                                sendBuffer[0] |= (toggle << 4);
                                sendBuffer.fill(0, 1);
                                this.device.channel.send({
                                    id: 0x600 + this.deviceId,
                                    ext: false,
                                    rtr: false,
                                    data: sendBuffer,
                                });
                            }
                        }
                        break;
                }
            };
            this.device.on("SDO", handler);
            this.device.channel.send({
                id: 0x600 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        });
    }

    /** Download the value from the local copy to the remote device. 
     * @param {Object} entry - dataObject to download.
     * @param {number} subIndex - data subIndex to download.
     * @param {number} timeout - time before transfer is aborted.
     */
    download(entry, subIndex=0, timeout=1000) {
        if(Array.isArray(entry)) {
            if(entry.length > 1) {
                return this.download(entry[0], subIndex, timeout)
                    .then( () => { return this.download(entry.slice(1), subIndex, timeout); }
                );
            }
            else entry = entry[0];
        }

        return new Promise( (resolve, reject) => {
            const timer = setTimeout(()=>{ reject(new Error(abortCodes[0x05040000])); }, timeout);

            const sendBuffer = Buffer.alloc(8);
            sendBuffer[1] = entry.index;
            sendBuffer[2] = (entry.index >> 8);
            sendBuffer[3] = subIndex;

            let bufferOffset = 0;
            let toggle = 1;

            const size = entry.data[subIndex].size;
            if(size <= 4) {
                // Expedited transfer
                sendBuffer[0] = (CCS.DOWNLOAD_INITIATE << 5);
                sendBuffer[0] |= ((4-size) << 2) | 0x2;
                for(let i = 0; i < size; i++)
                    sendBuffer[4+i] = entry.data[subIndex].raw[i];

                if(size < 4)
                    sendBuffer[0] |= ((4 - size) << 2) | 0x1;

                bufferOffset = size;
            }
            else {
                // Segmented transfer
                sendBuffer[0] = (CCS.DOWNLOAD_INITIATE << 5) | 0x1;
                sendBuffer[4] = size;
                sendBuffer[5] = size >> 8;
                sendBuffer[6] = size >> 16;
                sendBuffer[7] = size >> 24;
            }

            const handler = (data) => {
                switch(data[0] >> 5) {
                    case SCS.ABORT:
                        clearTimeout(timer);
                        this.device.removeListener("SDO", handler);
                        reject(new Error(abortCodes[data.readUInt32LE(4)]));
                        break;
                    case SCS.DOWNLOAD_SEGMENT:
                        if((data[0] & 0x10) != (toggle << 4))
                            break;

                        toggle ^= 1;
                        /* falls through */
                    case SCS.DOWNLOAD_INITIATE:
                        if(bufferOffset < size) {
                            let count = Math.min(7, (size - bufferOffset));
                            for(let i = 0; i < count; i++)
                                sendBuffer[1+i] = entry.data[subIndex].raw[bufferOffset+i];

                            for(let i = count; i < 7; i++)
                                sendBuffer[1+i] = 0;

                            bufferOffset += count;
                            toggle ^= 1;

                            sendBuffer[0] = (toggle << 4) | (7-count) << 1;
                            if(bufferOffset == size)
                                sendBuffer[0] |= 1;

                            this.device.channel.send({
                                id: 0x600 + this.deviceId,
                                ext: false,
                                rtr: false,
                                data: sendBuffer,
                            });
                        }
                        else {
                            clearTimeout(timer);
                            this.device.removeListener("SDO", handler);
                            resolve();
                        }
                        break;
                }
            };
            this.device.on("SDO", handler);
            this.device.channel.send({
                id: 0x600 + this.deviceId,
                ext: false,
                rtr: false,
                data: sendBuffer,
            });
        });
    }

    /** Handle SDO requests directed at this device. 
     * @private
     * @param {Object} message - CAN frame to parse.
     */
    _serve(message) {
        switch(this.server.state) {
            case State.NONE:
                return;
            case State.IDLE:
                this._serveIdle(message.data);
                break;
            case State.UPLOAD:
                this._serveUpload(message.data);
                break;
            case State.DOWNLOAD:
                this._serveDownload(message.data);
                break;
        }
    }

    /** Handle State.IDLE. 
     * @private
     */
    _serveIdle(data) {
        const index = (data.readUInt16LE(1));
        const subIndex = (data.readUInt8(3));
        const entry = this.device.dataObjects[index];
        const size = entry.data[subIndex].size;

        switch(data[0] >> 5) {
            case CCS.DOWNLOAD_INITIATE:
                if(data[0] & 0x02) {
                    // Expedited transfer
                    const count = (data[0] & 1) ? (4 - ((data[0] >> 2) & 3)) : 4;
                    const entry = this.device.dataObjects[index];
                    const dataType = entry.data[subIndex].type;
                    const raw = data.slice(4, count+4);

                    entry.data[subIndex] = {
                        value:  this.device.rawToType(raw, dataType),
                        type:   dataType,
                        raw:    raw,
                        size:   raw.length,
                    };

                    const sendBuffer = Buffer.alloc(8);
                    sendBuffer[0] = (SCS.DOWNLOAD_INITIATE << 5) | 0x2;
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

                    this.server = {
                        state: State.DOWNLOAD,
                        index: index,
                        subIndex: subIndex,
                        toggle: 0,
                    };

                    this.server.buffer = Buffer.from([]);
                    this.server.timer = setTimeout(()=>{ this._serveAbort(0x05040000); }, 1000);

                    this.device.channel.send({
                        id: 0x580 + this.deviceId,
                        ext: false,
                        rtr: false,
                        data: sendBuffer,
                    });
                }
                break;
            case CCS.UPLOAD_INITIATE:
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

                    this.server = {
                        state: State.UPLOAD,
                        index: index,
                        subIndex: subIndex,
                        toggle: 0,
                    };

                    this.server.bufferOffset = 0;
                    this.server.timer = setTimeout(()=>{ this._serveAbort(0x05040000); }, 1000);

                    this.device.channel.send({
                        id: 0x580 + this.deviceId,
                        ext: false,
                        rtr: false,
                        data: sendBuffer,
                    });
                }
                break;
        }
    }

    /** Handle State.UPLOAD. 
     * @private
     */
    _serveUpload(data) {
        switch(data[0] >> 5) {
            case CCS.UPLOAD_SEGMENT:
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
                    if(this.server.bufferOffset == size) {
                        sendBuffer[0] |= 1;
                        clearTimeout(this.server.timer);
                        this.server.timer = null;
                        this.server.state = State.IDLE;
                    }

                    this.server.toggle ^= 1;
                    this.device.channel.send({
                        id: 0x580 + this.deviceId,
                        ext: false,
                        rtr: false,
                        data: sendBuffer,
                    });
                }
                else this._serveAbort(0x05030000);
                break;
        }
    }

    /** Handle State.DOWNLOAD. 
     * @private
     */
    _serveDownload(data) {
        switch(data[0] >> 5) {
            case CCS.DOWNLOAD_SEGMENT:
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
                        this.server.state = State.IDLE;
                    }

                    const sendBuffer = Buffer.alloc(8);
                    sendBuffer[0] = (SCS.DOWNLOAD_SEGMENT << 5);
                    sendBuffer[0] |= (this.server.toggle << 4);

                    this.device.channel.send({
                        id: 0x580 + this.deviceId,
                        ext: false,
                        rtr: false,
                        data: sendBuffer,
                    });
                    this.server.toggle ^= 1;
                }
                break;
            }
    }

    _serveAbort(code) {
        const sendBuffer = Buffer.alloc(8);
        sendBuffer[0] = (SCS.ABORT << 5);
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

        this.server.state = State.IDLE;
        if(this.server.timer) {
            clearTimeout(this.server.timer);
            this.server.timer = null;
        }
    }
}

module.exports=exports=SDO;
