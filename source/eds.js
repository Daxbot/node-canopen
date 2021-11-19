/**
 * @file Implements a CANopen Electronic Data Sheet (EDS)
 * @author Wilkins White
 * @copyright 2021 Nova Dynamics LLC
 */

const { EOL } = require('os');
const EventEmitter = require('events');
const fs = require('fs');
const ini = require('ini');
const util = require('util');

/**
 * Time offset in milliseconds between January 1, 1970 and January 1, 1984.
 *
 * @private
 */
const EPOCH_OFFSET = 441763200 * 1000;

/**
 * CANopen object types.
 *
 * @enum {number}
 * @see CiA301 "Object code usage" (§7.4.3)
 */
const ObjectType = {
    /** An object with no data fields. */
    NULL: 0,

    /** Large variable amount of data, e.g. executable program code. */
    DOMAIN: 2,

    /** Denotes a type definition such as BOOLEAN, UNSIGNED16, etc. */
    DEFTYPE: 5,

    /** Defines a new record type, e.g. PDO mapping structure. */
    DEFSTRUCT: 6,

    /** A single value such as an UNSIGNED8, INTEGER16, etc. */
    VAR: 7,

    /**
     * A multiple data field object where each data field is a simple variable
     * of the same basic data type, e.g. array of UNSIGNED16. Sub-index 0 of an
     * ARRAY is always UNSIGNED8 and therefore not part of the ARRAY data.
     */
    ARRAY: 8,

    /**
     * A multiple data field object where the data fields may be any
     * combination of simple variables. Sub-index 0 of a RECORD is always
     * UNSIGNED8 and sub-index 255 is always UNSIGNED32 and therefore not part
     * of the RECORD data.
     */
    RECORD: 9,
};

/**
 * CANopen access types.
 *
 * The access rights for a particular object. The viewpoint is from the network
 * into the CANopen device.
 *
 * @enum {string}
 * @see CiA301 "Access usage" (§7.4.5)
 */
const AccessType = {
    /** Read and write access. */
    READ_WRITE: 'rw',

    /** Write only access. */
    WRITE_ONLY: 'wo',

    /** Read only access. */
    READ_ONLY: 'ro',

    /**
     * Read only access, values marked constant may only be changed in
     * {@link Nmt.NmtState.INITIALIZING}.
     */
    CONSTANT: 'const',
};

/**
 * CANopen data types.
 *
 * The static data types are placed in the object dictionary at their specified
 * index for definition purposes only. Simple types may be mapped to an RPDO
 * as a way to define space for data that is not being used by this CANopen
 * device.
 *
 * @enum {number}
 * @see CiA301 "Data type entry usage" (§7.4.7)
 */
const DataType = {
    /** Boolean value (bool). */
    BOOLEAN: 1,

    /** 8-bit signed integer (int8_t). */
    INTEGER8: 2,

    /** 16-bit signed integer (int16_t). */
    INTEGER16: 3,

    /** 32-bit signed integer (int32_t). */
    INTEGER32: 4,

    /** 8-bit unsigned integer (uint8_t). */
    UNSIGNED8: 5,

    /** 16-bit unsigned integer (uint16_t). */
    UNSIGNED16: 6,

    /** 32-bit unsigned integer (uint32_t). */
    UNSIGNED32: 7,

    /** 32-bit floating point (float). */
    REAL32: 8,

    /** Null terminated c-string. */
    VISIBLE_STRING: 9,

    /** Raw character buffer. */
    OCTET_STRING: 10,

    /** Unicode string. */
    UNICODE_STRING: 11,

    /** Time since January 1, 1984.  */
    TIME_OF_DAY: 12,

    /** Time difference.  */
    TIME_DIFFERENCE: 13,

    /** Data of variable length. */
    DOMAIN: 15,

    /** 64-bit floating point (double) */
    REAL64: 17,

    /** 24-bit signed integer. */
    INTEGER24: 16,

    /** 40-bit signed integer. */
    INTEGER40: 18,

    /** 48-bit signed integer. */
    INTEGER48: 19,

    /** 56-bit signed integer. */
    INTEGER56: 20,

    /** 64-bit signed integer (int64_t). */
    INTEGER64: 21,

    /** 24-bit unsigned integer. */
    UNSIGNED24: 22,

    /** 40-bit unsigned integer. */
    UNSIGNED40: 24,

    /** 48-bit unsigned integer. */
    UNSIGNED48: 25,

    /** 56-bit unsigned integer. */
    UNSIGNED56: 26,

    /** 64-bit unsigned integer (uint64_t) */
    UNSIGNED64: 27,

    /** PDO parameter record. */
    PDO_PARAMETER: 32,

    /** PDO mapping parameter record. */
    PDO_MAPPING: 33,

    /** SDO parameter record. */
    SDO_PARAMETER: 34,

    /** Identity record. */
    IDENTITY: 35,
};

