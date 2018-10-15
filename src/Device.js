const fs = require('fs');
const ini = require('ini');
const EventEmitter = require('events');

const SDO = require('./protocol/SDO');
const PDO = require('./protocol/PDO');
const NMT = require('./protocol/NMT');
const EMCY = require('./Emergency');

 /** CANopen EDS data types.
  * @protected
  * @const {number}
  * @memberof Device
  */
const dataTypes = {
    BOOLEAN: 1,
    INTEGER8: 2,
    INTEGER16: 3,
    INTEGER32: 4,
    UNSIGNED8: 5,
    UNSIGNED16: 6,
    UNSIGNED32: 7,
    REAL32: 8,
    VISIBLE_STRING: 9,
    OCTET_STRING: 10,
    UNICODE_STRING: 11,
    TIME_OF_DAY: 12,
    TIME_DIFFERENCE: 13,
    DOMAIN: 15,
    REAL64: 17,
    INTEGER24: 16,
    INTEGER40: 18,
    INTEGER48: 19,
    INTEGER56: 20,
    INTEGER64: 21,
    UNSIGNED24: 22,
    UNSIGNED40: 24,
    UNSIGNED48: 25,
    UNSIGNED56: 26,
    UNSIGNED64: 27,
    PDO_PARAMETER: 32,
    PDO_MAPPING: 33,
    SDO_PARAMETER: 34,
    IDENTITY: 35,
};

 /** CANopen EDS object types.
  * @protected
  * @const {number}
  * @memberof Device
  */
const objectTypes = {
    NULL: 0,
    DOMAIN: 2,
    DEFTYPE: 5,
    DEFSTRUCT: 6,
    VAR: 7,
    ARRAY: 8,
    RECORD: 9,
};

/** CANopen device 
 * @param {RawChannel} channel - socketcan RawChannel object.
 * @param {number} deviceId - device identifier.
 * @param {string | null} edsPath - path to the device's electronic data sheet.
 * @param {boolean} heartbeat - enable heartbeat production.
 */
class Device extends EventEmitter {
    constructor(channel, deviceId, edsPath=null, heartbeat=false) {
        if(channel.send == undefined)
            throw ReferenceError("arg0 'channel' has no send method");

        if(channel.addListener == undefined)
            throw ReferenceError("arg0 'channel' has no addListener method");

        if(!deviceId || deviceId > 0x7F)
            throw RangeError("ID must be in range 1-127");

        super();
        this.channel = channel;
        this.deviceId = deviceId;
        this.dataObjects = {};
        this.nameLookup = {};

        this._SDO = new SDO(this);
        this._PDO = new PDO(this);
        this._NMT = new NMT(this);

        channel.addListener("onMessage", this._onMessage, this);

        if(edsPath) {
            const od = ini.parse(fs.readFileSync(edsPath, 'utf-8'));
            const indexMatch = RegExp('^[0-9A-Fa-f]{4}$');
            const subIndexMatch = RegExp('^([0-9A-Fa-f]{4})sub([0-9A-Fa-f]+)$');

            for(const [section, entry] of Object.entries(od)) {
                if(indexMatch.test(section)) {
                    const objectType = parseInt(entry.ObjectType);
                    let data = [];

                    if(objectType != objectTypes.ARRAY && objectType != objectTypes.RECORD) {
                        const dataType = parseInt(entry.DataType);
                        const value = this._parseTypedString(entry.DefaultValue, dataType);
                        const raw = this.typeToRaw(value, dataType);

                        data[0] = {
                            value:  value,
                            type:   dataType,
                            raw:    raw,
                            size:   raw.length,
                        };
                    }

                    const index = parseInt(section, 16);
                    this.dataObjects[index] = {
                        name:       entry.ParameterName,
                        index:      index,
                        objectType: objectType,
                        access:     (entry.AccessType) ? entry.AccessType : 'rw',
                        data:       data,
                    };

                    try {
                        this.nameLookup[entry.ParameterName].push(this.dataObjects[index]);
                    }
                    catch(TypeError) {
                        this.nameLookup[entry.ParameterName] = [this.dataObjects[index]];
                    }
                }
                else if(subIndexMatch.test(section)) {
                    const [main, sub] = section.split('sub');
                    const dataType = parseInt(entry.DataType);
                    const value = this._parseTypedString(entry.DefaultValue, dataType);
                    const raw = this.typeToRaw(value, dataType);

                    const index = parseInt(main, 16);
                    const subIndex = parseInt(sub, 16);
                    this.dataObjects[index].data[subIndex] = {
                        value:  value,
                        type:   dataType,
                        raw:    raw,
                        size:   raw.length,
                    };
                }
            }

            this.PDO.init();

            if(heartbeat) {
                const heartbeatTime = this.getValue(0x1017, 0);
                if(heartbeatTime > 0) {
                    this.hearbeat = setInterval(
                        () => { this._sendHeartbeat(); }, heartbeatTime);
                }
            }
        }
    }

