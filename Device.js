const fs = require('fs');
const ini = require('ini');
const EventEmitter = require('events');

const SDO = require('./protocol/SDO');
const PDO = require('./protocol/PDO');
const NMT = require('./protocol/NMT');
const EMCY = require('./protocol/Emergency');

const dataTypeLookup = {
    1:  'BOOLEAN',
    2:  'INTEGER8',
    3:  'INTEGER16',
    4:  'INTEGER32',
    5:  'UNSIGNED8',
    6:  'UNSIGNED16',
    7:  'UNSIGNED32',
    8:  'REAL32',
    9:  'VISIBLE_STRING',
    10: 'OCTET_STRING',
    11: 'UNICODE_STRING',
    12: 'TIME_OF_DAY',
    13: 'TIME_DIFFERENCE',
    15: 'DOMAIN',
    17: 'REAL64',
    18: 'INTEGER40',
    19: 'INTEGER48',
    20: 'INTEGER56',
    21: 'INTEGER64',
    22: 'UNSIGNED24',
    24: 'UNSIGNED40',
    25: 'UNSIGNED48',
    26: 'UNSIGNED56',
    27: 'UNSIGNED64',
    32: 'PDO_PARAMETER',
    33: 'PDO_MAPPING',
    34: 'SDO_PARAMETER',
    35: 'IDENTITY',
};

function parseDataType(type)
{
    return dataTypeLookup[parseInt(type)];
}

const objectTypeLookup = {
    0: 'NULL',
    2: 'DOMAIN',
    5: 'DEFTYPE',
    6: 'DEFSTRUCT',
    7: 'VAR',
    8: 'ARRAY',
    9: 'RECORD',
};

function parseObjectType(type)
{
    return objectTypeLookup[parseInt(type)];
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

        let od = ini.parse(fs.readFileSync(edsPath, 'utf-8'));
        const indexMatch = RegExp('^[0-9A-Fa-f]{4}$')
        const subIndexMatch = RegExp('^([0-9A-Fa-f]{4})sub([0-9A-Fa-f]+)$')

        for(const [section, data] of Object.entries(od))
        {
            if(indexMatch.test(section))
            {
                let dataType = parseDataType(data.DataType);
                let objectType = parseObjectType(data.ObjectType);
                let value;

                if(objectType == 'ARRAY' || objectType == 'RECORD')
                {
                    value = [];
                }
                else switch(dataType)
                {
                    case 'BOOLEAN':
                    case 'INTEGER8':
                    case 'INTEGER16':
                    case 'INTEGER32':
                    case 'INTEGER64':
                    case 'UNSIGNED8':
                    case 'UNSIGNED16':
                    case 'UNSIGNED32':
                    case 'UNSIGNED64':
                        if(data.DefaultValue)
                            value = parseInt(data.DefaultValue);
                        else
                            value = 0;
                        break;
                    case 'REAL32':
                    case 'REAL64':
                        if(data.DefaultValue)
                            value = parseFloat(data.DefaultValue);
                        else
                            value = 0.0;
                        break;
                    case 'OCTET_STRING':
                        if(data.DefaultValue)
                            value = Uint8ClampedArray.from(data.DefaultValue);
                        else
                            value = new Uint8ClampedArray();
                        break;
                    default:
                        value = data.DefaultValue;
                        break;
                }

                this.dataObjects[section] = {
                    'name':         data.ParameterName,
                    'dataType':     dataType,
                    'objectType':   parseObjectType(data.ObjectType),
                    'access':       (data.AccessType) ? data.AccessType : 'rw',
                    'value':        value,
                };

                this[data.ParameterName] = this.dataObjects[section];
            }
            else if(subIndexMatch.test(section))
            {
                let [index, sub] = section.split('sub');
                if(sub != '0')
                {
                    let dataType = parseDataType(data.DataType);
                    let value;

                    switch(dataType)
                    {
                        case 'BOOLEAN':
                        case 'INTEGER8':
                        case 'INTEGER16':
                        case 'INTEGER32':
                        case 'INTEGER64':
                        case 'UNSIGNED8':
                        case 'UNSIGNED16':
                        case 'UNSIGNED32':
                        case 'UNSIGNED64':
                            if(data.DefaultValue)
                                value = parseInt(data.DefaultValue);
                            else
                                value = 0;
                            break;
                        case 'REAL32':
                        case 'REAL64':
                            if(data.DefaultValue)
                                value = parseFloat(data.DefaultValue);
                            else
                                value = 0.0;
                            break;
                        case 'OCTET_STRING':
                            if(data.DefaultValue)
                                value = Uint8ClampedArray.from(data.DefaultValue);
                            else
                                value = new Uint8ClampedArray();
                            break;
                        default:
                            value = data.DefaultValue;
                            break;
                    }

                    this.dataObjects[index]['dataType'] = dataType;
                    this.dataObjects[index].value[parseInt(sub)-1] = value; 
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
            // SDO
            this.emit("SDO");
        }
        else if(msg.id == 0x180 + this.deviceId)
        {
            // PDO0
            this.emit("PDO0");
        }
        else if(msg.id == 0x280 + this.deviceId)
        {
            // PDO1
            this.emit("PDO1");
        }
        else if(msg.id == 0x380 + this.deviceId)
        {
            // PDO2
            this.emit("PDO2");
        }
        else if(msg.id == 0x480 + this.deviceId)
        {
            // PDO3
            this.emit("PDO3");
        }
        
    }
}

module.exports=exports=Device