/**
 * Convert a Buffer to a string.
 *
 * @param {Buffer} raw - data to convert.
 * @returns {string} converted string.
 * @private
 */
function rawToString(raw) {
    raw = raw.toString();

    const end = raw.indexOf('\0');
    if(end != -1)
        raw = raw.substring(0, end);

    return raw;
}

/**
 * Convert a Buffer object to a Date.
 *
 * @param {Buffer} raw - data to convert.
 * @returns {Date} converted Date.
 * @private
 */
function rawToDate(raw) {
    const ms = raw.readUInt32LE(0);
    const days = raw.readUInt16LE(4);
    return new Date((days * 8.64e7) + ms + EPOCH_OFFSET);
}

/**
 * Convert a Buffer to a value based on type.
 *
 * @param {Buffer} raw - data to convert.
 * @param {DataType | string} type - how to interpret the data.
 * @returns {number | bigint | string | Date} converted data.
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
        case DataType.INTEGER64:
            return raw.readBigInt64LE()
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
        case DataType.UNSIGNED64:
            return raw.readBigUInt64LE();
        case DataType.REAL32:
            return raw.readFloatLE();
        case DataType.REAL64:
            return raw.readDoubleLE();
        case DataType.VISIBLE_STRING:
        case DataType.UNICODE_STRING:
            return rawToString(raw);
        case DataType.TIME_OF_DAY:
        case DataType.TIME_DIFFERENCE:
            return rawToDate(raw);
        default:
            return raw;
    }
}

/**
 * Convert a string to a Buffer.
 *
 * @param {string} value - data to convert.
 * @returns {Buffer} converted Buffer.
 * @private
 */
function stringToRaw(value) {
    let raw = (value) ? Buffer.from(value) : Buffer.alloc(0);

    const end = raw.indexOf('\0');
    if(end != -1)
        raw = raw.subarray(0, end);

    return raw;
}

/**
 * Convert a Date to a Buffer.
 *
 * @param {Date} value - data to convert.
 * @returns {Buffer} converted Buffer.
 * @private
 */
function dateToRaw(value) {
    let raw = Buffer.alloc(6);
    if(!util.types.isDate(value))
        value = new Date(value);

    // Milliseconds since January 1, 1984
    let time = value.getTime() - EPOCH_OFFSET;
    if(time < 0)
        time = 0;

    // Days since epoch
    const days = Math.floor(time / 8.64e7);
    raw.writeUInt16LE(days, 4);

    // Milliseconds since midnight
    const ms = time - (days * 8.64e7);
    raw.writeUInt32LE(ms, 0);

    return raw;
}

/**
 * Convert a value to a Buffer based on type.
 *
 * @param {number | bigint | string | Date} value - data to convert.
 * @param {DataType | string} type - how to interpret the data.
 * @returns {Buffer} converted Buffer.
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
        case DataType.INTEGER64:
            if(typeof value != 'bigint')
                value = BigInt(value);

            raw = Buffer.alloc(8);
            raw.writeBigInt64LE(value);
            break;
        case DataType.UNSIGNED56:
        case DataType.UNSIGNED64:
            if(typeof value != 'bigint')
                value = BigInt(value);

            raw = Buffer.alloc(8);
            raw.writeBigUInt64LE(value);
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
            raw = stringToRaw(value);
            break;
        case DataType.OCTET_STRING:
        case DataType.UNICODE_STRING:
            raw = (value) ? Buffer.from(value) : Buffer.alloc(0);
            break;
        case DataType.TIME_OF_DAY:
        case DataType.TIME_DIFFERENCE:
            raw = dateToRaw(value);
            break;
    }

    return raw;
}

/**
 * Errors generated due to an improper EDS configuration.
 *
 * @param {string} message - error message.
 */
