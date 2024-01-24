/**
 * @file Implements a CANopen Electronic Data Sheet (EDS)
 * @author Wilkins White
 * @copyright 2024 Daxbot
 */

// External modules
const { EOL } = require('os');
const EventEmitter = require('events');
const fs = require('fs');
const ini = require('ini');

// Local modules
const { ObjectType, AccessType, DataType, } = require('./types');
const rawToType = require('./functions/raw_to_type');
const typeToRaw = require('./functions/type_to_raw');

/**
 * Helper method to turn EDS file data into {@link DataObject} data.
 *
 * @param {object} data - EDS style data to convert.
 * @returns {object} DataObject style data.
 * @private
 */
function edsToEntry(data) {
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
function entryToEds(entry) {
    let data = {};

    data['ParameterName'] = entry.parameterName;
    data['ObjectType'] = `0x${entry.objectType.toString(16)}`;

    if (entry.subNumber !== undefined)
        data['SubNumber'] = `0x${entry.subNumber.toString(16)}`;

    if (entry.dataType !== undefined)
        data['DataType'] = `0x${entry.dataType.toString(16)}`;

    if (entry.lowLimit !== undefined)
        data['LowLimit'] = entry.lowLimit.toString();

    if (entry.highLimit !== undefined)
        data['HighLimit'] = entry.highLimit.toString();

    if (entry.accessType !== undefined)
        data['AccessType'] = entry.accessType;

    if (entry.defaultValue !== undefined)
        data['DefaultValue'] = entry.defaultValue.toString();

    if (entry.pdoMapping !== undefined)
        data['PDOMapping'] = (entry.pdoMapping) ? '1' : '0';

    if (entry.objFlags !== undefined)
        data['ObjFlags'] = entry.objFlags.toString();

    if (entry.compactSubObj !== undefined)
        data['CompactSubObj'] = (entry.compactSubObj) ? '1' : '0';

    return data;
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
 * A CANopen Data Object.
 *
 * DataObjects should not be created directly, use {@link Eds#addEntry} or
 * {@link Eds#addSubEntry} instead.
 *
 * @param {string} key - object index key (e.g., 1018sub3)
 * @param {object} data - creation parameters.
 * @param {string} data.parameterName - name of the data object.
 * @param {ObjectType} data.objectType - object type.
 * @param {DataType} data.dataType - data type.
 * @param {AccessType} data.accessType - access restrictions.
 * @param {number} data.lowLimit - minimum value.
 * @param {number} data.highLimit - maximum value.
 * @param {boolean} data.pdoMapping - enable PDO mapping.
 * @param {boolean} data.compactSubObj - use the compact sub-object format.
 * @param {number | string | Date} data.defaultValue - default value.
 * @param {number} data.scaleFactor - optional multiplier for numeric types.
 * @fires DataObject#update
 * @see CiA306 "Object descriptions" (§4.6.3)
 */
class DataObject extends EventEmitter {
    constructor(key, data) {
        super();

        this.key = key;
        if (this.key === undefined)
            throw new ReferenceError('key must be defined');

        Object.assign(this, data);

        if (this.parameterName === undefined)
            throw new EdsError('parameterName is mandatory for DataObject');

        if (this.objectType === undefined)
            this.objectType = ObjectType.VAR;

        switch (this.objectType) {
            case ObjectType.DEFTYPE:
            case ObjectType.VAR:
                // Mandatory data
                if (this.dataType === undefined) {
                    throw new EdsError('dataType is mandatory for type '
                        + this.objectTypeString);
                }

                if (this.compactSubObj !== undefined) {
                    throw new EdsError('compactSubObj is not supported for type '
                        + this.objectTypeString);
                }

                // Optional data
                if (this.accessType === undefined)
                    this.accessType = AccessType.READ_WRITE;

                if (this.pdoMapping === undefined)
                    this.pdoMapping = false;

                // Check limits
                if (this.highLimit !== undefined
                    && this.lowLimit !== undefined) {
                    if (this.highLimit < this.lowLimit)
                        throw new EdsError('highLimit may not be less lowLimit');
                }

                // Create raw data buffer
                this._raw = typeToRaw(this.defaultValue, this.dataType);
                break;
            case ObjectType.DEFSTRUCT:
            case ObjectType.ARRAY:
            case ObjectType.RECORD:
                if (this.compactSubObj) {
                    // Mandatory data
                    if (this.dataType === undefined) {
                        throw new EdsError('dataType is mandatory for compact type '
                            + this.objectTypeString);
                    }

                    // Optional data
                    if (this.accessType === undefined)
                        this.accessType = AccessType.READ_WRITE;

                    if (this.pdoMapping === undefined)
                        this.pdoMapping = false;
                }
                else {
                    // Not supported data
                    if (this.dataType !== undefined) {
                        throw new EdsError('dataType is not supported for type '
                            + this.objectTypeString);
                    }

                    if (this.accessType !== undefined) {
                        throw new EdsError('accessType is not supported for type '
                            + this.objectTypeString);
                    }

                    if (this.defaultValue !== undefined) {
                        throw new EdsError('defaultValue is not supported for type '
                            + this.objectTypeString);
                    }

                    if (this.pdoMapping !== undefined) {
                        throw new EdsError('pdoMapping is not supported for type '
                            + this.objectTypeString);
                    }

                    if (this.lowLimit !== undefined) {
                        throw new EdsError('lowLimit is not supported for type '
                            + this.objectTypeString);
                    }

                    if (this.highLimit !== undefined) {
                        throw new EdsError('highLimit is not supported for type '
                            + this.objectTypeString);
                    }
                }

                // Create sub-objects array
                this._subObjects = [];
                Object.defineProperty(this, '_subObjects', {
                    enumerable: false
                });

                // Store max sub index at index 0
                this.addSubObject(0, {
                    parameterName: 'Max sub-index',
                    objectType: ObjectType.VAR,
                    dataType: DataType.UNSIGNED8,
                    accessType: AccessType.READ_WRITE,
                });

                break;

            case ObjectType.DOMAIN:
                // Not supported data
                if (this.pdoMapping !== undefined) {
                    throw new EdsError('pdoMapping is not supported for type '
                        + this.objectTypeString);
                }

                if (this.lowLimit !== undefined) {
                    throw new EdsError('lowLimit is not supported for type '
                        + this.objectTypeString);
                }

                if (this.highLimit !== undefined) {
                    throw new EdsError('highLimit is not supported for type '
                        + this.objectTypeString);
                }

                if (this.compactSubObj !== undefined) {
                    throw new EdsError('compactSubObj is not supported for type '
                        + this.objectTypeString);
                }

                // Optional data
                if (this.dataType === undefined)
                    this.dataType = DataType.DOMAIN;

                if (this.accessType === undefined)
                    this.accessType = AccessType.READ_WRITE;

                break;

            default:
                throw new EdsError(
                    `objectType not supported (${this.objectType})`);
        }
    }

    /**
     * The Eds index.
     *
     * @type {number}
     */
    get index() {
        return Number('0x' + this.key.split('sub')[0]);
    }

    /**
     * The Eds subIndex.
     *
     * @type {number | null}
     */
    get subIndex() {
        const key = this.key.split('sub');
        if (key.length < 2)
            return null;

        return Number('0x' + key[1]);
    }

    /**
     * The object type as a string.
     *
     * @type {string}
     */
    get objectTypeString() {
        switch (this.objectType) {
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
                return 'UNKNOWN';
        }
    }

    /**
     * The data type as a string.
     *
     * @type {string}
     */
    get dataTypeString() {
        switch (this.dataType) {
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
                return 'UNKNOWN';
        }
    }

    /**
     * Size of the raw data in bytes including sub-entries.
     *
     * @type {number}
     */
    get size() {
        if (!this.subNumber)
            return this.raw.length;

        let size = 0;
        for (let i = 1; i <= this._subObjects[0].value; ++i) {
            if (this._subObjects[i] === undefined)
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
        if (!this.subNumber)
            return this._raw;

        const data = [];
        for (let i = 1; i <= this._subObjects[0].value; ++i) {
            if (this._subObjects[i] === undefined)
                continue;

            data.push(this._subObjects[i].raw);
        }

        return data;
    }

    set raw(raw) {
        if (this.subNumber) {
            throw new EdsError('not supported for type '
                + this.objectTypeString);
        }

        if (raw === undefined || raw === null)
            raw = typeToRaw(0, this.dataType);

        if (this.raw && Buffer.compare(raw, this.raw) == 0)
            return;

        this._raw = raw;
        this._emitUpdate();
    }

    /**
     * The cooked value.
     *
     * @type {number | bigint | string | Date}
     * @see {@link Eds.typeToRaw}
     */
    get value() {
        if (!this.subNumber)
            return rawToType(this.raw, this.dataType, this.scaleFactor);

        const data = [];
        for (let i = 1; i <= this._subObjects[0].value; ++i) {
            if (this._subObjects[i] === undefined)
                continue;

            data.push(this._subObjects[i].value);
        }

        return data;
    }

    set value(value) {
        if (this.subNumber) {
            throw new EdsError('not supported for type '
                + this.objectTypeString);
        }

        this.raw = typeToRaw(value, this.dataType, this.scaleFactor);
    }

    /**
     * Returns true if the object is an instance of DataObject;
     *
     * @param {*} obj - object to test.
     * @returns {boolean} true if obj is DataObject.
     * @since 6.0.0
     */
    static isDataObject(obj) {
        return obj instanceof DataObject;
    }

    /**
     * Primitive value conversion.
     *
     * @returns {number | bigint | string | Date} DataObject value.
     * @since 6.0.0
     */
    valueOf() {
        return this.value;
    }

    /**
     * Primitive string conversion.
     *
     * @returns {string} DataObject string representation.
     * @since 6.0.0
     */
    toString() {
        return '[' + this.key + ']';
    }

    /**
     * Get a sub-entry.
     *
     * @param {number} index - sub-entry index to get.
     * @returns {DataObject} new DataObject.
     * @since 6.0.0
     */
    at(index) {
        if (!this._subObjects)
            throw new TypeError('not an Array type');

        return this._subObjects.at(index);
    }

    /**
     * Create or add a new sub-entry.
     *
     * @param {number} subIndex - sub-entry index to add.
     * @param {DataObject | object} data - An existing {@link DataObject} or
     * the data to create one.
     * @returns {DataObject} new DataObject.
     * @protected
     */
    addSubObject(subIndex, data) {
        if (!this._subObjects)
            throw new TypeError('not an Array type');

        const key = this.key + 'sub' + subIndex;
        const entry = new DataObject(key, data);
        this._subObjects[subIndex] = entry;

        // Emit update from parent if sub-entry value changes
        entry.on('update', () => this._emitUpdate());

        // Allow access to the sub-object using bracket notation
        if (!Object.prototype.hasOwnProperty.call(this, subIndex)) {
            Object.defineProperty(this, subIndex, {
                get: () => this.at(subIndex)
            });
        }

        // Update max sub-index
        if (this._subObjects[0].value < subIndex)
            this._subObjects[0]._raw.writeUInt8(subIndex);

        // Update subNumber
        this.subNumber = 1;
        for (let i = 1; i <= this._subObjects[0].value; ++i) {
            if (this._subObjects[i] !== undefined)
                this.subNumber += 1;
        }

        return entry;
    }

    /**
     * Remove a sub-entry from the array and return it.
     *
     * @param {number} subIndex - sub-entry index to remove.
     * @returns {DataObject} removed DataObject.
     * @protected
     */
    removeSubObject(subIndex) {
        if (!this._subObjects)
            throw new TypeError('not an Array type');

        const obj = this._subObjects[subIndex];
        delete this._subObjects[subIndex];

        // Update max sub-index
        if (subIndex >= this._subObjects[0].value) {
            // Find the next highest sub-index
            for (let i = subIndex; i >= 0; --i) {
                if (this._subObjects[i] !== undefined) {
                    this._subObjects[0]._raw.writeUInt8(i);
                    break;
                }
            }
        }

        // Update subNumber
        this.subNumber = 1;
        for (let i = 1; i <= this._subObjects[0].value; ++i) {
            if (this._subObjects[i] !== undefined)
                this.subNumber += 1;
        }

        return obj;
    }

    /**
     * Emit the update event.
     *
     * @private
     */
    _emitUpdate() {
        /**
         * The DataObject value was changed.
         *
         * @event DataObject#update
         */
        this.emit('update', this);
    }
}

/**
 * A CANopen Electronic Data Sheet.
 *
 * This class provides methods for loading and saving CANopen EDS v4.0 files.
 *
 * @param {object} info - file info.
 * @param {string} info.fileName - file name.
 * @param {string} info.fileVersion - file version.
 * @param {string} info.fileRevision - file revision.
 * @param {string} info.description - What the file is for.
 * @param {Date} info.creationDate - When the file was created.
 * @param {string} info.createdBy - Who created the file.
 * @param {string} info.vendorName - The device vendor name.
 * @param {number} info.vendorNumber - the device vendor number.
 * @param {string} info.productName - the device product name.
 * @param {number} info.productNumber - the device product number.
 * @param {number} info.revisionNumber - the device revision number.
 * @param {string} info.orderCode - the device order code.
 * @param {Array<number>} info.baudRates - supported buadrates
 * @param {boolean} info.lssSupported - true if LSS is supported.
 * @see CiA306 "Electronic data sheet specification for CANopen"
 */
class Eds {
    constructor(info = {}) {
        this.fileInfo = {
            EDSVersion: '4.0'
        };
        this.deviceInfo = {
            SimpleBootUpMaster: 0,
            SimpleBootUpSlave: 0,
            Granularity: 8,
            DynamicChannelsSupported: 0,
            CompactPDO: 0,
            GroupMessaging: 0,
        };
        this.dummyUsage = {};
        this.dataObjects = {};
        this.comments = [];
        this.nameLookup = {};

        // fileInfo
        this.fileName = info.fileName || '';
        this.fileVersion = info.fileVersion || 1;
        this.fileRevision = info.fileRevision || 1;
        this.description = info.description || '';
        this.creationDate = info.creationDate || new Date();
        this.createdBy = info.createdBy || 'node-canopen';

        // deviceInfo
        this.vendorName = info.vendorName || '';
        this.vendorNumber = info.vendorNumber || 0;
        this.productName = info.productName || '';
        this.productNumber = info.productNumber || 0;
        this.revisionNumber = info.revisionNumber || 0;
        this.orderCode = info.orderCode || '';
        this.baudRates = info.baudRates || [];
        this.lssSupported = info.lssSupported || false;

        // Add default data types
        for (const [name, index] of Object.entries(DataType)) {
            this.addEntry(index, {
                parameterName: name,
                objectType: ObjectType.DEFTYPE,
                dataType: DataType[name],
                accessType: AccessType.READ_WRITE,
            });
        }

        // Add mandatory objects (0x1000, 0x1001, 0x1018)
        this.setDeviceType(0, 0);
        this.setErrorRegister(0);
        this.setIdentity({
            vendorId: info.vendorNumber,
            productCode: info.productNumber,
            revisionNumber: info.revisionNumber,
            serialNumber: 0,
        });
    }

    /**
     * Returns true if the object is an instance of Eds.
     *
     * @param {object} obj - object to test.
     * @returns {boolean} true if obj is Eds.
     * @since 6.0.0
     */
    static isEds(obj) {
        return obj instanceof Eds;
    }

    /**
     * Create a new Eds from a file path.
     *
     * @param {string} path - path to file.
     * @returns {Eds} new Eds object.
     * @since 6.0.0
     */
    static fromFile(path) {
        const eds = new Eds();
        eds.load(path);
        return eds;
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
                this.addEntry(index, edsToEntry(data));
            });

        entries
            .filter(([key]) => {
                return subIndexMatch.test(key);
            })
            .forEach(([key, data]) => {
                let [index, subIndex] = key.split('sub');
                index = parseInt(index, 16);
                subIndex = parseInt(subIndex, 16);
                this.addSubEntry(index, subIndex, edsToEntry(data));
            });
    }

    /**
     * Write an EDS file.
     *
     * @param {string} path - path to file, defaults to fileName.
     * @param {object} [options] - optional inputs.
     * @param {Date} [options.modificationDate] - file modification date to file.
     * @param {Date} [options.modifiedBy] - file modification date to file.
     */
    save(path, options = {}) {
        if (!path)
            path = this.fileName;

        this.modificationDate = options.modificationDate || new Date();
        this.modifiedBy = options.modifiedBy || '';

        this.deviceInfo['NrOfTXPDO'] = this.nrOfTXPDO;
        this.deviceInfo['NrOfRXPDO'] = this.nrOfRXPDO;

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

        for (const key of Object.keys(this.dataObjects)) {
            let index = parseInt(key);

            if ([0x1000, 0x1001, 0x1018].includes(index)) {
                mandCount += 1;
                mandObjects[mandCount] = '0x' + index.toString(16);
            }
            else if (index >= 0x1000 && index < 0x1FFF) {
                optCount += 1;
                optObjects[optCount] = '0x' + index.toString(16);
            }
            else if (index >= 0x2000 && index < 0x5FFF) {
                mfrCount += 1;
                mfrObjects[mfrCount] = '0x' + index.toString(16);
            }
            else if (index >= 0x6000 && index < 0xFFFF) {
                optCount += 1;
                optObjects[optCount] = '0x' + index.toString(16);
            }
        }

        // Write data objects
        mandObjects['SupportedObjects'] = mandCount;
        this._write(fd, ini.encode(
            mandObjects, { section: 'MandatoryObjects' }));

        this._writeObjects(fd, mandObjects);

        optObjects['SupportedObjects'] = optCount;
        this._write(fd, ini.encode(
            optObjects, { section: 'OptionalObjects' }));

        this._writeObjects(fd, optObjects);

        mfrObjects['SupportedObjects'] = mfrCount;
        this._write(fd, ini.encode(
            mfrObjects, { section: 'ManufacturerObjects' }));

        this._writeObjects(fd, mfrObjects);

        fs.closeSync(fd);
    }

    /**
     * Reset objects to their default values.
     */
    reset() {
        for (const [entry] of Object.value(this.dataObjects))
            entry.value = entry.defaultValue;
    }

    /**
     * Get a data object by name.
     *
     * @param {string} index - name of the data object.
     * @returns {Array<DataObject>} - all entries matching name.
     */
    findEntry(index) {
        let result = this.nameLookup[index];
        if(result !== undefined)
            return result;

        return [];
    }

    /**
     * Get a data object by index.
     *
     * @param {number} index - index of the data object.
     * @returns {DataObject | null} - entry matching index.
     */
    getEntry(index) {
        let entry = null;
        if (typeof index == 'string') {
            // Name lookup
            entry = this.findEntry(index);
            if(entry.length > 1)
                throw new EdsError('duplicate entry');

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
        if (entry !== undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`${index} already exists`);
        }

        const key = index.toString(16);
        entry = new DataObject(key, data);
        this.dataObjects[index] = entry;

        if (this.nameLookup[entry.parameterName] === undefined)
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
        if (entry === undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`${index} does not exist`);
        }

        this.nameLookup[entry.parameterName].splice(
            this.nameLookup[entry.parameterName].indexOf(entry), 1);

        if (this.nameLookup[entry.parameterName].length == 0)
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

        if (entry === undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`${index} does not exist`);
        }

        if (entry.subNumber === undefined) {
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

        if (entry === undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`${index} does not exist`);
        }

        if (entry.subNumber === undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`${index} does not support sub objects`);
        }

        // Add the new entry
        return entry.addSubObject(subIndex, data);
    }

    /**
     * Delete a sub-entry.
     *
     * @param {number} index - index of the data object.
     * @param {number} subIndex - subIndex of the data object.
     */
    removeSubEntry(index, subIndex) {
        const entry = this.dataObjects[index];

        if (subIndex < 1)
            throw new EdsError('subIndex must be >= 1');

        if (entry === undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`${index} does not exist`);
        }

        if (entry.subNumber === undefined) {
            index = '0x' + index.toString(16);
            throw new EdsError(`${index} does not support sub objects`);
        }

        if (entry[subIndex] === undefined)
            return;

        // Delete the entry
        entry.removeSubObject(subIndex);
    }

    /**
     * Get the value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @returns {number | bigint | string | Date} entry value.
     */
    getValue(index) {
        const entry = this.getEntry(index);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index} does not exist`);
        }

        return entry.value;
    }

    /**
     * Get the value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - sub-object index.
     * @returns {number | bigint | string | Date} entry value.
     */
    getValueArray(index, subIndex) {
        const entry = this.getSubEntry(index, subIndex);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index}[${subIndex}] does not exist`);
        }

        return entry.value;
    }

    /**
     * Get the scale factor of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @returns {number | bigint | string | Date} entry value.
     */
    getScale(index) {
        const entry = this.getEntry(index);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index} does not exist`);
        }

        return entry.scaleFactor;
    }

    /**
     * Get the scale factor of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - sub-object index.
     * @returns {number | bigint | string | Date} entry value.
     */
    getScaleArray(index, subIndex) {
        const entry = this.getSubEntry(index, subIndex);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index}[${subIndex}] does not exist`);
        }

        return entry.scaleFactor;
    }

    /**
     * Get the raw value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @returns {Buffer} entry data.
     */
    getRaw(index) {
        const entry = this.getEntry(index);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index} does not exist`);
        }

        return entry.raw;
    }

    /**
     * Get the raw value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - sub-object index.
     * @returns {Buffer} entry data.
     */
    getRawArray(index, subIndex) {
        const entry = this.getSubEntry(index, subIndex);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index}[${subIndex}] does not exist`);
        }

        return entry.raw;
    }

    /**
     * Set the value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number | bigint | string | Date} value - value to set.
     */
    setValue(index, value) {
        const entry = this.getEntry(index);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index} does not exist`);
        }

        entry.value = value;
    }

    /**
     * Set the value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - array sub-index to set;
     * @param {number | bigint | string | Date} value - value to set.
     */
    setValueArray(index, subIndex, value) {
        const entry = this.getSubEntry(index, subIndex);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index}[${subIndex}] does not exist`);
        }

        entry.value = value;
    }

    /**
     * Set the raw value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {Buffer} raw - raw Buffer to set.
     */
    setRaw(index, raw) {
        const entry = this.getEntry(index);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index} does not exist`);
        }

        entry.raw = raw;
    }

    /**
     * Set the raw value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - sub-object index.
     * @param {Buffer} raw - raw Buffer to set.
     */
    setRawArray(index, subIndex, raw) {
        const entry = this.getSubEntry(index, subIndex);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index}[${subIndex}] does not exist`);
        }

        entry.raw = raw;
    }

    /**
     * Set the scale factor of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} scaleFactor - value to set.
     * @since 6.0.0
     */
    setScale(index, scaleFactor) {
        const entry = this.getEntry(index);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index} does not exist`);
        }

        entry.scaleFactor = scaleFactor;
    }

    /**
     * Set the scale factor of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - array sub-index to set;
     * @param {number} scaleFactor - value to set.
     * @since 6.0.0
     */
    setScaleArray(index, subIndex, scaleFactor) {
        const entry = this.getSubEntry(index, subIndex);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index}[${subIndex}] does not exist`);
        }

        entry.scaleFactor = scaleFactor;
    }

    /**
     * Set object 0x1000 - Device type.
     * - bit 0..15 - Device profile number.
     * - bit 16..31 - Additional info.
     *
     * @param {number} profile - profile number.
     * @param {Buffer | number} info - info field (2 bytes).
     * @param {object} [options] - DataObject creation options.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    setDeviceType(profile, info, options = {}) {
        let obj1000 = this.getEntry(0x1000);
        if (obj1000 === undefined) {
            obj1000 = this.addEntry(0x1000, {
                parameterName: 'Device type',
                objectType: ObjectType.VAR,
                dataType: DataType.UNSIGNED32,
                accessType: AccessType.READ_ONLY,
            });
        }

        obj1000.raw.writeUInt16LE(profile, 0);
        if (info) {
            if (typeof info === 'number') {
                obj1000.raw.writeUInt16LE(info, 2);
            }
            else {
                if (!Buffer.isBuffer(info))
                    info = Buffer.from(info);

                info.copy(obj1000.raw, 2);
            }
        }

        if(options.saveDefault)
            obj1000.defaultValue = obj1000.value;
    }

    /**
     * Set object 0x1001 - Error register.
     * - bit 0 - Generic error.
     * - bit 1 - Current.
     * - bit 2 - Voltage.
     * - bit 3 - Temperature.
     * - bit 4 - Communication error.
     * - bit 5 - Device profile specific.
     * - bit 6 - Reserved (always 0).
     * - bit 7 - Manufacturer specific.
     *
     * @param {number | object} flags - error flags.
     * @param {boolean} flags.generic - generic error.
     * @param {boolean} flags.current - current error.
     * @param {boolean} flags.voltage - voltage error.
     * @param {boolean} flags.temperature - temperature error.
     * @param {boolean} flags.communication - communication error.
     * @param {boolean} flags.device - device profile specific error.
     * @param {boolean} flags.manufacturer - manufacturer specific error.
     * @since 6.0.0
     */
    setErrorRegister(flags) {
        let obj1001 = this.getEntry(0x1001);
        if (obj1001 === undefined) {
            obj1001 = this.addEntry(0x1001, {
                parameterName: 'Error register',
                objectType: ObjectType.VAR,
                dataType: DataType.UNSIGNED8,
                accessType: AccessType.READ_ONLY,
            });
        }

        if(typeof flags !== 'object') {
            obj1001.value = flags;
        }
        else {
            let value = obj1001.value;
            if(flags.generic !== undefined) {
                if(flags.generic)
                    value |= (1 << 0);
                else
                    value &= ~(1 << 0);
            }

            if(flags.current !== undefined) {
                if(flags.current)
                    value |= (1 << 1);
                else
                    value &= ~(1 << 1);
            }

            if(flags.voltage !== undefined) {
                if(flags.voltage)
                    value |= (1 << 2);
                else
                    value &= ~(1 << 2);
            }

            if(flags.temperature !== undefined) {
                if(flags.temperature)
                    value |= (1 << 3);
                else
                    value &= ~(1 << 3);
            }

            if(flags.communication !== undefined) {
                if(flags.communication)
                    value |= (1 << 4);
                else
                    value &= ~(1 << 4);
            }

            if(flags.device !== undefined) {
                if(flags.device)
                    value |= (1 << 5);
                else
                    value &= ~(1 << 5);
            }

            if(flags.manufacturer !== undefined) {
                if(flags.manufacturer)
                    value |= (1 << 7);
                else
                    value &= ~(1 << 7);
            }

            obj1001.value = value;
        }
    }

    /**
     * Set object 0x1002 - Manufacturer status register.
     *
     * @param {Buffer | number} status - status register.
     * @param {object} [options] - DataObject creation options.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    setStatusRegister(status, options = {}) {
        let obj1002 = this.getEntry(0x1002);
        if (obj1002 === undefined) {
            obj1002 = this.addEntry(0x1002, {
                parameterName: 'Manufacturer status register',
                objectType: ObjectType.VAR,
                dataType: DataType.UNSIGNED32,
                accessType: AccessType.READ_ONLY,
            });
        }

        if (typeof status === 'number') {
            obj1002.value = status;
        }
        else {
            if (!Buffer.isBuffer(status))
                status = Buffer.from(status);

            status.copy(obj1002.raw);
        }

        if(options.saveDefault)
            obj1002.defaultValue = obj1002.value;
    }

    /**
     * Push an entry to object 0x1003 - Pre-defined error field.
     * - bit 0..15 - Error code.
     * - bit 16..31 - Additional info.
     *
     * @param {number} code - error code.
     * @param {Buffer | number} info - error info (2 bytes).
     * @since 6.0.0
     */
    pushErrorHistory(code, info) {
        const obj1003 = this.getEntry(0x1003);
        if (!obj1003)
            throw new EdsError();

        const maxSubIndex = obj1003[0].value;
        if (maxSubIndex > 1) {
            // Shift objects
            const lastObj = obj1003._subObjects[maxSubIndex];
            for (let i = maxSubIndex; i > 1; --i)
                obj1003._subObjects[i] = obj1003._subObjects[i - 1];

            obj1003._subObjects[1] = lastObj;
        }

        // Write new value to sub-index 1
        obj1003[1].raw.writeUInt16LE(code, 0);
        if (info) {
            if (typeof info === 'number') {
                obj1003[1].raw.writeUInt16LE(info, 2);
            }
            else {
                if (!Buffer.isBuffer(info))
                    info = Buffer.from(info);

                info.copy(obj1003[1].raw, 2);
            }
        }
    }

    /**
     * Configures the length of 0x1003 - Pre-defined error field.
     *
     * @param {number} length - how many historical error events should be kept.
     * @param {object} [options] - DataObject creation options.
     * @param {AccessType} [options.accessType] - DataObject access type.
     * @since 6.0.0
     */
    setErrorHistoryLength(length, options = {}) {
        if (length === undefined || length < 0)
            throw new EdsError('error field size must >= 0');

        let obj1003 = this.getEntry(0x1003);
        if (obj1003 === undefined) {
            obj1003 = this.addEntry(0x1003, {
                parameterName: 'Pre-defined error field',
                objectType: ObjectType.ARRAY,
            });
        }

        while (length < obj1003.subNumber - 1) {
            // Remove extra entries
            this.removeSubEntry(0x1003, obj1003.subNumber - 1);
        }

        while (length > obj1003.subNumber - 1) {
            // Add new entries
            const index = obj1003.subNumber;
            this.addSubEntry(0x1003, index, {
                parameterName: `Standard error field ${index}`,
                dataType: DataType.UNSIGNED32,
                accessType: options.accessType || AccessType.READ_WRITE,
            });
        }
    }

    /**
     * Set object 0x1005 - COB-ID SYNC.
     * - bit 0..10 - CAN base frame.
     * - bit 11..28 - CAN extended frame.
     * - bit 29 - Frame type.
     * - bit 30 - Produce sync objects.
     *
     * @param {number} cobId - Sync COB-ID (typically 0x80).
     * @param {boolean} generate - Sync generation enable.
     * @param {object} [options] - DataObject creation options.
     * @param {AccessType} [options.accessType] - DataObject access type.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    setSyncCobId(cobId, generate, options = {}) {
        const raw = typeToRaw(cobId & 0x7FF, DataType.UNSIGNED32);
        if (generate) {
            raw[3] |= (1 << 6); // bit 30
            if (!cobId)
                throw new EdsError('COB-ID SYNC may not be 0');
        }

        let obj1005 = this.getEntry(0x1005);
        if (!obj1005) {
            obj1005 = this.addEntry(0x1005, {
                dataType: DataType.UNSIGNED32,
                parameterName: 'COB-ID SYNC',
                accessType: options.accessType || AccessType.READ_WRITE,
            });
        }

        obj1005.raw = raw;
        if (options.saveDefault)
            obj1005.defaultValue = obj1005.value;
    }

    /**
     * Set object 0x1006 - Communication cycle period.
     *
     * @param {number} cyclePeriod - communication cycle period.
     * @param {object} [options] - DataObject creation options.
     * @param {AccessType} [options.accessType] - DataObject access type.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    setSyncCyclePeriod(cyclePeriod, options = {}) {
        if (!cyclePeriod)
            throw new EdsError('communication cycle period may not be 0');

        let obj1006 = this.getEntry(0x1006);
        if (!obj1006) {
            obj1006 = this.addEntry(0x1006, {
                dataType: DataType.UNSIGNED32,
                parameterName: 'Communication cycle period',
                accessType: options.accessType || AccessType.READ_WRITE,
            });
        }

        obj1006.value = cyclePeriod;
        if (options.saveDefault)
            obj1006.defaultValue = cyclePeriod;
    }

    /**
     * Set object 0x1008 - Manufacturer device name.
     *
     * @param {string} name - device name.
     * @param {object} [options] - DataObject creation options.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    setDeviceName(name, options = {}) {
        let obj1008 = this.getEntry(0x1008);
        if (obj1008 === undefined) {
            obj1008 = this.addEntry(0x1008, {
                parameterName: 'Manufacturer device name',
                objectType: ObjectType.VAR,
                dataType: DataType.VISIBLE_STRING,
                accessType: AccessType.CONSTANT,
            });
        }

        obj1008.value = name;
        if(options.saveDefault)
            obj1008.defaultValue = name;
    }

    /**
     * Set object 0x1009 - Manufacturer hardware version.
     *
     * @param {string} version - device hardware version.
     * @param {object} [options] - DataObject creation options.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    setHardwareVersion(version, options = {}) {
        let obj1009 = this.getEntry(0x1009);
        if (obj1009 === undefined) {
            obj1009 = this.addEntry(0x1009, {
                parameterName: 'Manufacturer hardware version',
                objectType: ObjectType.VAR,
                dataType: DataType.VISIBLE_STRING,
                accessType: AccessType.CONSTANT,
            });
        }

        obj1009.value = version;
        if(options.saveDefault)
            obj1009.defaultValue = version;
    }

    /**
     * Set object 0x100A - Manufacturer software version.
     *
     * @param {string} version - device software version.
     * @param {object} [options] - DataObject creation options.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    setSoftwareVersion(version, options = {}) {
        let obj100A = this.getEntry(0x100A);
        if (obj100A === undefined) {
            obj100A = this.addEntry(0x100A, {
                parameterName: 'Manufacturer software version',
                objectType: ObjectType.VAR,
                dataType: DataType.VISIBLE_STRING,
                accessType: AccessType.CONSTANT,
            });
        }

        obj100A.value = version;
        if(options.saveDefault)
            obj100A.defaultValue = version;
    }

    /**
     * Set object 0x1012 - COB-ID TIME.
     * - bit 0..10 - CAN base frame.
     * - bit 11..28 - CAN extended frame.
     * - bit 29 - Frame type.
     * - bit 30 - Produce time objects.
     * - bit 31 - Consume time objects.
     *
     * @param {number} cobId - Time COB-ID.
     * @param {boolean} produce - Time stamp producer enable.
     * @param {boolean} consume - Time stamp consumer enable.
     * @param {object} [options] - DataObject creation options.
     * @param {AccessType} [options.accessType] - DataObject access type.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    setTimeCobId(cobId, produce, consume, options = {}) {
        const raw = typeToRaw(cobId & 0x7FF, DataType.UNSIGNED32);

        if (produce)
            raw[3] |= (1 << 6); // bit 30

        if (consume)
            raw[3] |= (1 << 7); // bit 31

        if ((produce || consume) && !cobId)
            throw new EdsError('COB-ID TIME may not be 0');

        let obj1012 = this.getEntry(0x1012);
        if (!obj1012) {
            obj1012 = this.addEntry(0x1012, {
                dataType: DataType.UNSIGNED32,
                parameterName: 'COB-ID TIME',
                accessType: options.accessType || AccessType.READ_WRITE,
            });
        }

        obj1012.raw = raw;
        if (options.saveDefault)
            obj1012.defaultValue = obj1012.value;
    }

    /**
     * Set object 0x1014 - COB-ID EMCY.
     * - bit 0..10 - CAN base frame.
     * - bit 11..28 - CAN extended frame.
     * - bit 29 - Frame type.
     * - bit 30 - Reserved (0x00).
     * - bit 31 - EMCY valid.
     *
     * @param {number} cobId - Emcy COB-ID.
     * @param {object} [options] - DataObject creation options.
     * @param {AccessType} [options.accessType] - DataObject access type.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    setEmcyCobId(cobId, options = {}) {
        let value = cobId & 0x7FF;
        if (cobId === 0)
            value = (1 << 31);

        let obj1014 = this.getEntry(0x1014);
        if (!obj1014) {
            obj1014 = this.addEntry(0x1014, {
                dataType: DataType.UNSIGNED32,
                parameterName: 'COB-ID EMCY',
                accessType: options.accessType || AccessType.READ_WRITE,
            });
        }

        obj1014.value = value;
        if (options.saveDefault)
            obj1014.defaultValue = value;
    }

    /**
     * Set object 0x1015 - Inhibit time EMCY.
     *
     * @param {number} inhibitTime - inhibit time in multiples of 100 μs.
     * @param {object} [options] - DataObject creation options.
     * @param {AccessType} [options.accessType] - DataObject access type.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    setEmcyInhibitTime(inhibitTime, options = {}) {
        let obj1015 = this.getEntry(0x1015);
        if (!obj1015) {
            obj1015 = this.addEntry(0x1015, {
                dataType: DataType.UNSIGNED16,
                parameterName: 'Inhibit time EMCY',
                accessType: options.accessType || AccessType.READ_WRITE,
            });
        }

        obj1015.value = inhibitTime;
        if (options.saveDefault)
            obj1015.defaultValue = inhibitTime;
    }

    /**
     * Add an entry to object 0x1016 - Consumer heartbeat time.
     * - bit 0..15 - Heartbeat time in ms.
     * - bit 16..23 - Node-ID of producer.
     * - bit 24..31 - Reserved (0x00);
     *
     * @param {number} deviceId - device identifier [1-127].
     * @param {number} timeout - milliseconds before a timeout is reported.
     * @param {object} [options] - DataObject creation options.
     * @param {number} [options.subIndex] - index to store the entry.
     * @param {AccessType} [options.accessType] - DataObject access type.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    addHeartbeatConsumer(deviceId, timeout, options = {}) {
        if (deviceId < 1 || deviceId > 0x7F)
            throw RangeError('deviceId must be in range [1-127]');

        if (timeout < 0 || timeout > 0xffff)
            throw RangeError('timeout must be in range [0-65535]');

        let obj1016 = this.getEntry(0x1016);
        if (obj1016 === undefined) {
            obj1016 = this.addEntry(0x1016, {
                objectType: ObjectType.ARRAY,
                parameterName: 'Consumer heartbeat time',
            });
        }

        for (let i = 1; i <= obj1016[0].value; ++i) {
            const subObj = obj1016.at(i);
            if(subObj && subObj.raw.readUInt8(2) === deviceId) {
                deviceId = '0x' + deviceId.toString(16);
                throw new EdsError(`consumer for ${deviceId} already exists`);
            }
        }

        let subIndex = options.subIndex;
        if (!subIndex) {
            // Find first empty index
            for (let i = 1; i <= 255; ++i) {
                if (obj1016[i] === undefined) {
                    subIndex = i;
                    break;
                }
            }
        }

        if (!subIndex)
            throw new EdsError('NMT consumer entry full');

        // Install sub entry
        const subObj = this.addSubEntry(0x1016, subIndex, {
            parameterName: `Device 0x${deviceId.toString(16)}`,
            dataType: DataType.UNSIGNED32,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        subObj.raw.writeUInt16LE(timeout, 0);
        subObj.raw.writeUInt8(deviceId, 2);
        if (options.saveDefault)
            subObj.defaultValue = subObj.value;
    }

    /**
     * Remove an entry from object 0x1016 - Consumer heartbeat time.
     *
     * @param {number} cobId - COB-ID of the entry to remove.
     * @since 6.0.0
     */
    removeHeartbeatConsumer(cobId) {
        const obj1016 = this.getEntry(0x1016);
        if (obj1016 !== undefined) {
            const maxSubIndex = obj1016[0].value;
            for (let i = 1; i <= maxSubIndex; ++i) {
                const subObj = obj1016.at(i);
                if (subObj === undefined)
                    continue;

                if (subObj.raw.readUInt8(2) === cobId) {
                    obj1016.removeSubObject(i);
                    break;
                }
            }
        }
    }

    /**
     * Set object 0x1017 - Producer heartbeat time.
     *
     * @param {number} producerTime - Producer heartbeat time in ms.
     * @param {object} [options] - DataObject creation options.
     * @param {AccessType} [options.accessType] - DataObject access type.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    setHeartbeatProducerTime(producerTime, options = {}) {
        if (!producerTime)
            throw new EdsError('producerTime may not be 0');

        let obj1017 = this.getEntry(0x1017);
        if (!obj1017) {
            obj1017 = this.addEntry(0x1017, {
                dataType: DataType.UNSIGNED32,
                parameterName: 'Producer heartbeat time',
                accessType: options.accessType || AccessType.READ_WRITE,
            });
        }

        obj1017.value = producerTime;
        if (options.saveDefault)
            obj1017.defaultValue = producerTime;
    }

    /**
     * Set object 0x1018 - Identity object.
     * - sub-index 1 - Vendor id.
     * - sub-index 2 - Product code.
     * - sub-index 3 - Revision number.
     * - sub-index 4 - Serial number.
     *
     * @param {object} identity - device identity.
     * @param {number} identity.vendorId - vendor id.
     * @param {number} identity.productCode - product code.
     * @param {number} identity.revisionNumber - revision number.
     * @param {number} identity.serialNumber - serial number.
     * @param {object} [options] - DataObject creation options.
     * @param {AccessType} [options.accessType] - DataObject access type.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    setIdentity(identity, options = {}) {
        let obj1018 = this.getEntry(0x1018);
        if (!obj1018) {
            obj1018 = this.addEntry(0x1018, {
                parameterName: 'Identity object',
                objectType: ObjectType.RECORD,
            });

            obj1018.addSubObject(1, {
                parameterName: 'Vendor-ID',
                dataType: DataType.UNSIGNED32,
                accessType: options.accessType || AccessType.READ_ONLY,
            });

            obj1018.addSubObject(2, {
                parameterName: 'Product code',
                objectType: ObjectType.VAR,
                dataType: DataType.UNSIGNED32,
                accessType: options.accessType || AccessType.READ_ONLY,
            });

            obj1018.addSubObject(3, {
                parameterName: 'Revision number',
                objectType: ObjectType.VAR,
                dataType: DataType.UNSIGNED32,
                accessType: options.accessType || AccessType.READ_ONLY,
            });

            obj1018.addSubObject(4, {
                parameterName: 'Serial number',
                objectType: ObjectType.VAR,
                dataType: DataType.UNSIGNED32,
                accessType: options.accessType || AccessType.READ_ONLY,
            });
        }

        if (identity.vendorId !== undefined) {
            obj1018[1].value = identity.vendorId;
            if (options.saveDefault)
                obj1018[1].defaultValue = identity.vendorId;
        }

        if (identity.productCode !== undefined) {
            obj1018[2].value = identity.productCode;
            if (options.saveDefault)
                obj1018[2].defaultValue = identity.productCode;
        }

        if (identity.revisionNumber !== undefined) {
            obj1018[3].value = identity.revisionNumber;
            if (options.saveDefault)
                obj1018[3].defaultValue = identity.revisionNumber;
        }

        if (identity.serialNumber !== undefined) {
            obj1018[4].value = identity.serialNumber;
            if (options.saveDefault)
                obj1018[4].defaultValue = identity.serialNumber;
        }
    }

    /**
     * Set object 0x1019 - Synchronous counter overflow value.
     *
     * @param {number} overflowValue - Sync overflow value.
     * @param {object} [options] - DataObject creation options.
     * @param {AccessType} [options.accessType] - DataObject access type.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    setSyncOverflow(overflowValue, options = {}) {
        overflowValue = overflowValue & 0xff;

        let obj1019 = this.getEntry(0x1019);
        if (!obj1019) {
            obj1019 = this.addEntry(0x1019, {
                dataType: DataType.UNSIGNED8,
                parameterName: 'Synchronous counter overflow value',
                accessType: options.accessType || AccessType.READ_WRITE,
                defaultValue: overflowValue,
            });
        }

        obj1019.value = overflowValue;
        if (options.saveDefault)
            obj1019.defaultValue = overflowValue;
    }

    /**
     * Add an entry to object 0x1028 - Emergency consumer object.
     * - bit 0..11 - CAN-ID.
     * - bit 16..23 - Reserved (0x00).
     * - bit 31 - 0 = valid, 1 = invalid.
     *
     * @param {number} cobId - COB-ID to add.
     * @param {object} [options] - DataObject creation options.
     * @param {number} [options.subIndex] - index to store the entry.
     * @param {string} [options.parameterName] - DataObject name.
     * @param {AccessType} [options.accessType] - DataObject access type.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    addEmcyConsumer(cobId, options = {}) {
        if (cobId > 0x7FF)
            throw RangeError('CAN extended frames not supported');

        let obj1028 = this.getEntry(0x1028);
        if (!obj1028) {
            obj1028 = this.addEntry(0x1028, {
                objectType: ObjectType.ARRAY,
                parameterName: options.parameterName || 'Emergency consumer object',
            });
        }

        for (let i = 1; i <= obj1028[0].value; ++i) {
            const subObj = this.getSubEntry(0x1028, i);
            if(subObj && subObj.raw.readUInt16LE() === cobId) {
                cobId = '0x' + cobId.toString(16);
                throw new EdsError(`EMCY consumer ${cobId} already exists`);
            }
        }

        let subIndex = options.subIndex;
        if (!subIndex) {
            // Find first empty index
            for (let i = 1; i <= 255; ++i) {
                if (obj1028[i] === undefined) {
                    subIndex = i;
                    break;
                }
            }
        }

        if (!subIndex)
            throw new EdsError('entry full');

        const subObj = this.addSubEntry(0x1028, subIndex, {
            parameterName: `Emergency consumer ${subIndex}`,
            dataType: DataType.UNSIGNED32,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        subObj.value = cobId;
        if (options.saveDefault)
            subObj.defaultValue = cobId;
    }

    /**
     * Remove an entry from object 0x1028 - Emergency consumer object.
     *
     * @param {number} cobId - COB-ID of the entry to remove.
     * @since 6.0.0
     */
    removeEmcyConsumer(cobId) {
        const obj1028 = this.getEntry(0x1028);
        if (obj1028 !== undefined) {
            for (let i = 1; i <= obj1028._subObjects[0].value; ++i) {
                const subObject = obj1028._subObjects[i];
                if (subObject === undefined)
                    continue;

                const value = subObject.value;
                if (value >> 31)
                    continue; // Invalid

                if ((value & 0x7FF) === cobId) {
                    obj1028.removeSubObject(i);
                    break;
                }
            }
        }
    }

    /**
     * Add an SDO server parameter object.
     *
     * Object 0x1200..0x127F - SDO server parameter.
     *
     * Sub-index 1/2:
     * - bit 0..10 - CAN base frame.
     * - bit 11..28 - CAN extended frame.
     * - bit 29 - Frame type (base or extended).
     * - bit 30 - Dynamically allocated.
     * - bit 31 - SDO exists / is valid.
     *
     * Sub-index 3 (optional):
     * - bit 0..7 - Node-ID of the SDO client.
     *
     * @param {number} deviceId - device identifier [1-127].
     * @param {number} cobIdTx - COB-ID for outgoing messages (to client).
     * @param {number} cobIdRx - COB-ID for incoming messages (from client).
     * @param {object} [options] - DataObject creation options.
     * @param {string} [options.index] - DataObject index [0x1200-0x127F].
     * @param {string} [options.parameterName] - DataObject name.
     * @param {AccessType} [options.accessType] - DataObject access type.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    addSdoServerParameter(
        deviceId, cobIdTx=0x580, cobIdRx=0x600, options = {}) {

        if (deviceId < 0 || deviceId > 0x7F)
            throw RangeError('deviceId must be in range [0-127]');

        for (let [index, entry] of Object.entries(this.dataObjects)) {
            index = parseInt(index);
            if (index < 0x1200 || index > 0x127F)
                continue;

            const subObj = entry.at(3);
            if(subObj && subObj.value === deviceId) {
                deviceId = '0x' + deviceId.toString(16);
                throw new EdsError(`SDO client ${deviceId} already exists`);
            }
        }

        let index = options.index;
        if (index) {
            if (this.getEntry(options.index))
                throw new EdsError(`index ${options.index} already in use`);
        }
        else {
            index = 0x1200;
            for (; index <= 0x127F; ++index) {
                if (this.getEntry(index) === undefined)
                    break;
            }
        }

        const obj = this.addEntry(index, {
            objectType: ObjectType.RECORD,
            parameterName: options.parameterName || 'SDO server parameter',
        });

        const subObj1 = obj.addSubObject(1, {
            parameterName: 'COB-ID client to server',
            dataType: DataType.UNSIGNED32,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        const subObj2 = obj.addSubObject(2, {
            parameterName: 'COB-ID server to client',
            dataType: DataType.UNSIGNED32,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        const subObj3 = obj.addSubObject(3, {
            parameterName: 'Node-ID of the SDO client',
            dataType: DataType.UNSIGNED8,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        subObj1.value = cobIdRx;
        subObj2.value = cobIdTx;
        subObj3.value = deviceId;

        if (options.saveDefault) {
            subObj1.defaultValue = cobIdRx;
            subObj2.defaultValue = cobIdTx;
            subObj3.defaultValue = deviceId;
        }
    }

    /**
     * Remove an SDO server parameter object.
     *
     * @param {number} deviceId - device identifier [1-127].
     * @since 6.0.0
     */
    removeSdoServerParameter(deviceId) {
        for (let [index, entry] of Object.entries(this.dataObjects)) {
            index = parseInt(index);
            if (index < 0x1200 || index > 0x127F)
                continue;

            if (entry[3] !== undefined && entry[3].value === deviceId) {
                this.removeEntry(index);
                break;
            }
        }
    }

    /**
     * Add an SDO client parameter object.
     *
     * Object 0x1280..0x12FF - SDO client parameter.
     *
     * Sub-index 1/2:
     * - bit 0..10 - CAN base frame.
     * - bit 11..28 - CAN extended frame.
     * - bit 29 - Frame type (base or extended).
     * - bit 30 - Dynamically allocated.
     * - bit 31 - SDO exists / is valid.
     *
     * Sub-index 3:
     * - bit 0..7 - Node-ID of the SDO server.
     *
     * @param {number} deviceId - device identifier [1-127].
     * @param {number} cobIdTx - COB-ID for outgoing messages (to server).
     * @param {number} cobIdRx - COB-ID for incoming messages (from server).
     * @param {object} [options] - DataObject creation options.
     * @param {string} [options.index] - DataObject index [0x1200-0x127F].
     * @param {string} [options.parameterName] - DataObject name.
     * @param {AccessType} [options.accessType] - DataObject access type.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    addSdoClientParameter(
        deviceId, cobIdTx=0x600, cobIdRx=0x580, options = {}) {

        if (!deviceId || deviceId < 1 || deviceId > 0x7F)
            throw new RangeError('deviceId must be in range [1-127]');

        for (let [index, entry] of Object.entries(this.dataObjects)) {
            index = parseInt(index);
            if (index < 0x1280 || index > 0x12FF)
                continue;

            const subObj = entry.at(3);
            if(subObj && subObj.value === deviceId) {
                deviceId = '0x' + deviceId.toString(16);
                throw new EdsError(`SDO server ${deviceId} already exists`);
            }
        }

        let index = options.index;
        if (index) {
            if (this.getEntry(options.index))
                throw new EdsError(`index ${options.index} already in use`);
        }
        else {
            index = 0x1280;
            for (; index <= 0x12FF; ++index) {
                if (this.getEntry(index) === undefined)
                    break;
            }
        }

        const obj = this.addEntry(index, {
            objectType: ObjectType.RECORD,
            parameterName: options.parameterName || 'SDO client parameter',
        });

        const subObj1 = obj.addSubObject(1, {
            parameterName: 'COB-ID client to server',
            dataType: DataType.UNSIGNED32,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        const subObj2 = obj.addSubObject(2, {
            parameterName: 'COB-ID server to client',
            dataType: DataType.UNSIGNED32,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        const subObj3 = obj.addSubObject(3, {
            parameterName: 'Node-ID of the SDO server',
            dataType: DataType.UNSIGNED8,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        subObj1.value = cobIdTx;
        subObj2.value = cobIdRx;
        subObj3.value = deviceId;

        if (options.saveDefault) {
            subObj1.defaultValue = cobIdTx;
            subObj2.defaultValue = cobIdRx;
            subObj3.defaultValue = deviceId;
        }
    }

    /**
     * Remove an SDO client parameter object.
     *
     * @param {number} deviceId - device identifier [1-127].
     * @since 6.0.0
     */
    removeSdoClientParameter(deviceId) {
        for (let [index, entry] of Object.entries(this.dataObjects)) {
            index = parseInt(index);
            if (index < 0x1280 || index > 0x12FF)
                continue;

            if (entry[3] !== undefined && entry[3].value === deviceId) {
                this.removeEntry(index);
                break;
            }
        }
    }

    /**
     * Create a RPDO communication/mapping parameter object.
     *
     * Object 0x1400..0x15FF - RPDO communication parameter
     *
     * Sub-index 1 (mandatory):
     * - bit 0..10 - CAN base frame.
     * - bit 11..28 - CAN extended frame.
     * - bit 29 - Frame type.
     * - bit 30 - RTR allowed.
     * - bit 31 - RPDO valid.
     *
     * Sub-index 2 (mandatory):
     * - bit 0..7 - Transmission type.
     *
     * Sub-index 3 (optional):
     * - bit 0..15 - Inhibit time.
     *
     * Object 0x1600..0x17FF - RPDO mapping parameter
     * - bit 0..7 - Bit length.
     * - bit 8..15 - Sub-index.
     * - bit 16..31 - Index.
     *
     * Inhibit time and synchronous RPDOs are not yet supported. All entries
     * are treated as event-driven with an inhibit time of 0.
     *
     * @param {object} pdo - PDO data.
     * @param {number} pdo.cobId - COB-ID used by the RPDO.
     * @param {number} pdo.transmissionType - transmission type.
     * @param {number} pdo.inhibitTime - minimum time between updates.
     * @param {Array<DataObject>} pdo.dataObjects - objects to map.
     * @param {object} options - optional arguments.
     * @param {number} [options.index] - DataObject index [0x1400-0x15ff].
     * @param {Array<string>} [options.parameterName] - DataObject names.
     * @param {AccessType} [options.accessType] - DataObject access type.
     * @param {boolean} [options.saveDefault] - save value as default.
     * @since 6.0.0
     */
    addReceivePdo(pdo, options = {}) {
        for (let [index, entry] of Object.entries(this.dataObjects)) {
            index = parseInt(index);
            if (index < 0x1400 || index > 0x15FF)
                continue;

            const subObj = entry.at(1);
            if (subObj && subObj.value === pdo.cobId) {
                const cobId = '0x' + pdo.cobId.toString(16);
                throw new EdsError(`RPDO ${cobId} already exists`);
            }
        }

        let index = options.index;
        if (index) {
            if (this.getEntry(options.index))
                throw new EdsError(`index ${options.index} already in use`);
        }
        else {
            index = 0x1400;
            for (; index <= 0x15FF; ++index) {
                if (this.getEntry(index) === undefined)
                    break;
            }
        }

        if (index < 0x1400 || index > 0x15FF)
            throw new RangeError('index must be in range [0x1400-0x15FF]');

        let commName = 'RPDO communication parameter';
        let mapName = 'RPDO mapping parameter';
        if (options.parameterName) {
            if (Array.isArray(options.parameterName)) {
                commName = options.parameterName[0] || commName;
                mapName = options.parameterName[1] || mapName;
            }
            else {
                commName = options.parameterName || commName;
            }
        }

        const commObj = this.addEntry(index, {
            objectType: ObjectType.RECORD,
            parameterName: commName,
        });

        const commSub1 = commObj.addSubObject(1, {
            parameterName: 'COB-ID used by RPDO',
            dataType: DataType.UNSIGNED32,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        commSub1.value = pdo.cobId;
        if (options.saveDefault)
            commSub1.defaultValue = commSub1.value;

        const commSub2 = commObj.addSubObject(2, {
            parameterName: 'transmission type',
            dataType: DataType.UNSIGNED8,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        commSub2.value = pdo.transmissionType || 254;
        if (options.saveDefault)
            commSub2.defaultValue = commSub2.value;

        const commSub3 = commObj.addSubObject(3, {
            parameterName: 'inhibit time',
            dataType: DataType.UNSIGNED16,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        commSub3.value = pdo.inhibitTime || 0;
        if (options.saveDefault)
            commSub3.defaultValue = commSub3.value;

        commObj.addSubObject(4, {
            // Not used
            parameterName: 'compatibility entry',
            dataType: DataType.UNSIGNED8,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        commObj.addSubObject(5, {
            // Not used
            parameterName: 'event timer',
            dataType: DataType.UNSIGNED16,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        commObj.addSubObject(6, {
            // Not used
            parameterName: 'SYNC start value',
            dataType: DataType.UNSIGNED8,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        const mapObj = this.addEntry(index + 0x200, {
            objectType: ObjectType.RECORD,
            parameterName: mapName,
        });

        for (let i = 0; i < pdo.dataObjects.length; ++i) {
            const entry = pdo.dataObjects[i];
            const value = (entry.index << 16)
                | (entry.subIndex << 8)
                | (entry.size << 3);

            const mapSub = mapObj.addSubObject(i + 1, {
                parameterName: `Mapped object ${i + 1}`,
                dataType: DataType.UNSIGNED32,
                accessType: options.accessType || AccessType.READ_WRITE,
                defaultValue: value,
            });

            mapSub.value = value;
            if (options.saveDefault)
                mapSub.defaultValue = value;
        }

        // Update deviceInfo
        this.deviceInfo['NrOfRXPDO'] = this.nrOfRXPDO;
    }

    /**
     * Remove an RPDO communication/mapping parameter object.
     *
     * @param {number} cobId - COB-ID used by the RPDO.
     * @since 6.0.0
     */
    removeReceivePdo(cobId) {
        for (let [index, entry] of Object.entries(this.dataObjects)) {
            index = parseInt(index);
            if (index < 0x1400 || index > 0x15FF)
                continue;

            if (entry[1] !== undefined && entry[1].value === cobId) {
                this.removeEntry(index);
                this.removeEntry(index + 0x200);
                break;
            }
        }

        // Update deviceInfo
        this.deviceInfo['NrOfRXPDO'] = this.nrOfRXPDO;
    }

    /**
     * Create a TPDO communication/mapping parameter object.
     *
     * Object 0x1800..0x19FF - TPDO communication parameter
     *
     * Sub-index 1 (mandatory):
     * - bit 0..10 - CAN base frame.
     * - bit 11..28 - CAN extended frame.
     * - bit 29 - Frame type.
     * - bit 30 - RTR allowed.
     * - bit 31 - TPDO valid.
     *
     * Sub-index 2 (mandatory):
     * - bit 0..7 - Transmission type.
     *
     * Sub-index 3 (optional):
     * - bit 0..15 - Inhibit time.
     *
     * Sub-index 5 (optional):
     * - bit 0..15 - Event timer value.
     *
     * Sub-index 6 (optional):
     * - bit 0..7 - SYNC start value.
     *
     * Object 0x2000..0x21FF - TPDO mapping parameter
     * - bit 0..7 - Bit length.
     * - bit 8..15 - Sub-index.
     * - bit 16..31 - Index.
     *
     * @param {object} pdo - object data.
     * @param {number} pdo.cobId - COB-ID used by the TPDO.
     * @param {number} pdo.transmissionType - transmission type.
     * @param {number} pdo.inhibitTime - minimum time between writes.
     * @param {number} pdo.eventTime - how often to send timer based PDOs.
     * @param {number} pdo.syncStart - initial counter value for sync PDOs.
     * @param {Array<DataObject>} pdo.dataObjects - objects to map.
     * @param {object} options - optional arguments.
     * @param {number} [options.index] - DataObject index [0x1800-0x19ff].
     * @param {Array<string>} [options.parameterName] - DataObject names.
     * @param {AccessType} [options.accessType] - DataObject access type.
     * @since 6.0.0
     */
    addTransmitPdo(pdo, options = {}) {
        for (let [index, entry] of Object.entries(this.dataObjects)) {
            index = parseInt(index);
            if (index < 0x1800 || index > 0x19FF)
                continue;

            const subObj = entry.at(1);
            if (subObj && subObj.value === pdo.cobId) {
                const cobId = '0x' + pdo.cobId.toString(16);
                throw new EdsError(`TPDO ${cobId} already exists`);
            }
        }

        let index = options.index;
        if (index) {
            if (this.getEntry(options.index))
                throw new EdsError(`index ${options.index} already in use`);
        }
        else {
            index = 0x1800;
            for (; index <= 0x19FF; ++index) {
                if (this.getEntry(index) === undefined)
                    break;
            }
        }

        if (index < 0x1800 || index > 0x19FF)
            throw new RangeError('index must be in range [0x1800-0x19FF]');

        let commName = 'TPDO communication parameter';
        let mapName = 'TPDO mapping parameter';
        if (options.parameterName) {
            if (Array.isArray(options.parameterName)) {
                commName = options.parameterName[0] || commName;
                mapName = options.parameterName[1] || mapName;
            }
            else {
                commName = options.parameterName || commName;
            }
        }

        const commEntry = this.addEntry(index, {
            objectType: ObjectType.RECORD,
            parameterName: commName,
        });

        const commSub1 = commEntry.addSubObject(1, {
            parameterName: 'COB-ID used by TPDO',
            dataType: DataType.UNSIGNED32,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        commSub1.value = pdo.cobId;
        if (options.saveDefault)
            commSub1.defaultValue = commSub1.value;

        const commSub2 = commEntry.addSubObject(2, {
            parameterName: 'transmission type',
            dataType: DataType.UNSIGNED8,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        commSub2.value = pdo.transmissionType || 254;
        if (options.saveDefault)
            commSub2.defaultValue = commSub2.value;

        const commSub3 = commEntry.addSubObject(3, {
            parameterName: 'inhibit time',
            dataType: DataType.UNSIGNED16,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        commSub3.value = pdo.inhibitTime || 0;
        if (options.saveDefault)
            commSub3.defaultValue = commSub3.value;

        commEntry.addSubObject(4, {
            parameterName: 'compatibility entry',
            dataType: DataType.UNSIGNED8,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        const commSub5 = commEntry.addSubObject(5, {
            parameterName: 'event timer',
            dataType: DataType.UNSIGNED16,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        commSub5.value = pdo.eventTime || 0;
        if (options.saveDefault)
            commSub5.defaultValue = commSub5.value;

        const commSub6 = commEntry.addSubObject(6, {
            parameterName: 'SYNC start value',
            dataType: DataType.UNSIGNED8,
            accessType: options.accessType || AccessType.READ_WRITE,
        });

        commSub6.value = pdo.syncStart || 0;
        if (options.saveDefault)
            commSub6.defaultValue = commSub6.value;

        const mapEntry = this.addEntry(index + 0x200, {
            objectType: ObjectType.RECORD,
            parameterName: mapName,
        });

        for (let i = 0; i < pdo.dataObjects.length; ++i) {
            const entry = pdo.dataObjects[i];
            const value = (entry.index << 16)
                | (entry.subIndex << 8)
                | (entry.size << 3);

            const mapSub = mapEntry.addSubObject(i + 1, {
                parameterName: `Mapped object ${i + 1}`,
                dataType: DataType.UNSIGNED32,
                accessType: options.accessType || AccessType.READ_WRITE,
                defaultValue: value,
            });

            mapSub.value = value;
            if (options.saveDefault)
                mapSub.defaultValue = value;
        }

        // Update deviceInfo
        this.deviceInfo['NrOfTXPDO'] = this.nrOfTXPDO;
    }

    /**
     * Remove a TPDO communication/mapping parameter object.
     *
     * @param {number} cobId - COB-ID used by the TPDO.
     * @since 6.0.0
     */
    removeTransmitPdo(cobId) {
        for (let [index, entry] of Object.entries(this.dataObjects)) {
            index = parseInt(index);
            if (index < 0x1800 || index > 0x19FF)
                continue;

            if (entry[1] !== undefined && entry[1].value === cobId) {
                this.removeEntry(index);
                this.removeEntry(index + 0x200);
                break;
            }
        }

        // Update deviceInfo
        this.deviceInfo['NrOfTXPDO'] = this.nrOfTXPDO;
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
        this.fileInfo['FileName'] = String(value);
    }

    /**
     * File version (8-bit unsigned integer).
     *
     * @type {number}
     */
    get fileVersion() {
        return this.fileInfo['FileVersion'];
    }

    set fileVersion(value) {
        this.fileInfo['FileVersion'] = Number(value);
    }

    /**
     * File revision (8-bit unsigned integer).
     *
     * @type {number}
     */
    get fileRevision() {
        return this.fileInfo['FileRevision'];
    }

    set fileRevision(value) {
        this.fileInfo['FileRevision'] = Number(value);
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
        this.fileInfo['Description'] = String(value);
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
        const hours = value.getHours().toString().padStart(2, '0');
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
        this.fileInfo['CreatedBy'] = String(value);
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
        const hours = value.getHours().toString().padStart(2, '0');
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
        return this.fileInfo['ModifiedBy'];
    }

    set modifiedBy(value) {
        this.fileInfo['ModifiedBy'] = String(value);
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
        this.deviceInfo['VendorName'] = String(value);
    }

    /**
     * Unique vendor ID (32-bit unsigned integer).
     *
     * @type {number}
     */
    get vendorNumber() {
        return this.deviceInfo['VendorNumber'];
    }

    set vendorNumber(value) {
        this.deviceInfo['VendorNumber'] = Number(value);
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
        this.deviceInfo['ProductName'] = String(value);
    }

    /**
     * Product code (32-bit unsigned integer).
     *
     * @type {number}
     */
    get productNumber() {
        return this.deviceInfo['ProductNumber'];
    }

    set productNumber(value) {
        this.deviceInfo['ProductNumber'] = Number(value);
    }

    /**
     * Revision number (32-bit unsigned integer).
     *
     * @type {number}
     */
    get revisionNumber() {
        return this.deviceInfo['RevisionNumber'];
    }

    set revisionNumber(value) {
        this.deviceInfo['RevisionNumber'] = Number(value);
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
        this.deviceInfo['OrderCode'] = String(value);
    }

    /**
     * Supported baud rates.
     *
     * @type {Array<number>}
     */
    get baudRates() {
        let rates = [];

        if (parseInt(this.deviceInfo['BaudRate_10']))
            rates.push(10000);
        if (parseInt(this.deviceInfo['BaudRate_20']))
            rates.push(20000);
        if (parseInt(this.deviceInfo['BaudRate_50']))
            rates.push(50000);
        if (parseInt(this.deviceInfo['BaudRate_125']))
            rates.push(125000);
        if (parseInt(this.deviceInfo['BaudRate_250']))
            rates.push(250000);
        if (parseInt(this.deviceInfo['BaudRate_500']))
            rates.push(500000);
        if (parseInt(this.deviceInfo['BaudRate_800']))
            rates.push(800000);
        if (parseInt(this.deviceInfo['BaudRate_1000']))
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
     * Indicates simple boot-up master functionality (not supported).
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
     * Indicates simple boot-up slave functionality (not supported).
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
     * Indicates the facility of dynamic variable generation (not supported).
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
     * Indicates the facility of multiplexed PDOs (not supported).
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
        let count = 0;
        for (let index of Object.keys(this.dataObjects)) {
            index = parseInt(index);
            if (index >= 0x1400 && index <= 0x15FF)
                count++;
        }

        return count;
    }

    /**
     * The number of supported transmit PDOs (16-bit unsigned integer).
     *
     * @type {number}
     */
    get nrOfTXPDO() {
        let count = 0;
        for (let index of Object.keys(this.dataObjects)) {
            index = parseInt(index);
            if (index >= 0x1800 && index <= 0x19FF)
                count++;
        }

        return count;
    }

    /**
     * Indicates if LSS functionality is supported.
     *
     * @type {boolean}
     */
    get lssSupported() {
        return !!(this.deviceInfo['LSS_Supported']);
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

        if (postMeridiem)
            hours += 12;

        return new Date(year, month - 1, day, hours, minutes);
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
        if (data.length > 0)
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
        for (const [key, value] of Object.entries(objects)) {
            if (key == 'SupportedObjects')
                continue;

            const index = parseInt(value);
            const dataObject = this.dataObjects[index];

            // Write top level object
            const section = index.toString(16);
            this._write(fd, ini.encode(
                entryToEds(dataObject), { section: section }));

            // Write sub-objects
            for (let i = 0; i < dataObject.subNumber; i++) {
                if (dataObject[i]) {
                    const subSection = section + 'sub' + i;
                    const subObject = dataObject[i];
                    this._write(fd, ini.encode(
                        entryToEds(subObject), { section: subSection }));
                }
            }
        }
    }
}

module.exports = exports = { EdsError, DataObject, Eds };
