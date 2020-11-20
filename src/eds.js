const fs = require('fs');
const ini = require('ini');
const util = require('util');
const { EOL } = require('os');
const EventEmitter = require('events');

/**
 * CANopen object types.
 * @enum {number}
 * @see CiA301 "Object code usage" (§7.4.3)
 * @memberof Eds
 */
const ObjectType = {
    NULL: 0,
    DOMAIN: 2,
    DEFTYPE: 5,
    DEFSTRUCT: 6,
    VAR: 7,
    ARRAY: 8,
    RECORD: 9,
};

/**
 * CANopen access types.
 * @enum {string}
 * @see CiA301 "Access usage" (§7.4.5)
 * @memberof Eds
 */
const AccessType = {
    READ_WRITE: 'rw',
    WRITE_ONLY: 'wo',
    READ_ONLY:  'ro',
    CONSTANT:   'const',
};

/**
 * CANopen data types.
 * @enum {number}
 * @see CiA301 "Data type entry usage" (§7.4.7)
 * @memberof Eds
 */
const DataType = {
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

/**
 * Convert a Buffer object to a value based on type.
 * @param {Buffer} raw - data to convert.
 * @param {DataType} type - how to interpret the data.
 * @return {number | string}
 * @memberof Eds
 */
function rawToType(raw, type) {
    if(typeof type === 'string')
        type = DataType[type];

    switch(type) {
        case DataType.BOOLEAN:
            return !!raw.readUInt8();
        case DataType.INTEGER8:
            return raw.readInt8();
        case DataType.INTEGER16:
            return raw.readInt16LE();
        case DataType.INTEGER24:
            return raw.readIntLE(0, 3);
        case DataType.INTEGER32:
            return raw.readInt32LE();
        case DataType.INTEGER40:
            return raw.readIntLE(0, 5);
        case DataType.INTEGER48:
            return raw.readIntLE(0, 6);
        case DataType.UNSIGNED8:
            return raw.readUInt8();
        case DataType.UNSIGNED16:
            return raw.readUInt16LE();
        case DataType.UNSIGNED24:
            return raw.readUIntLE(0, 3);
        case DataType.UNSIGNED32:
            return raw.readUInt32LE();
        case DataType.UNSIGNED40:
            return raw.readUIntLE(0, 5);
        case DataType.UNSIGNED48:
            return raw.readUIntLE(0, 6);
        case DataType.REAL32:
            return raw.readFloatLE();
        case DataType.REAL64:
            return raw.readDoubleLE();
        case DataType.VISIBLE_STRING:
        case DataType.UNICODE_STRING:
            raw = raw.toString();
            const end = raw.indexOf('\0');
            if(end != -1)
                raw = raw.substring(0, end);
            return raw;
        case DataType.TIME_OF_DAY:
        case DataType.TIME_DIFFERENCE:
            const ms = raw.readUInt32LE(0);
            const days = raw.readUInt16LE(4);
            return new Date(days * 8.64e7 + ms);
        default:
            return raw;
    }
}

/**
 * Convert a value to a Buffer object based on type.
 * @param {number | string | Date} value - data to convert.
 * @param {number} type - how to interpret the data.
 * @return {Buffer}
 * @memberof Eds
 */
function typeToRaw(value, type) {
    if(value === undefined || value === null)
        value = 0;

    if(typeof type === 'string')
        type = DataType[type];

    let raw;
    switch(type) {
        case DataType.BOOLEAN:
            raw = Buffer.from(value ? [1] : [0] );
            break;
        case DataType.INTEGER8:
            raw = Buffer.alloc(1);
            raw.writeInt8(value)
            break;
        case DataType.UNSIGNED8:
            raw = Buffer.alloc(1);
            raw.writeUInt8(value)
            break;
        case DataType.INTEGER16:
            raw = Buffer.alloc(2);
            raw.writeInt16LE(value);
            break;
        case DataType.UNSIGNED16:
            raw = Buffer.alloc(2);
            raw.writeUInt16LE(value);
            break;
        case DataType.INTEGER24:
            raw = Buffer.alloc(3);
            raw.writeIntLE(value, 0, 3);
            break;
        case DataType.UNSIGNED24:
            raw = Buffer.alloc(3);
            raw.writeUIntLE(value, 0, 3);
            break;
        case DataType.INTEGER32:
            raw = Buffer.alloc(4);
            raw.writeInt32LE(value);
            break;
        case DataType.UNSIGNED32:
            raw = Buffer.alloc(4);
            raw.writeUInt32LE(value);
            break;
        case DataType.INTEGER40:
            raw = Buffer.alloc(5);
            raw.writeIntLE(value, 0, 5);
            break;
        case DataType.UNSIGNED40:
            raw = Buffer.alloc(5);
            raw.writeUIntLE(value, 0, 5);
            break;
        case DataType.INTEGER48:
            raw = Buffer.alloc(6);
            raw.writeIntLE(value, 0, 6);
            break;
        case DataType.UNSIGNED48:
            raw = Buffer.alloc(6);
            raw.writeUIntLE(value, 0, 6);
            break;
        case DataType.INTEGER56:
        case DataType.UNSIGNED56:
            raw = Buffer.alloc(7);
            for(let i = 0; i < 7; i++)
                raw[i] = ((value >>> i*8) & 0xFF);
            break;
        case DataType.INTEGER64:
        case DataType.UNSIGNED64:
            raw = Buffer.alloc(8);
            for(let i = 0; i < 8; i++)
                raw[i] = ((value >>> i*8) & 0xFF);
            break;
        case DataType.REAL32:
            raw = Buffer.alloc(4);
            raw.writeFloatLE(value);
            break;
        case DataType.REAL64:
            raw = Buffer.alloc(8);
            raw.writeDoubleLE(value);
            break;
        case DataType.VISIBLE_STRING:
            raw = (value) ? Buffer.from(value) : Buffer.alloc(0);
            const end = raw.indexOf('\0');
            if(end != -1)
                raw = raw.subarray(0, end);
            break;
        case DataType.OCTET_STRING:
        case DataType.UNICODE_STRING:
            raw = (value) ? Buffer.from(value) : Buffer.alloc(0);
            break;
        case DataType.TIME_OF_DAY:
        case DataType.TIME_DIFFERENCE:
            raw = Buffer.alloc(6);
            if(util.types.isDate(value)) {
                // Days since epoch
                const days = Math.floor(value.getTime() / 8.64e7);

                // Milliseconds since midnight
                const ms = value.getTime() - (days * 8.64e7);

                raw.writeUInt32LE(ms, 0);
                raw.writeUInt16LE(days, 4);
            }
            break;
    }

    return raw;
}

/**
 * A Canopen Data Object.
 * @param {number} index - index of the data object.
 * @param {number | null} subIndex - subIndex of the data object.
 * @param {Object} args
 * @param {string} args.ParameterName - name of the data object.
 * @param {ObjectType} args.ObjectType - object type.
 * @param {DataType} args.DataType - data type.
 * @param {AccessType} args.AccessType - access restrictions.
 * @param {number} args.LowLimit - minimum value.
 * @param {number} args.HighLimit - maximum value.
 * @param {number} args.SubNumber - number of sub-objects.
 * @param {boolean} args.PDOMapping - enable PDO mapping.
 * @param {boolean} args.CompactSubObj - use the compact sub-object format.
 * @param {number | string | Date} args.DefaultValue - default value.
 *
 * @emits 'update' on value change.
 *
 * @see CiA306 "Object descriptions" (§4.6.3)
 * @memberof Eds
 * @protected
 */
class DataObject extends EventEmitter {
    constructor(index, subIndex, args) {
        super();

        this.index = index;
        this.subIndex = subIndex;

        if(args instanceof DataObject)
            args = args.objectify();

        this.parameterName = args['ParameterName'];
        if(this.parameterName === undefined) {
            throw TypeError('ParameterName is mandatory for DataObject');
        }

        this.subNumber = parseInt(args['SubNumber']) || undefined;
        this.objectType = parseInt(args['ObjectType']) || undefined;
        this.dataType = parseInt(args['DataType']) || undefined;
        this.lowLimit = parseInt(args['LowLimit']) || undefined;
        this.highLimit = parseInt(args['HighLimit']) || undefined;
        this.accessType = args['AccessType'];
        this.defaultValue = args['DefaultValue'];
        this.pdoMapping = args['PDOMapping'];
        this.objFlags = parseInt(args['ObjFlags']) || undefined;
        this.compactSubObj = parseInt(args['CompactSubObj']) || undefined;

        if(this.objectType === undefined) {
            this.objectType = ObjectType.VAR;
        }

        switch(this.objectType) {
            case ObjectType.DEFTYPE:
            case ObjectType.VAR:
                // Mandatory args
                if(this.dataType === undefined) {
                    throw TypeError(`DataType is mandatory for type ${this.objectTypeString}`);
                }

                if(this.accessType === undefined) {
                    throw TypeError(`AccessType is mandatory for type ${this.objectTypeString}`);
                }

                // Not supported args
                if(this.subNumber !== undefined) {
                    throw TypeError(`SubNumber is not supported for type ${this.objectTypeString}`);
                }

                if(this.compactSubObj !== undefined) {
                    throw TypeError(`CompactSubObj is not supported for type ${this.objectTypeString}`);
                }

                // Optional args
                if(this.pdoMapping === undefined) {
                    this.pdoMapping = false;
                }

                break;

            case ObjectType.DEFSTRUCT:
            case ObjectType.ARRAY:
            case ObjectType.RECORD:
                if(this.compactSubObj) {
                    // Mandatory args
                    if(this.dataType === undefined) {
                        throw TypeError(`DataType is mandatory for compact type ${this.objectTypeString}`);
                    }
                    if(this.accessType === undefined) {
                        throw TypeError(`AccessType is mandatory for compact type ${this.objectTypeString}`);
                    }

                    // Not supported args (Optionally may be zero)
                    if(this.subNumber) {
                        throw TypeError(`SubNumber must be undefined or zero for compact type ${this.objectTypeString}`);
                    }

                    // Optional args
                    if(this.pdoMapping === undefined) {
                        this.pdoMapping = false;
                    }
                }
                else {
                    // Mandatory args
                    if(this.subNumber === undefined) {
                        throw TypeError(`SubNumber is mandatory for type ${this.objectTypeString}`);
                    }

                    // Not supported args
                    if(this.dataType !== undefined) {
                        throw TypeError(`DataType is not supported for type ${this.objectTypeString}`);
                    }

                    if(this.accessType !== undefined) {
                        throw TypeError(`AccessType is not supported for type ${this.objectTypeString}`);
                    }

                    if(this.defaultValue !== undefined) {
                        throw TypeError(`DefaultValue is not supported for type ${this.objectTypeString}`);
                    }

                    if(this.pdoMapping !== undefined) {
                        throw TypeError(`PDOMapping is not supported for type ${this.objectTypeString}`);
                    }

                    if(this.lowLimit !== undefined) {
                        throw TypeError(`LowLimit is not supported for type ${this.objectTypeString}`);
                    }

                    if(this.highLimit !== undefined) {
                        throw TypeError(`HighLimit is not supported for type ${this.objectTypeString}`);
                    }

                    // Create sub-objects array
                    this._subObjects = new Array(this.subNumber + 1);
                    Object.defineProperty(this, '_subObjects', {
                        enumerable: false
                    });

                    // Store max sub index at index 0
                    this._subObjects[0] = new DataObject(index, 0, {
                        'ParameterName':    'Max sub-index',
                        'ObjectType':       ObjectType.VAR,
                        'DataType':         DataType.UNSIGNED8,
                        'AccessType':       AccessType.READ_WRITE,
                        'DefaultValue':     this.subNumber - 1,
                    });

                    // Allow access to sub-objects using bracket notation
                    for(let i = 0; i < (this.subNumber + 1); i++) {
                        Object.defineProperty(this, i, {
                            get: () => { return this._subObjects[i] },
                            set: (args) => { this._setSubObject(i, args) },
                        });
                    }
                }
                break;

            case ObjectType.DOMAIN:
                // Not supported args
                if(this.pdoMapping !== undefined) {
                    throw TypeError(`PDOMapping is not supported for type ${this.objectTypeString}`);
                }

                if(this.lowLimit !== undefined) {
                    throw TypeError(`LowLimit is not supported for type ${this.objectTypeString}`);
                }

                if(this.highLimit !== undefined) {
                    throw TypeError(`HighLimit is not supported for type ${this.objectTypeString}`);
                }

                if(this.subNumber !== undefined) {
                    throw TypeError(`SubNumber is not supported for type ${this.objectTypeString}`);
                }

                if(this.compactSubObj !== undefined) {
                    throw TypeError(`CompactSubObj is not supported for type ${this.objectTypeString}`);
                }

                // Optional args
                if(this.dataType === undefined) {
                    this.dataType = DataType.DOMAIN;
                }

                if(this.accessType === undefined) {
                    this.accessType = AccessType.READ_WRITE;
                }
                break;

            default:
                throw TypeError(`ObjectType not supported (${this.objectType})`);
        };

        if(this.highLimit !== undefined && this.lowLimit !== undefined) {
            if(this.highLimit < this.lowLimit)
                throw RangeError('HighLimit may not be less LowLimit');
        }

        // Create raw data buffer
        this._raw = typeToRaw(this.defaultValue, this.dataType);
    }

    get objectTypeString() {
        switch(this.objectType) {
            case ObjectType.NULL:
                return 'NULL';
            case ObjectType.DOMAIN:
                return 'DOMAIN';
            case ObjectType.DEFTYPE:
                return 'DEFTYPE';
            case ObjectType.DEFSTRUCT:
                return 'DEFSTRUCT';
            case ObjectType.VAR:
                return 'VAR';
            case ObjectType.ARRAY:
                return 'ARRAY';
            case ObjectType.RECORD:
                return 'RECORD';
            default:
                return 'UNKNOWN'
        }
    }

    get dataTypeString() {
        switch(this.dataType) {
            case DataType.BOOLEAN:
                return 'BOOLEAN';
            case DataType.INTEGER8:
                return 'INTEGER8';
            case DataType.INTEGER16:
                return 'INTEGER16';
            case DataType.INTEGER32:
                return 'INTEGER32';
            case DataType.UNSIGNED8:
                return 'UNSIGNED8';
            case DataType.UNSIGNED16:
                return 'UNSIGNED16';
            case DataType.UNSIGNED32:
                return 'UNSIGNED32';
            case DataType.REAL32:
                return 'REAL32';
            case DataType.VISIBLE_STRING:
                return 'VISIBLE_STRING';
            case DataType.OCTET_STRING:
                return 'OCTET_STRING';
            case DataType.UNICODE_STRING:
                return 'UNICODE_STRING';
            case DataType.TIME_OF_DAY:
                return 'TIME_OF_DAY';
            case DataType.TIME_DIFFERENCE:
                return 'TIME_DIFFERENCE';
            case DataType.DOMAIN:
                return 'DOMAIN';
            case DataType.REAL64:
                return 'REAL64';
            case DataType.INTEGER24:
                return 'INTEGER24';
            case DataType.INTEGER40:
                return 'INTEGER40';
            case DataType.INTEGER48:
                return 'INTEGER48';
            case DataType.INTEGER56:
                return 'INTEGER56';
            case DataType.INTEGER64:
                return 'INTEGER64';
            case DataType.UNSIGNED24:
                return 'UNSIGNED24';
            case DataType.UNSIGNED40:
                return 'UNSIGNED40';
            case DataType.UNSIGNED48:
                return 'UNSIGNED48';
            case DataType.UNSIGNED56:
                return 'UNSIGNED56';
            case DataType.UNSIGNED64:
                return 'UNSIGNED64';
            case DataType.PDO_PARAMETER:
                return 'PDO_PARAMETER';
            case DataType.PDO_MAPPING:
                return 'PDO_MAPPING';
            case DataType.SDO_PARAMETER:
                return 'SDO_PARAMETER';
            case DataType.IDENTITY:
                return 'IDENTITY';
            default:
                return 'UNKNOWN'
        }
    }

    get size() {
        let size = 0;
        if(this.subNumber > 0) {
            for(let i = 1; i < this.subNumber + 1; ++i)
                size += this._subObjects[i].size;
        }
        else {
            size = this.raw.length;
        }

        return size;
    }

    get raw() {
        return this._raw;
    }

    get value() {
        return rawToType(this.raw, this.dataType);
    }

    set raw(raw) {
        if(raw === undefined || raw === null)
            raw = typeToRaw(0, this.dataType);

        if(Buffer.compare(raw, this.raw) == 0)
            return;

        this._raw = raw;
        this.emit("update", this);
    }

    set value(value) {
        this.raw = typeToRaw(value, this.dataType);
    }

    /** Formats internal data for writing to an EDS file. */
    objectify() {
        let entry = {};

        entry['ParameterName'] = this.parameterName;
        entry['ObjectType'] = `0x${this.objectType.toString(16)}`;

        if(this.subNumber !== undefined) {
            entry['SubNumber'] = `0x${this.subNumber.toString(16)}`;
        }

        if(this.dataType !== undefined) {
            entry['DataType'] = `0x${this.dataType.toString(16)}`;
        }

        if(this.lowLimit !== undefined) {
            entry['LowLimit'] = this.lowLimit.toString();
        }

        if(this.highLimit !== undefined) {
            entry['HighLimit'] = this.highLimit.toString();
        }

        if(this.accessType !== undefined) {
            entry['AccessType'] = this.accessType;
        }

        if(this.defaultValue !== undefined) {
            entry['DefaultValue'] = this.defaultValue.toString();
        }

        if(this.pdoMapping !== undefined) {
            entry['PDOMapping'] = (this.pdoMapping) ? '1' : '0';
        }

        if(this.objFlags !== undefined) {
            entry['ObjFlags'] = this.objFlags.toString();
        }

        if(this.compactSubObj !== undefined) {
            entry['CompactSubObj'] = (this.compactSubObj) ? '1' : '0';
        }

        return entry;
    }

    _setSubObject(subIndex, args) {
        if(subIndex > this.subNumber)
            throw RangeError(`SubIndex must be >= ${this.subNumber}`)

        this._subObjects[subIndex] = new DataObject(this.index, subIndex, args);
    }
};

/**
 * A CANopen Electronic Data Sheet.
 *
 * This class provides methods for loading and saving CANopen EDS v4.0 files.
 *
 * @see CiA306 "Electronic data sheet specification for CANopen"
 */
class Eds {
    constructor() {
        this.fileInfo = {};
        this.deviceInfo = {};
        this.dummyUsage = {};
        this.dataObjects = {};
        this.comments = [];
        this.nameLookup = {};

        // Add default data types
        for(const [name, index] of Object.entries(DataType)) {
            this.addEntry(index, {
                'ParameterName':    name,
                'ObjectType':       ObjectType.DEFTYPE,
                'DataType':         DataType[name],
                'AccessType':       AccessType.READ_WRITE,
            });
        }

        // Add mandatory objects
        this.addEntry(0x1000, {
            'ParameterName':    'Device type',
            'ObjectType':       ObjectType.VAR,
            'DataType':         DataType.UNSIGNED32,
            'AccessType':       AccessType.READ_ONLY,
        });

        this.addEntry(0x1001, {
            'ParameterName':    'Error register',
            'ObjectType':       ObjectType.VAR,
            'DataType':         DataType.UNSIGNED8,
            'AccessType':       AccessType.READ_ONLY,
        });

        this.addEntry(0x1018, {
            'ParameterName':    'Identity object',
            'ObjectType':       ObjectType.RECORD,
            'SubNumber':        4,
        });

        this.addSubEntry(0x1018, 1, {
            'ParameterName':    'Vendor-ID',
            'ObjectType':       ObjectType.VAR,
            'DataType':         DataType.UNSIGNED32,
            'AccessType':       AccessType.READ_ONLY,
        });

        this.addSubEntry(0x1018, 2, {
            'ParameterName':    'Product code',
            'ObjectType':       ObjectType.VAR,
            'DataType':         DataType.UNSIGNED32,
            'AccessType':       AccessType.READ_ONLY,
        });

        this.addSubEntry(0x1018, 3, {
            'ParameterName':    'Revision number',
            'ObjectType':       ObjectType.VAR,
            'DataType':         DataType.UNSIGNED32,
            'AccessType':       AccessType.READ_ONLY,
        });

        this.addSubEntry(0x1018, 4, {
            'ParameterName':    'Serial number',
            'ObjectType':       ObjectType.VAR,
            'DataType':         DataType.UNSIGNED32,
            'AccessType':       AccessType.READ_ONLY,
        });
    }

    /**
     * Read and parse an EDS file.
     * @param {string} path - path to file.
     */
    load(path) {
        // Parse EDS file
        const file = ini.parse(fs.readFileSync(path, 'utf-8'));

        // Clear existing entries
        this.dataObjects = {};
        this.nameLookup = {};

        // Extract header fields
        this.fileInfo = file['FileInfo'];
        this.deviceInfo = file['DeviceInfo'];
        this.dummyUsage = file['DummyUsage'];
        this.comments = file['Comments'];

        // Construct data objects.
        const entries = Object.entries(file);
        const indexMatch = RegExp('^[0-9A-Fa-f]{4}$');
        const subIndexMatch = RegExp('^([0-9A-Fa-f]{4})sub([0-9A-Fa-f]+)$');

        entries
            .filter(([key, ]) => { return indexMatch.test(key); })
            .forEach(([key, value]) => {
                const index = parseInt(key, 16);
                this.addEntry(index, value);
            });

        entries
            .filter(([key, ]) => { return subIndexMatch.test(key); })
            .forEach(([key, value]) => {
                let [index, subIndex] = key.split('sub');
                index = parseInt(index, 16);
                subIndex = parseInt(subIndex, 16);
                this.addSubEntry(index, subIndex, value);
            });
    }

    /**
     * Write an EDS file.
     * @param {string} path - path to file.
     */
    save(path) {
        const fd = fs.openSync(path, 'w');

        // Write header fields
        this._write(fd, ini.encode(this.fileInfo, { section: 'FileInfo' }));
        this._write(fd, ini.encode(this.deviceInfo, { section: 'DeviceInfo' }));
        this._write(fd, ini.encode(this.dummyUsage, { section: 'DummyUsage' }));
        this._write(fd, ini.encode(this.comments, { section: 'Comments' }));

        // Sort data objects
        let mandObjects = {};
        let mandCount = 0;

        let optObjects = {};
        let optCount = 0;

        let mfrObjects = {};
        let mfrCount = 0;

        for(const key of Object.keys(this.dataObjects)) {
            let index = parseInt(key);

            if([0x1000, 0x1001, 0x1018].includes(index)) {
                mandCount += 1;
                mandObjects[mandCount] = '0x' + index.toString(16);
            }
            else if(index >= 0x1000 && index < 0x1FFF) {
                optCount += 1;
                optObjects[optCount] = '0x' + index.toString(16);
            }
            else if(index >= 0x2000 && index < 0x5FFF) {
                mfrCount += 1;
                mfrObjects[mfrCount] = '0x' + index.toString(16);
            }
            else if(index >= 0x6000 && index < 0xFFFF) {
                optCount += 1;
                optObjects[optCount] = '0x' + index.toString(16);
            }
        }

        // Write data objects
        mandObjects['SupportedObjects'] = Object.keys(mandObjects).length;
        this._write(fd, ini.encode(
            mandObjects, { section: 'MandatoryObjects' }));

        this._writeObjects(fd, mandObjects);

        optObjects['SupportedObjects'] = Object.keys(optObjects).length;
        this._write(fd, ini.encode(
            optObjects, { section: 'OptionalObjects' }));

        this._writeObjects(fd, optObjects);

        mfrObjects['SupportedObjects'] = Object.keys(mfrObjects).length;
        this._write(fd, ini.encode(
            mfrObjects, { section: 'ManufacturerObjects' }));

        this._writeObjects(fd, mfrObjects);

        fs.closeSync(fd);
    }

    /**
     * Get a data object.
     * @param {number | string} index - index or name of the data object.
     * @return {DataObject | Array} - entry (or entries) matching index.
     */
    getEntry(index) {
        let entry;
        if(typeof index == 'string') {
            // Name lookup
            entry = this.nameLookup[index];
            if(entry && entry.length == 1)
                entry = entry[0];
        }
        else {
            // Index lookup
            entry = this.dataObjects[index];
        }

        return entry;
    }

    /**
     * Create a new data object.
     * @param {number} index - index of the data object.
     * @param {DataObject} args - args passed to the DataObject constructor.
     * @return {DataObject} - the newly created entry.
     */
    addEntry(index, args) {
        let entry = this.dataObjects[index];
        if(entry !== undefined) {
            throw TypeError(
                `An entry already exists at 0x${index.toString(16)}`);
        }

        entry = new DataObject(index, null, args);
        this.dataObjects[index] = entry;

        try {
            this.nameLookup[entry.parameterName].push(entry);
        }
        catch(TypeError) {
            this.nameLookup[entry.parameterName] = [ entry ];
        }

        return entry;
    }

    /**
     * Remove a data object.
     * @param {number} index - index of the data object.
     */
    removeEntry(index) {
        const entry = this.dataObjects[index];
        if(entry === undefined)
            throw ReferenceError(`0x${index.toString(16)} does not exist`);

        this.nameLookup[entry.parameterName].splice(
            this.nameLookup[entry.parameterName].indexOf(entry), 1);

        if(this.nameLookup[entry.parameterName].length == 0)
            delete this.nameLookup[entry.parameterName];

        delete this.dataObjects[entry.index];
    }

    /**
     * Get a data object.
     * @param {number | string} index - index or name of the data object.
     * @param {number} subIndex - subIndex of the data object.
     * @return {DataObject} - the sub-entry at index.
     */
    getSubEntry(index, subIndex) {
        const entry = this.getEntry(index);

        if(entry === undefined)
            throw ReferenceError(`0x${index.toString(16)} does not exist`);

        if(entry.subNumber === undefined)
            throw TypeError(`0x${index.toString(16)} does not support sub objects`);

        if(entry.subNumber < subIndex)
            throw ReferenceError(`0x${index.toString(16)}[${subIndex}] does not exist`);

        return entry[subIndex];
    }

    /**
     * Create a new data object.
     * @param {number} index - index of the data object.
     * @param {number} subIndex - subIndex of the data object.
     * @param {DataObject} args - args passed to the DataObject constructor.
     * @return {DataObject} - the newly created sub-entry.
     */
    addSubEntry(index, subIndex, args) {
        const entry = this.dataObjects[index];

        if(entry === undefined)
            throw ReferenceError(`0x${index.toString(16)} does not exist`);

        if(entry.subNumber === undefined)
            throw TypeError(`0x${index.toString(16)} does not support sub objects`);

        if(entry.subNumber < subIndex)
            throw ReferenceError(`0x${index.toString(16)}[${subIndex}] does not exist`);

        const subEntry = new DataObject(index, subIndex, args);
        entry[subIndex] = subEntry;

        return subEntry;
    }

    /**
     * Remove a data object.
     * @param {number} index - index of the data object.
     * @param {number} subIndex - subIndex of the data object.
     */
    removeSubEntry(index, subIndex) {
        const entry = this.dataObjects[index];

        if(entry === undefined)
            throw ReferenceError(`0x${index.toString(16)} does not exist`);

        if(entry.subNumber === undefined)
            throw TypeError(`0x${index.toString(16)} does not support sub objects`);

        if(entry.subNumber < subIndex)
            throw ReferenceError(`0x${index.toString(16)}[${subIndex}] does not exist`);

        delete entry[subIndex];
    }

    get fileName() {
        return this.fileInfo['FileName'];
    }

    get fileVersion() {
        return this.fileInfo['FileVersion'];
    }

    get fileRevision() {
        return this.fileInfo['FileRevision'];
    }

    get EDSVersion() {
        return this.fileInfo['EDSVersion'];
    }

    get description() {
        return this.fileInfo['Description'];
    }

    get creationDate() {
        const time = this.fileInfo['CreationTime'];
        const date = this.fileInfo['CreationDate'];
        return this._parseDate(time, date);
    }

    get createdBy() {
        return this.fileInfo['CreatedBy'];
    }

    get modificationDate() {
        const time = this.fileInfo['ModificationTime'];
        const date = this.fileInfo['ModificationDate'];
        return this._parseDate(time, date);
    }

    get modifiedBy() {
        return this.fileInfo['CreatedBy'];
    }

    get vendorName() {
        return this.deviceInfo['VendorName'];
    }

    get vendorNumber() {
        return this.deviceInfo['VendorNumber'];
    }

    get productName() {
        return this.deviceInfo['ProductName'];
    }

    get productNumber() {
        return this.deviceInfo['ProductNumber'];
    }

    get revisionNumber() {
        return this.deviceInfo['RevisionNumber'];
    }

    get orderCode() {
        return this.deviceInfo['OrderCode'];
    }

    get baudRates() {
        let rates = [];

        if(this.deviceInfo['BaudRate_10'] == '1')
            rates.push(10000);
        if(this.deviceInfo['BaudRate_20'] == '1')
            rates.push(20000);
        if(this.deviceInfo['BaudRate_50'] == '1')
            rates.push(50000);
        if(this.deviceInfo['BaudRate_125'] == '1')
            rates.push(125000);
        if(this.deviceInfo['BaudRate_250'] == '1')
            rates.push(250000);
        if(this.deviceInfo['BaudRate_500'] == '1')
            rates.push(500000);
        if(this.deviceInfo['BaudRate_800'] == '1')
            rates.push(800000);
        if(this.deviceInfo['BaudRate_1000'] == '1')
            rates.push(1000000);

        return rates;
    }

    get simpleBootUpMaster() {
        return this.deviceInfo['SimpleBootUpMaster'];
    }

    get simpleBootUpSlave() {
        return this.deviceInfo['SimpleBootUpSlave'];
    }

    get granularity() {
        return this.deviceInfo['Granularity'];
    }

    get dynamicChannelsSupported() {
        return this.deviceInfo['DynamicChannelsSupported'];
    }

    get nrOfRXPDO() {
        return this.deviceInfo['NrOfRXPDO'];
    }

    get nrOfTXPDO() {
        return this.deviceInfo['NrOfTXPDO'];
    }

    get lssSupported() {
        return this.deviceInfo['LSS_Supported'];
    }

    set fileName(value) {
        this.fileInfo['FileName'] = value;
    }

    set fileVersion(value) {
        this.fileInfo['FileVersion'] = value;
    }

    set fileRevision(value) {
        this.fileInfo['FileRevision'] = value;
    }

    set edsVersion(value) {
        this.fileInfo['EDSVersion'] = value;
    }

    set description(value) {
        this.fileInfo['Description'] = value;
    }

    set creationDate(value) {
        const hours = value.getHours().toString().padStart(2, '0')
        const minutes = value.getMinutes().toString().padStart(2, '0');
        const time = hours + ':' + minutes;

        const month = (value.getMonth() + 1).toString().padStart(2, '0');
        const day = value.getDate().toString().padStart(2, '0');
        const year = value.getFullYear().toString();
        const date = month + '-' + day + '-' + year;

        this.fileInfo['CreationTime'] = time;
        this.fileInfo['CreationDate'] = date;
    }

    set createdBy(value) {
        this.fileInfo['CreatedBy'] = value;
    }

    set modificationDate(value) {
        const hours = value.getHours().toString().padStart(2, '0')
        const minutes = value.getMinutes().toString().padStart(2, '0');
        const time = hours + ':' + minutes;

        const month = (value.getMonth() + 1).toString().padStart(2, '0');
        const day = value.getDate().toString().padStart(2, '0');
        const year = value.getFullYear().toString();
        const date = month + '-' + day + '-' + year;

        this.fileInfo['ModificationTime'] = time;
        this.fileInfo['ModificationDate'] = date;
    }

    set modifiedBy(value) {
        this.fileInfo['CreatedBy'] = value;
    }

    set vendorName(value) {
        this.deviceInfo['VendorName'] = value;
    }

    set vendorNumber(value) {
        this.deviceInfo['VendorNumber'] = value;
    }

    set productName(value) {
        this.deviceInfo['ProductName'] = value;
    }

    set productNumber(value) {
        this.deviceInfo['ProductNumber'] = value;
    }

    set revisionNumber(value) {
        this.deviceInfo['RevisionNumber'] = value;
    }

    set orderCode(value) {
        this.deviceInfo['OrderCode'] = value;
    }

    set baudRates(rates) {
        this.deviceInfo['BaudRate_10'] = rates.includes(10000) ? '1' : '0';
        this.deviceInfo['BaudRate_20'] = rates.includes(20000) ? '1' : '0';
        this.deviceInfo['BaudRate_50'] = rates.includes(50000) ? '1' : '0';
        this.deviceInfo['BaudRate_125'] = rates.includes(125000) ? '1' : '0';
        this.deviceInfo['BaudRate_250'] = rates.includes(250000) ? '1' : '0';
        this.deviceInfo['BaudRate_500'] = rates.includes(500000) ? '1' : '0';
        this.deviceInfo['BaudRate_800'] = rates.includes(800000) ? '1' : '0';
        this.deviceInfo['BaudRate_1000'] = rates.includes(1e6) ? '1' : '0';
    }

    set simpleBootUpMaster(value) {
        this.deviceInfo['SimpleBootUpMaster'] = value;
    }

    set simpleBootUpSlave(value) {
        this.deviceInfo['SimpleBootUpSlave'] = value;
    }

    set granularity(value) {
        this.deviceInfo['Granularity'] = value;
    }

    set dynamicChannelsSupported(value) {
        this.deviceInfo['DynamicChannelsSupported'] = value;
    }

    set nrOfRXPDO(value) {
        this.deviceInfo['NrOfRXPDO'] = value;
    }

    set nrOfTXPDO(value) {
        this.deviceInfo['NrOfTXPDO'] = value;
    }

    set lssSupported(value) {
        this.deviceInfo['LSS_Supported'] = value;
    }

    /**
     * Parse EDS date and time.
     * @param {string} time - time string (hh:mm[AM|PM]).
     * @param {string} date - date string (mm-dd-yyyy).
     * @return {Date}
     * @private
     */
    _parseDate(time, date) {
        const postMeridiem = time.includes('PM');

        time = time
            .replace('AM', '')
            .replace('PM', '');

        let [hours, minutes] = time.split(':');
        let [month, day, year] = date.split('-');

        hours = parseInt(hours);
        minutes = parseInt(minutes);
        month = parseInt(month);
        day = parseInt(day);
        year = parseInt(year);

        if(postMeridiem)
            hours += 12;

        return new Date(year, month - 1, day, hours, minutes)
    };

    /**
     * Helper method to write strings to an EDS file.
     * @param {number} fd - file descriptor to write.
     * @param {string} data - string to write.
     * @private
     */
    _write(fd, data) {
        const nullMatch = new RegExp('=null', 'g');
        data = data.replace(nullMatch, '=');
        if(data.length > 0)
            fs.writeSync(fd, data + EOL);
    }

    /**
     * Helper method to write objects to an EDS file.
     * @param {number} fd - file descriptor to write.
     * @param {Object} objects - objects to write.
     * @private
     */
    _writeObjects(fd, objects) {
        for(const [key, value] of Object.entries(objects)) {
            if(key == 'SupportedObjects')
                continue;

            const index = parseInt(value);
            const dataObject = this.dataObjects[index];
            const entry = dataObject.objectify();

            // Write top level object
            const section = index.toString(16);
            this._write(fd, ini.encode(entry, { section: section }));

            // Write sub-objects
            for(let i = 0; i < dataObject.subNumber; i++) {
                if(dataObject[i]) {
                    const subSection = section + 'sub' + i;
                    const subEntry = dataObject[i].objectify();
                    this._write(
                        fd, ini.encode(subEntry, { section: subSection }));
                }
            }
        }
    }
};

module.exports=exports={
    ObjectType, AccessType, DataType, rawToType, typeToRaw, Eds
}