class EdsError extends Error {
    constructor(message) {
        super(message);

        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * A Canopen Data Object.
 *
 * DataObjects should not be created directly, use {@link Eds#addEntry} or
 * {@link Eds#addSubEntry} instead.
 *
 * @param {number} index - index of the data object.
 * @param {number | null} subIndex - subIndex of the data object.
 * @param {object} data
 * @param {string} data.parameterName - name of the data object.
 * @param {ObjectType} data.objectType - object type.
 * @param {DataType} data.dataType - data type.
 * @param {AccessType} data.accessType - access restrictions.
 * @param {number} data.lowLimit - minimum value.
 * @param {number} data.highLimit - maximum value.
 * @param {number} data.subNumber - number of sub-objects.
 * @param {boolean} data.pdoMapping - enable PDO mapping.
 * @param {boolean} data.compactSubObj - use the compact sub-object format.
 * @param {number | string | Date} data.defaultValue - default value.
 * @fires 'update' on value change.
 * @see CiA306 "Object descriptions" (§4.6.3)
 */
class DataObject extends EventEmitter {
    constructor(index, subIndex, data, parent=null) {
        super();

        Object.assign(this, data);

        this.index = index;
        this.subIndex = subIndex;
        this.parent = parent;

        if(this.parameterName === undefined)
            throw new EdsError('parameterName is mandatory for DataObject');

        if(this.objectType === undefined)
            this.objectType = ObjectType.VAR;

        switch(this.objectType) {
            case ObjectType.DEFTYPE:
            case ObjectType.VAR:
                // Mandatory data
                if(this.dataType === undefined)
                    throw new EdsError(`dataType is mandatory for type ${this.objectTypeString}`);

                if(this.accessType === undefined)
                    throw new EdsError(`accessType is mandatory for type ${this.objectTypeString}`);

                // Not supported data
                if(this.subNumber !== undefined)
                    throw new EdsError(`subNumber is not supported for type ${this.objectTypeString}`);

                if(this.compactSubObj !== undefined)
                    throw new EdsError(`compactSubObj is not supported for type ${this.objectTypeString}`);

                // Optional data
                if(this.pdoMapping === undefined)
                    this.pdoMapping = false;

                // Check limits
                if(this.highLimit !== undefined && this.lowLimit !== undefined) {
                    if(this.highLimit < this.lowLimit)
                        throw new EdsError('highLimit may not be less lowLimit');
                }

                // Create raw data buffer
                this._raw = typeToRaw(this.defaultValue, this.dataType);
                break;
            case ObjectType.DEFSTRUCT:
            case ObjectType.ARRAY:
            case ObjectType.RECORD:
                if(this.compactSubObj) {
                    // Mandatory data
                    if(this.dataType === undefined)
                        throw new EdsError(`dataType is mandatory for compact type ${this.objectTypeString}`);

                    if(this.accessType === undefined)
                        throw new EdsError(`accessType is mandatory for compact type ${this.objectTypeString}`);

                    // Not supported args (Optionally may be zero)
                    if(this.subNumber)
                        throw new EdsError(`subNumber must be undefined or zero for compact type ${this.objectTypeString}`);

                    // Optional data
                    if(this.pdoMapping === undefined)
                        this.pdoMapping = false;
                }
                else {
                    // Not supported data
                    if(this.dataType !== undefined)
                        throw new EdsError(`dataType is not supported for type ${this.objectTypeString}`);

                    if(this.accessType !== undefined)
                        throw new EdsError(`accessType is not supported for type ${this.objectTypeString}`);

                    if(this.defaultValue !== undefined)
                        throw new EdsError(`defaultValue is not supported for type ${this.objectTypeString}`);

                    if(this.pdoMapping !== undefined)
                        throw new EdsError(`pdoMapping is not supported for type ${this.objectTypeString}`);

                    if(this.lowLimit !== undefined)
                        throw new EdsError(`lowLimit is not supported for type ${this.objectTypeString}`);

                    if(this.highLimit !== undefined)
                        throw new EdsError(`highLimit is not supported for type ${this.objectTypeString}`);
                }

                if(this.subNumber === undefined || this.subNumber < 1)
                    this.subNumber = 1;

                // Create sub-objects array
                this._subObjects = [];
                Object.defineProperty(this, '_subObjects', {
                    enumerable: false
                });

                // Store max sub index at index 0
                this.addSubObject(0, {
                    parameterName:  'Max sub-index',
                    objectType:     ObjectType.VAR,
                    dataType:       DataType.UNSIGNED8,
                    accessType:     AccessType.READ_WRITE,
                });
                break;

            case ObjectType.DOMAIN:
                // Not supported data
                if(this.pdoMapping !== undefined)
                    throw new EdsError(`pdoMapping is not supported for type ${this.objectTypeString}`);

                if(this.lowLimit !== undefined)
                    throw new EdsError(`lowLimit is not supported for type ${this.objectTypeString}`);

                if(this.highLimit !== undefined)
                    throw new EdsError(`highLimit is not supported for type ${this.objectTypeString}`);

                if(this.subNumber !== undefined)
                    throw new EdsError(`subNumber is not supported for type ${this.objectTypeString}`);

                if(this.compactSubObj !== undefined)
                    throw new EdsError(`compactSubObj is not supported for type ${this.objectTypeString}`);

                // Optional data
                if(this.dataType === undefined)
                    this.dataType = DataType.DOMAIN;

                if(this.accessType === undefined)
                    this.accessType = AccessType.READ_WRITE;

                break;

            default:
                throw new EdsError(`objectType not supported (${this.objectType})`);
        }
    }

    /**
     * The object type as a string.
     *
     * @type {string}
     */
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

    /**
     * The data type as a string.
     *
     * @type {string}
     */
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

    /**
     * Size of the raw data in bytes including sub-entries.
     *
     * @type {number}
     */
    get size() {
        if(!this.subNumber)
            return this.raw.length;

        let size = 0;
        for(let i = 1; i <= this._subObjects[0].value; ++i) {
            if(this._subObjects[i] === undefined)
                continue;

            size += this._subObjects[i].size;
        }

        return size;
    }

    /**
     * The raw data Buffer.
     *
     * @type {Buffer}
     */
    get raw() {
        if(!this.subNumber)
            return this._raw;

        const data = [];
        for(let i = 1; i <= this._subObjects[0].value; ++i) {
            if(this._subObjects[i] === undefined)
                continue;

            data.push(this._subObjects[i].raw);
        }

        return data;
    }

    set raw(raw) {
        if(this.subNumber)
            throw TypeError(`not supported for type ${this.objectTypeString}`);

        if(raw === undefined || raw === null)
            raw = typeToRaw(0, this.dataType);

        if(Buffer.compare(raw, this.raw) == 0)
            return;

        this._raw = raw;
        this.emit('update', this);

        if(this.parent)
            this.parent.emit('update', this.parent);
    }

    /**
     * The cooked value.
     *
     * @type {number | bigint | string | Date}
     * @see {@link Eds.typeToRaw}
     */
    get value() {
        if(!this.subNumber)
            return rawToType(this.raw, this.dataType);

        const data = [];
        for(let i = 1; i <= this._subObjects[0].value; ++i) {
            if(this._subObjects[i] === undefined)
                continue;

            data.push(this._subObjects[i].value);
        }

        return data;
    }

    set value(value) {
        if(this.subNumber)
            throw TypeError(`not supported for type ${this.objectTypeString}`);

        this.raw = typeToRaw(value, this.dataType);
    }

    /**
     * Create or add a new sub-entry.
     *
     * @param {number} subIndex - sub-entry index to add.
     * @param {DataObject | object} data - An existing {@link DataObject} or the data to create one.
     * @private
     */
    addSubObject(subIndex, data) {
        this._subObjects[subIndex] = new DataObject(
            this.index, subIndex, data, this);

        // Allow access to the sub-object using bracket notation
        if(!Object.prototype.hasOwnProperty.call(this, subIndex)) {
            Object.defineProperty(this, subIndex, {
                get: () => this._subObjects[subIndex]
            });
        }

        // Update max sub-index
        if(this._subObjects[0].value < subIndex)
            this._subObjects[0]._raw.writeUInt8(subIndex);

        // Update subNumber
        this.subNumber = 1;
        for(let i = 1; i <= this._subObjects[0].value; ++i) {
            if(this._subObjects[i] !== undefined)
                this.subNumber += 1;
        }

        this.emit('update', this);
    }

    /**
     * Delete a sub-entry.
     *
     * @param {number} subIndex - sub-entry index to remove.
     * @private
     */
    removeSubObject(subIndex) {
        delete this._subObjects[subIndex];

        // Update max sub-index
        if(subIndex >= this._subObjects[0].value) {
            // Find the next highest sub-index
            for(let i = subIndex; i >= 0; --i) {
                if(this._subObjects[i] !== undefined) {
                    this._subObjects[0]._raw.writeUInt8(i);
                    break;
                }
            }
        }

        // Update subNumber
        this.subNumber = 1;
        for(let i = 1; i <= this._subObjects[0].value; ++i) {
            if(this._subObjects[i] !== undefined)
                this.subNumber += 1;
        }

        this.emit('update', this);
    }
}

/**
 * A CANopen Electronic Data Sheet.
 *
 * This class provides methods for loading and saving CANopen EDS v4.0 files.
 *
 * @see CiA306 "Electronic data sheet specification for CANopen"
 * @example
 * const eds = new Eds();
 *
 * eds.fileName = 'example.eds';
 * eds.fileVersion = '1'
 * eds.fileRevision = '1'
 * eds.edsVersion = '4.0'
 * eds.description = 'An example EDS file';
 * eds.creationDate = new Date();
 * eds.createdBy = 'node-canopen';
 *
 * eds.addEntry(0x1017, {
 *     parameterName:  'Producer heartbeat timer',
 *     objectType:     ObjectType.VAR,
 *     dataType:       DataType.UNSIGNED32,
 *     accessType:     AccessType.READ_WRITE,
 *     defaultValue:   500,
 * });
 *
 * eds.save();
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
                parameterName:  name,
                objectType:     ObjectType.DEFTYPE,
                dataType:       DataType[name],
                accessType:     AccessType.READ_WRITE,
            });
        }

        // Add mandatory objects
        this.addEntry(0x1000, {
            parameterName:  'Device type',
            objectType:     ObjectType.VAR,
            dataType:       DataType.UNSIGNED32,
            accessType:     AccessType.READ_ONLY,
        });

        this.addEntry(0x1001, {
            parameterName:  'Error register',
            objectType:     ObjectType.VAR,
            dataType:       DataType.UNSIGNED8,
            accessType:     AccessType.READ_ONLY,
        });

        this.addEntry(0x1018, {
            parameterName:  'Identity object',
            objectType:     ObjectType.RECORD,
        });

        this.addSubEntry(0x1018, 1, {
            parameterName:  'Vendor-ID',
            objectType:     ObjectType.VAR,
            dataType:       DataType.UNSIGNED32,
            accessType:     AccessType.READ_ONLY,
        });

        this.addSubEntry(0x1018, 2, {
            parameterName:  'Product code',
            objectType:     ObjectType.VAR,
            dataType:       DataType.UNSIGNED32,
            accessType:     AccessType.READ_ONLY,
        });

        this.addSubEntry(0x1018, 3, {
            parameterName:  'Revision number',
            objectType:     ObjectType.VAR,
            dataType:       DataType.UNSIGNED32,
            accessType:     AccessType.READ_ONLY,
        });

        this.addSubEntry(0x1018, 4, {
            parameterName:  'Serial number',
            objectType:     ObjectType.VAR,
            dataType:       DataType.UNSIGNED32,
            accessType:     AccessType.READ_ONLY,
        });
    }

    /**
     * Read and parse an EDS file.
     *
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
            .filter(([key]) => {
                return indexMatch.test(key);
            })
            .forEach(([key, data]) => {
                const index = parseInt(key, 16);
                this.addEntry(index, this._edsToEntry(data));
            });

        entries
            .filter(([key]) => {
                return subIndexMatch.test(key);
            })
            .forEach(([key, data]) => {
                let [index, subIndex] = key.split('sub');
                index = parseInt(index, 16);
                subIndex = parseInt(subIndex, 16);
                this.addSubEntry(index, subIndex, this._edsToEntry(data));
            });
    }

    /**
     * Write an EDS file.
     *
     * @param {string} [path] - path to file, defaults to fileName.
     */
    save(path) {
        if(!path)
            path = this.fileName;

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
     *
     * @param {number | string} index - index or name of the data object.
     * @returns {DataObject | Array} - entry (or entries) matching index.
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
     * Create a new entry.
     *
     * @param {number} index - index of the data object.
     * @param {object} data - data passed to the {@link DataObject} constructor.
     * @returns {DataObject} - the newly created entry.
     */
    addEntry(index, data) {
        let entry = this.dataObjects[index];
        if(entry !== undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`${index} already exists`);
        }

        entry = new DataObject(index, null, data);
        this.dataObjects[index] = entry;

        if(this.nameLookup[entry.parameterName] === undefined)
            this.nameLookup[entry.parameterName] = [];

        this.nameLookup[entry.parameterName].push(entry);

        return entry;
    }

    /**
     * Delete an entry.
     *
     * @param {number} index - index of the data object.
     */
    removeEntry(index) {
        const entry = this.dataObjects[index];
        if(entry === undefined) {
            index = '0x' + index.toString(16);
            throw ReferenceError(`${index} does not exist`);
        }

        this.nameLookup[entry.parameterName].splice(
            this.nameLookup[entry.parameterName].indexOf(entry), 1);

        if(this.nameLookup[entry.parameterName].length == 0)
            delete this.nameLookup[entry.parameterName];

        delete this.dataObjects[entry.index];
    }

    /**
     * Get a sub-entry.
     *
     * @param {number | string} index - index or name of the data object.
     * @param {number} subIndex - subIndex of the data object.
     * @returns {DataObject | null} - the sub-entry or null.
     */
    getSubEntry(index, subIndex) {
        const entry = this.getEntry(index);

        if(entry === undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`${index} does not exist`);
        }

        if(entry.subNumber === undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`${index} does not support sub objects`);
        }

        return entry[subIndex] || null;
    }

    /**
     * Create a new sub-entry.
     *
     * @param {number} index - index of the data object.
     * @param {number} subIndex - subIndex of the data object.
     * @param {object} data - data passed to the {@link DataObject} constructor.
     * @returns {DataObject} - the newly created sub-entry.
     */
    addSubEntry(index, subIndex, data) {
        const entry = this.dataObjects[index];

        if(entry === undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`${index} does not exist`);
        }

        if(entry.subNumber === undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`${index} does not support sub objects`);
        }

