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
    constructor(channel, deviceId, edsPath)
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

        const od = ini.parse(fs.readFileSync(edsPath, 'utf-8'));
        const indexMatch = RegExp('^[0-9A-Fa-f]{4}$')
        const subIndexMatch = RegExp('^([0-9A-Fa-f]{4})sub([0-9A-Fa-f]+)$')

        for(const [section, data] of Object.entries(od))
        {
            if(indexMatch.test(section))
            {
                const dataType = parseInt(data.DataType);
                const objectType = parseInt(data.ObjectType);

                let value, raw, size;
                if(objectType == objectTypes.ARRAY 
                || objectType == objectTypes.RECORD)
                {
                    value = [];
                    raw = [];
                    size = [];
                }
                else
                {
                    value = this._parseTypedString(data.DefaultValue, dataType);
                    raw = this._typeToRaw(value, dataType);
                    size = raw.length;
                }

                this.dataObjects[section] = {
                    name:       data.ParameterName,
                    index:      parseInt(section, 16),
                    dataType:   dataType,
                    objectType: objectType,
                    access:     (data.AccessType) ? data.AccessType : 'rw',
                    value:      value,
                    raw:        raw,
                    size:       size,
                };

                try
                {
                    this.nameLookup[data.ParameterName].push(this.dataObjects[section]);
                }
                catch(TypeError)
                {
                    this.nameLookup[data.ParameterName] = [this.dataObjects[section]];
                }

                Object.defineProperties(this, {
                    [section]: {
                        get: ()=>{
                            return this.get(section);
                        },
                        set: ()=>{
                            throw TypeError("Read Only")
                        },
                    },
                });

                if(this[data.ParameterName] == undefined)
                {
                    Object.defineProperties(this, {
                        [data.ParameterName]: {
                            get: ()=>{
                                return this.get(section);
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
                if(sub != '0')
                {
                    const dataType = parseInt(data.DataType);
                    const value = this._parseTypedString(data.DefaultValue, dataType);
                    const raw = this._typeToRaw(value, dataType);

                    this.dataObjects[main].dataType = dataType;
                    this.dataObjects[main].value[parseInt(sub)-1] = value; 
                    this.dataObjects[main].raw[parseInt(sub)-1] = raw; 
                    this.dataObjects[main].size[parseInt(sub)-1] = raw.length; 
                }
            }
        }
    }

    update(index, subIndex, value=null, timeout=500)
    {
        if(value == null || value == undefined)
            return this.SDO.upload(index, subIndex, timeout);
        else
            return this.SDO.download(index, subIndex, value, timeout);
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

    _onMessage(msg)
    {
        if(!msg || msg.rtr || msg.ext)
            return;
        
        if(msg.id == 0x80 + this.deviceId)
        {
            this.emit("Emergency", this.EMCY.parse(msg));
        }
        if(msg.id == 0x580 + this.deviceId)
        {
            this.emit("SDO", msg.data);
        }
        else if(msg.id == 0x180 + this.deviceId
             || msg.id == 0x280 + this.deviceId
             || msg.id == 0x380 + this.deviceId
             || msg.id == 0x480 + this.deviceId)
        {
            this.emit("PDO"+msg.id.toString(16));
        }
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