    get SDO() { 
        return this._SDO; 
    }
    get PDO() { 
        return this._PDO; 
    }
    get NMT() { 
        return this._NMT; 
    }
    get dataTypes() { 
        return dataTypes; 
    }
    get objectTypes() { 
        return objectTypes; 
    }

    /** Get a dataObject.
     * @param {number | string} index - index or name of the dataObject.
     */
    getEntry(index) {
        let entry = this.dataObjects[index];
        if(entry == undefined)
        {
            entry = this.nameLookup[index];
            if(entry && entry.length == 1)
                entry = entry[0];
        }

        return entry;
    }

    /** Get the value of a dataObject.
     * @param {number | string} index - index or name of the dataObject.
     */
    getValue(index, subIndex) {
        const entry = this.getEntry(index);
        if(entry && Array.isArray(entry))
            throw TypeError("Ambiguous name: " + index);

        return entry.data[subIndex].value;
    }

    /** Get the raw value of a dataObject.
     * @param {number | string} index - index or name of the dataObject.
     */
    getRaw(index, subIndex) {
        const entry = this.getEntry(index);
        if(entry && Array.isArray(entry))
            throw TypeError("Ambiguous name: " + index);

        return entry.data[subIndex].raw;
    }

    /** Set the value of a dataObject.
     * @param {number | string} index - index or name of the dataObject.
     */
    setValue(index, subIndex, value) {
        const entry = this.getEntry(index);
        if(entry && Array.isArray(entry))
            throw TypeError("Ambiguous name: " + index);

        if(value !== entry.data[subIndex].value) {
            const dataType = entry.data[subIndex].type;
            const raw = this.typeToRaw(value, dataType);
            entry.data[subIndex] = {
                value:      value,
                type:       dataType,
                raw:        raw,
                size:       raw.length,
                changed:    true,
            };
        }
    }

    /** Set the raw value of a dataObject.
     * @param {number | string} index - index or name of the dataObject.
     */
    setRaw(index, subIndex, raw) {
        const entry = this.getEntry(index);
        if(entry && Array.isArray(entry))
            throw TypeError("Ambiguous name: " + index);

        const dataType = entry.data[subIndex].type;
        const value = this.rawToType(raw, dataType);
        if(value !== entry.data[subIndex].value) {
            entry.data[subIndex] = {
                value:      value,
                type:       dataType,
                raw:        raw,
                size:       raw.length,
                changed:    true,
            };
        }
    }

    /** Convert a Buffer object to a value based on type.
     * @param {Buffer} raw - data to convert.
     * @param {dataTypes} dataType - type of the data.
     * @return {number | string}
     */
    rawToType(raw, dataType) {
        switch(dataType) {
            case dataTypes.BOOLEAN:
                return raw[0] != 0;
            case dataTypes.INTEGER8:
                return raw.readInt8(0);
            case dataTypes.INTEGER16:
                return raw.readInt16LE(0);
            case dataTypes.INTEGER32:
                return raw.readInt32LE(0);
            case dataTypes.UNSIGNED8:
                return raw.readUInt8(0);
            case dataTypes.UNSIGNED16:
                return raw.readUInt16LE(0);
            case dataTypes.UNSIGNED32:
            case dataTypes.TIME_OF_DAY:
            case dataTypes.TIME_DIFFERENCE:
                return raw.readUInt32LE(0);
            case dataTypes.REAL32:
                return raw.readFloatLE(0);
            case dataTypes.REAL64:
                return raw.readDoubleLE(0);
            case dataTypes.VISIBLE_STRING:
            case dataTypes.OCTET_STRING:
            case dataTypes.UNICODE_STRING:
                return raw.toString();
            default:
                return raw;
        }
    }