        // Add the new entry
        entry.addSubObject(subIndex, data);

        return entry[subIndex];
    }

    /**
     * Delete a sub-entry.
     *
     * @param {number} index - index of the data object.
     * @param {number} subIndex - subIndex of the data object.
     */
    removeSubEntry(index, subIndex) {
        const entry = this.dataObjects[index];

        if(subIndex < 1)
            throw new EdsError('subIndex must be >= 1');

        if(entry === undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`${index} does not exist`);
        }

        if(entry.subNumber === undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`${index} does not support sub objects`);
        }

        if(entry[subIndex] === undefined)
            return;

        // Delete the entry
        entry.removeSubObject(subIndex);
    }

    /**
     * File name.
     *
     * @type {string}
     */
    get fileName() {
        return this.fileInfo['FileName'];
    }

    set fileName(value) {
        this.fileInfo['FileName'] = value;
    }

    /**
     * File version (8-bit unsigned integer).
     *
     * @type {number}
     */
    get fileVersion() {
        return parseInt(this.fileInfo['FileVersion']);
    }

    set fileVersion(value) {
        this.fileInfo['FileVersion'] = value;
    }

    /**
     * File revision (8-bit unsigned integer).
     *
     * @type {number}
     */
    get fileRevision() {
        return parseInt(this.fileInfo['FileRevision']);
    }

    set fileRevision(value) {
        this.fileInfo['FileRevision'] = value;
    }

    /**
     * Version of the EDS specification in the format 'x.y'.
     *
     * @type {string}
     */
    get edsVersion() {
        return this.fileInfo['EDSVersion'];
    }

    set edsVersion(value) {
        this.fileInfo['EDSVersion'] = value;
    }

    /**
     * File description.
     *
     * @type {string}
     */
    get description() {
        return this.fileInfo['Description'];
    }

    set description(value) {
        this.fileInfo['Description'] = value;
    }

    /**
     * File creation time.
     *
     * @type {Date}
     */
    get creationDate() {
        const time = this.fileInfo['CreationTime'];
        const date = this.fileInfo['CreationDate'];
        return this._parseDate(time, date);
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

    /**
     * Name or description of the file creator (max 245 characters).
     *
     * @type {string}
     */
    get createdBy() {
        return this.fileInfo['CreatedBy'];
    }

    set createdBy(value) {
        this.fileInfo['CreatedBy'] = value;
    }

    /**
     * Time of the last modification.
     *
     * @type {Date}
     */
    get modificationDate() {
        const time = this.fileInfo['ModificationTime'];
        const date = this.fileInfo['ModificationDate'];
        return this._parseDate(time, date);
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

    /**
     * Name or description of the last modifier (max 244 characters).
     *
     * @type {string}
     */
    get modifiedBy() {
        return this.fileInfo['CreatedBy'];
    }

    set modifiedBy(value) {
        this.fileInfo['CreatedBy'] = value;
    }

    /**
     * Vendor name (max 244 characters).
     *
     * @type {string}
     */
    get vendorName() {
        return this.deviceInfo['VendorName'];
    }

    set vendorName(value) {
        this.deviceInfo['VendorName'] = value;
    }

    /**
     * Unique vendor ID (32-bit unsigned integer).
     *
     * @type {number}
     */
    get vendorNumber() {
        return parseInt(this.deviceInfo['VendorNumber']);
    }

    set vendorNumber(value) {
        this.deviceInfo['VendorNumber'] = value;
    }

    /**
     * Product name (max 243 characters).
     *
     * @type {string}
     */
    get productName() {
        return this.deviceInfo['ProductName'];
    }

    set productName(value) {
        this.deviceInfo['ProductName'] = value;
    }

    /**
     * Product code (32-bit unsigned integer).
     *
     * @type {number}
     */
    get productNumber() {
        return parseInt(this.deviceInfo['ProductNumber']);
    }

    set productNumber(value) {
        this.deviceInfo['ProductNumber'] = value;
    }

    /**
     * Revision number (32-bit unsigned integer).
     *
     * @type {number}
     */
    get revisionNumber() {
        return parseInt(this.deviceInfo['RevisionNumber']);
    }

    set revisionNumber(value) {
        this.deviceInfo['RevisionNumber'] = value;
    }

    /**
     * Product order code (max 245 characters).
     *
     * @type {string}
     */
    get orderCode() {
        return this.deviceInfo['OrderCode'];
    }

    set orderCode(value) {
        this.deviceInfo['OrderCode'] = value;
    }

    /**
     * Supported baud rates.
     *
     * @type {Array<number>}
     */
    get baudRates() {
        let rates = [];

        if(parseInt(this.deviceInfo['BaudRate_10']))
            rates.push(10000);
        if(parseInt(this.deviceInfo['BaudRate_20']))
            rates.push(20000);
        if(parseInt(this.deviceInfo['BaudRate_50']))
            rates.push(50000);
        if(parseInt(this.deviceInfo['BaudRate_125']))
            rates.push(125000);
        if(parseInt(this.deviceInfo['BaudRate_250']))
            rates.push(250000);
        if(parseInt(this.deviceInfo['BaudRate_500']))
            rates.push(500000);
        if(parseInt(this.deviceInfo['BaudRate_800']))
            rates.push(800000);
        if(parseInt(this.deviceInfo['BaudRate_1000']))
            rates.push(1000000);

        return rates;
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

    /**
     * Indicates simple boot-up master functionality.
     *
     * @type {boolean}
     */
    get simpleBootUpMaster() {
        return !!parseInt(this.deviceInfo['SimpleBootUpMaster']);
    }

    set simpleBootUpMaster(value) {
        this.deviceInfo['SimpleBootUpMaster'] = (value) ? 1 : 0;
    }

    /**
     * Indicates simple boot-up slave functionality.
     *
     * @type {boolean}
     */
    get simpleBootUpSlave() {
        return !!parseInt(this.deviceInfo['SimpleBootUpSlave']);
    }

    set simpleBootUpSlave(value) {
        this.deviceInfo['SimpleBootUpSlave'] = (value) ? 1 : 0;
    }

    /**
     * Provides the granularity allowed for the mapping on this device - most
     * devices support a granularity of 8. (8-bit integer, max 64).
     *
     * @type {number}
     */
    get granularity() {
        return parseInt(this.deviceInfo['Granularity']);
    }

    set granularity(value) {
        this.deviceInfo['Granularity'] = value;
    }

    /**
     * Indicates the facility of dynamic variable generation.
     *
     * @type {boolean}
     * @see CiA302
     */
    get dynamicChannelsSupported() {
        return !!parseInt(this.deviceInfo['DynamicChannelsSupported']);
    }

    set dynamicChannelsSupported(value) {
        this.deviceInfo['DynamicChannelsSupported'] = (value) ? 1 : 0;
    }

    /**
     * Indicates the facility of multiplexed PDOs
     *
     * @type {boolean}
     * @see CiA301
     */
    get groupMessaging() {
        return !!parseInt(this.deviceInfo['GroupMessaging']);
    }

    set groupMessaging(value) {
        this.deviceInfo['GroupMessaging'] = (value) ? 1 : 0;
    }

    /**
     * The number of supported receive PDOs (16-bit unsigned integer).
     *
     * @type {number}
     */
    get nrOfRXPDO() {
        return parseInt(this.deviceInfo['NrOfRXPDO']);
    }

    set nrOfRXPDO(value) {
        this.deviceInfo['NrOfRXPDO'] = value;
    }

    /**
     * The number of supported transmit PDOs (16-bit unsigned integer).
     *
     * @type {number}
     */
    get nrOfTXPDO() {
        return parseInt(this.deviceInfo['NrOfTXPDO']);
    }

    set nrOfTXPDO(value) {
        this.deviceInfo['NrOfTXPDO'] = value;
    }

    /**
     * Indicates if LSS functionality is supported.
     *
     * @type {boolean}
     */
    get lssSupported() {
        return !!parseInt(this.deviceInfo['LSS_Supported']);
    }

    set lssSupported(value) {
        this.deviceInfo['LSS_Supported'] = (value) ? 1 : 0;
    }

    /**
     * Parse EDS date and time.
     *
     * @param {string} time - time string (hh:mm[AM|PM]).
     * @param {string} date - date string (mm-dd-yyyy).
     * @returns {Date} parsed Date.
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
    }

    /**
     * Helper method to turn EDS file data into {@link DataObject} data.
     *
     * @param {object} data - EDS style data to convert.
     * @returns {object} DataObject style data.
     * @private
     */
    _edsToEntry(data) {
        return {
            parameterName: data['ParameterName'],
            subNumber: parseInt(data['SubNumber']) || undefined,
            objectType: parseInt(data['ObjectType']) || undefined,
            dataType: parseInt(data['DataType']) || undefined,
            lowLimit: parseInt(data['LowLimit']) || undefined,
            highLimit: parseInt(data['HighLimit']) || undefined,
            accessType: data['AccessType'],
            defaultValue: data['DefaultValue'],
            pdoMapping: data['PDOMapping'],
            objFlags: parseInt(data['ObjFlags']) || undefined,
            compactSubObj: parseInt(data['CompactSubObj']) || undefined
        };
    }

    /**
     * Formats a {@link DataObject} for writing to an EDS file.
     *
     * @param {DataObject} entry - DataObject style data to convert.
     * @returns {object} EDS style data.
     * @private
     */
    _entryToEds(entry) {
        let data = {};

        data['ParameterName'] = entry.parameterName;
        data['ObjectType'] = `0x${entry.objectType.toString(16)}`;

        if(entry.subNumber !== undefined)
            data['SubNumber'] = `0x${entry.subNumber.toString(16)}`;

        if(entry.dataType !== undefined)
            data['DataType'] = `0x${entry.dataType.toString(16)}`;

        if(entry.lowLimit !== undefined)
            data['LowLimit'] = entry.lowLimit.toString();

        if(entry.highLimit !== undefined)
            data['HighLimit'] = entry.highLimit.toString();

        if(entry.accessType !== undefined)
            data['AccessType'] = entry.accessType;

        if(entry.defaultValue !== undefined)
            data['DefaultValue'] = entry.defaultValue.toString();

        if(entry.pdoMapping !== undefined)
            data['PDOMapping'] = (entry.pdoMapping) ? '1' : '0';

        if(entry.objFlags !== undefined)
            data['ObjFlags'] = entry.objFlags.toString();

        if(entry.compactSubObj !== undefined)
            data['CompactSubObj'] = (entry.compactSubObj) ? '1' : '0';

        return data;
    }

    /**
     * Helper method to write strings to an EDS file.
     *
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
     *
     * @param {number} fd - file descriptor to write.
     * @param {object} objects - objects to write.
     * @private
     */
    _writeObjects(fd, objects) {
        for(const [key, value] of Object.entries(objects)) {
            if(key == 'SupportedObjects')
                continue;

            const index = parseInt(value);
            const dataObject = this.dataObjects[index];

            // Write top level object
            const section = index.toString(16);
            this._write(fd, ini.encode(
                this._entryToEds(dataObject), { section: section }));

            // Write sub-objects
            for(let i = 0; i < dataObject.subNumber; i++) {
                if(dataObject[i]) {
                    const subSection = section + 'sub' + i;
                    const subObject = dataObject[i];
                    this._write(fd, ini.encode(
                        this._entryToEds(subObject), { section: subSection }));
                }
            }
        }
    }
}

module.exports=exports={
    ObjectType, AccessType, DataType, rawToType, typeToRaw, EdsError, Eds
}
