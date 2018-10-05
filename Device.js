const fs = require('fs');
const ini = require('ini');
const EventEmitter = require('events');

const SDO = require('./protocol/SDO');
const PDO = require('./protocol/PDO');
const NMT = require('./protocol/NMT');
const EMCY = require('./protocol/Emergency');

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

const objectTypes = {
    NULL: 0,
    DOMAIN: 2,
    DEFTYPE: 5,
    DEFSTRUCT: 6,
    VAR: 7,
    ARRAY: 8,
    RECORD: 9,
};



class Device extends EventEmitter
{
    constructor(channel, deviceId, edsPath=null)
    {
        super();

        this.channel = channel;
        this.deviceId = deviceId;
        this.dataObjects = {};
        this.nameLookup = {};

        this.SDO = new SDO(this);
        this.PDO = new PDO(this);
        this.NMT = new NMT(this);
        this.EMCY = new EMCY();

        channel.addListener("onMessage", this._onMessage, this);

        if(edsPath)
        {
            const od = ini.parse(fs.readFileSync(edsPath, 'utf-8'));
            const indexMatch = RegExp('^[0-9A-Fa-f]{4}$')
            const subIndexMatch = RegExp('^([0-9A-Fa-f]{4})sub([0-9A-Fa-f]+)$')

            for(const [section, entry] of Object.entries(od))
            {
                if(indexMatch.test(section))
                {
                    const objectType = parseInt(entry.ObjectType);
                    let data = [];

                    if(objectType != objectTypes.ARRAY
                    && objectType != objectTypes.RECORD)
                    {
                        const dataType = parseInt(entry.DataType);
                        const value = this._parseTypedString(entry.DefaultValue, dataType);
                        const raw = this._typeToRaw(value, dataType);

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

                    try
                    {
                        this.nameLookup[entry.ParameterName].push(this.dataObjects[index]);
                    }
                    catch(TypeError)
                    {
                        this.nameLookup[entry.ParameterName] = [this.dataObjects[index]];
                    }

                    Object.defineProperties(this, {
                        [index]: {
                            get: ()=>{
                                return this.get(index);
                            },
                            set: ()=>{
                                throw TypeError("Read Only")
                            },
                        },
                    });

                    if(this[entry.ParameterName] == undefined)
                    {
                        Object.defineProperties(this, {
                            [entry.ParameterName]: {
                                get: ()=>{
                                    return this.get(index);
                                },
                                set: ()=>{
                                    throw TypeError("Read Only")
                                },
                            },
                        });
                    }
                }
                else if(subIndexMatch.test(section))
                {
                    const [main, sub] = section.split('sub');
                    const dataType = parseInt(entry.DataType);
                    const value = this._parseTypedString(entry.DefaultValue, dataType);
                    const raw = this._typeToRaw(value, dataType);

                    const index = parseInt(main, 16);
                    const subIndex = parseInt(sub, 16);
                    this.dataObjects[index].data[subIndex] = {
                        value:  value,
                        type:   dataType,
                        raw:    raw,
                        size:   raw.length,
                    }
                }
            }

            this.PDO.init();
        }
    }

    get(index)
    {
        let entry = this.dataObjects[index]
        if(entry == undefined)
        {
            entry = this.nameLookup[index];
            if(entry && entry.length == 1)
                entry = entry[0];
        }

        return entry;
    }

    _onMessage(message)
    {
        if(!message)
            return;
        
        if(message.id == 0x80 + this.deviceId)
            this.emit("Emergency", this.EMCY._parse(message));
        else if(message.id == 0x580 + this.deviceId)
            this.emit("SDO", message.data);
        else if(message.id >= 0x180 && message.id < 0x580)
            this.PDO._parse(message);
    }

    _rawToType(raw, dataType)
    {
        switch(dataType)
        {
            case dataTypes.BOOLEAN:
                return raw[0] != 0;
            case dataTypes.INTEGER8:
                return raw.readInt8(0);
            case dataTypes.UNSIGNED8:
                return raw.readUInt8(0);
            case dataTypes.INTEGER16:
                return raw.readInt16LE(0);
            case dataTypes.UNSIGNED16:
                return raw.readUInt16LE(0);
            case dataTypes.INTEGER32:
                return raw.readInt32LE(0);
            case dataTypes.UNSIGNED32:
                return raw.readUInt32LE(0);
            case dataTypes.REAL32:
                return raw.readFloatLE(0);
            case dataTypes.REAL64:
                return raw.readDoubleLE(0);
            case dataTypes.VISIBLE_STRING:
            default:
                return raw;
        }
    }

    _typeToRaw(value, dataType)
    {
        let raw;
        switch(dataType)
        {
            case dataTypes.BOOLEAN:
                raw = Buffer.from(value ? [1] : [0] );
                break;
            case dataTypes.INTEGER8:
                raw = Buffer.alloc(1);
                raw.writeInt8(value);
                break;
            case dataTypes.UNSIGNED8:
                raw = Buffer.alloc(1);
                raw.writeUInt8(value);
                break;
            case dataTypes.INTEGER16:
                raw = Buffer.alloc(2);
                raw.writeInt16LE(value);
                break;
            case dataTypes.UNSIGNED16:
                raw = Buffer.alloc(2);
                raw.writeUInt16LE(value);
                break;
            case dataTypes.INTEGER32:
                raw = Buffer.alloc(4);
                raw.writeInt32LE(value);
                break;
            case dataTypes.UNSIGNED32:
                raw = Buffer.alloc(4);
                raw.writeUInt32LE(value);
                break;
            case dataTypes.REAL32:
                raw = Buffer.alloc(4);
                raw.writeFloatLE(value);
                break;
            case dataTypes.REAL64:
                raw = Buffer.alloc(8);
                raw.writeDoubleLE(value);
                break;
            case dataTypes.OCTET_STRING:
                raw = Buffer.from(value);
            default:
                raw = value;
        }

        return raw;
    }

    _parseTypedString(data, dataType)
    {
        switch(dataType)
        {
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
}

module.exports=exports=Device;
