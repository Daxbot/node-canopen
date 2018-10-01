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

function parseRaw(dataType, data)
{
    let value, size, raw, buffer;

    switch(dataType)
    {
        case dataTypes.BOOLEAN:
            size = 1;
            value = data ? (parseInt(data) != 0) : false;
            raw = new Uint8Array( value ? [1] : [0] );
            break;
        case dataTypes.INTEGER8:
        case dataTypes.UNSIGNED8:
            size = 1;
            value = data ? parseInt(data) : 0;
            raw = new Uint8Array([value]);
            break;
        case dataTypes.INTEGER16:
        case dataTypes.UNSIGNED16:
            size = 2;
            value = data ? parseInt(data) : 0;
            buffer = new ArrayBuffer(size);
            new Uint16Array(buffer).set([value]);
            raw = new Uint8Array(buffer);
            break;
        case dataTypes.INTEGER32:
        case dataTypes.UNSIGNED32:
            size = 4;
            value = data ? parseInt(data) : 0;
            buffer = new ArrayBuffer(size);
            new Uint32Array(buffer).set([value]);
            raw = new Uint8Array(buffer);
            break;
        case dataTypes.UNSIGNED64:
        case dataTypes.INTEGER64:
            size = 8;
            value = data ? parseInt(data) : 0;
            raw = new Uint8Array(size);
            raw[0] = value >> 54;
            raw[1] = value >> 48;
            raw[2] = value >> 40;
            raw[3] = value >> 32;
            raw[4] = value >> 24;
            raw[5] = value >> 16;
            raw[6] = value >> 8;
            raw[7] = value >> 0;
            break;
        case dataTypes.REAL32:
            size = 4;
            value = data ? parseFloat(data) : 0.0;
            buffer = new ArrayBuffer(size);
            new Float32Array(buffer).set([value]);
            raw = new Uint8Array(buffer);
            break;
        case dataTypes.REAL64:
            size = 8;
            value = data ? parseFloat(data) : 0.0;
            buffer = new ArrayBuffer(size);
            new Float64Array(buffer).set([value]);
            raw = new Uint8Array(buffer);
            break;
        case dataTypes.OCTET_STRING:
            value = raw = data ? Uint8Array.from(data) : new Uint8Array();
            size = value.length;
            break;

        default:
            value = data ? data : "";
            raw = Uint8Array.from(value);
            size = raw.length;
    }

    return [value, size, raw];
}

class Device extends EventEmitter
{
    constructor(channel, deviceId, edsPath)
    {
        super();

        this.channel = channel;
        this.deviceId = deviceId;
        this.dataObjects = {};

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

                let value, size, raw;
                if(objectType == objectTypes.ARRAY 
                || objectType == objectTypes.RECORD)
                {
                    value = [];
                    size = [];
                    raw = [];
                }
                else
                    [value, size, raw] = parseRaw(dataType, data.DefaultValue);

                this.dataObjects[section] = {
                    name:       data.ParameterName,
                    index:      parseInt(section, 16),
                    dataType:   dataType,
                    objectType: objectType,
                    access:     (data.AccessType) ? data.AccessType : 'rw',
                    value:      value,
                    size:       size,
                    raw:        raw,
                };

                Object.defineProperties(this, {
                    [section]: {
                        get: ()=>{
                            return this.dataObjects[section];
                        },
                        set: (data)=>{
                            const dataType = this.dataObjects[section].dataType;
                            const [value, size, raw] = parseRaw(dataType, data);
                            this.dataObjects[section].value = value;
                            this.dataObjects[section].raw = raw;
                            this.dataObjects[section].size = size;
                        },
                    },
                });
            }
            else if(subIndexMatch.test(section))
            {
                const [main, sub] = section.split('sub');
                if(sub != '0')
                {
                    const dataType = parseInt(data.DataType);
                    const [value, size, raw] = parseRaw(dataType, data.DefaultValue);

                    this.dataObjects[main].dataType = dataType;
                    this.dataObjects[main].value[parseInt(sub)-1] = value; 
                    this.dataObjects[main].size[parseInt(sub)-1] = size; 
                    this.dataObjects[main].raw[parseInt(sub)-1] = raw; 
                }
            }
        }
    }

    _onMessage(msg)
    {
        if(!msg || msg.rtr || msg.ext)
            return;
        
        if(msg.id == 0x80 + this.deviceId)
        {
            this.EMCY.parse(msg);
        }
        if(msg.id == 0x580 + this.deviceId)
        {
            if(msg.data[0] == 0x80)
                this.emit(
                    "Abort"+msg.data.readUInt16LE(1).toString(16),
                    msg.data.readUInt32LE(3)
                );
            else
                this.emit("SDO"+msg.data.readUInt16LE(1).toString(16));
        }
        else if(msg.id == 0x180 + this.deviceId
             || msg.id == 0x280 + this.deviceId
             || msg.id == 0x380 + this.deviceId
             || msg.id == 0x480 + this.deviceId)
        {
            this.emit("PDO"+msg.id.toString(16));
        }
        
    }
}

module.exports=exports=Device