    /** Convert a value to a Buffer object based on type.
     * @param {number | string} value - data to convert.
     * @param {dataTypes} dataType - type of the data.
     * @return {Buffer}
     */
    typeToRaw(value, dataType) {
        let raw = Buffer.alloc(0);
        if(value == null)
            return raw;

        switch(dataType) {
            case dataTypes.BOOLEAN:
                raw = Buffer.from(value ? [1] : [0] );
                break;
            case dataTypes.INTEGER8:
            case dataTypes.UNSIGNED8:
                raw = Buffer.from([value & 0xFF]);
                break;
            case dataTypes.INTEGER16:
            case dataTypes.UNSIGNED16:
                raw = Buffer.alloc(2);
                raw[0] = ((value >>> 0) & 0xFF);
                raw[1] = ((value >>> 8) & 0xFF);
                break;
            case dataTypes.INTEGER24:
            case dataTypes.UNSIGNED24:
                raw = Buffer.alloc(3);
                for(let i = 0; i < 3; i++)
                    raw[i] = ((value >>> i*8) & 0xFF);
                break;
            case dataTypes.INTEGER32:
            case dataTypes.UNSIGNED32:
            case dataTypes.TIME_OF_DAY:
            case dataTypes.TIME_DIFFERENCE:
                raw = Buffer.alloc(4);
                for(let i = 0; i < 4; i++)
                    raw[i] = ((value >>> i*8) & 0xFF);
                break;
            case dataTypes.INTEGER40:
            case dataTypes.UNSIGNED40:
                raw = Buffer.alloc(5);
                for(let i = 0; i < 5; i++)
                    raw[i] = ((value >>> i*8) & 0xFF);
                break;
            case dataTypes.INTEGER48:
            case dataTypes.UNSIGNED48:
                raw = Buffer.alloc(6);
                for(let i = 0; i < 6; i++)
                    raw[i] = ((value >>> i*8) & 0xFF);
                break;
            case dataTypes.INTEGER56:
            case dataTypes.UNSIGNED56:
                raw = Buffer.alloc(7);
                for(let i = 0; i < 7; i++)
                    raw[i] = ((value >>> i*8) & 0xFF);
                break;
            case dataTypes.INTEGER64:
            case dataTypes.UNSIGNED64:
                raw = Buffer.alloc(8);
                for(let i = 0; i < 8; i++)
                    raw[i] = ((value >>> i*8) & 0xFF);
                break;
            case dataTypes.REAL32:
                raw = Buffer.alloc(4);
                raw.writeFloatLE(value);
                break;
            case dataTypes.REAL64:
                raw = Buffer.alloc(8);
                raw.writeDoubleLE(value);
                break;
            case dataTypes.VISIBLE_STRING:
            case dataTypes.OCTET_STRING:
            case dataTypes.UNICODE_STRING:
                raw = Buffer.from(value);
                break;
        }

        return raw;
    }

    /** Parse an EDS string based on type.
     * @private
     * @param {string} data - data to convert.
     * @param {dataTypes} dataType - type of the data.
     * @return {number | string | Buffer}
     */
    _parseTypedString(data, dataType) {
        switch(dataType) {
            case dataTypes.BOOLEAN:
                return data ? (parseInt(data) != 0) : false;
            case dataTypes.INTEGER8:
            case dataTypes.UNSIGNED8:
            case dataTypes.INTEGER16:
            case dataTypes.UNSIGNED16:
            case dataTypes.INTEGER32:
            case dataTypes.UNSIGNED32:
                return data ? parseInt(data) : 0;
            case dataTypes.REAL32:
            case dataTypes.REAL64:
                return data ? parseFloat(data) : 0.0;
            case dataTypes.OCTET_STRING:
                return data ? Buffer.from(data) : Buffer.alloc(0);
            default:
                return data ? data : "";
        }
    }

    /** socketcan 'onMessage' listener.
     * @private
     * @param {Object} message - CAN frame.
     */
    _onMessage(message) {
        if(!message)
            return;
        
        if(message.id >= 0x180 && message.id < 0x580) {
            const updated = this.PDO._process(message);
            if(updated.length > 0)
                this.emit('PDO', updated);
        }
        else switch(message.id - this.deviceId) {
            case 0x80:
                this.emit('Emergency', this.deviceId, EMCY._process(message));
                break;
            case 0x580:
                this.SDO._clientProcess(message);
                break;
            case 0x600:
                this.SDO._serverProcess(message);
                break;
            case 0x700:
                this.NMT._process(message);
                break;
        }
    }

    /** Serve a Heartbeat object to the channel.
     * @private
     */
    _sendHeartbeat() {
        this.channel.send({
            id: 0x700 + this.deviceId,
            ext: false,
            rtr: false,
            data: Buffer.from([this.NMT.status])
        });
    }
}

module.exports=exports= Device;
