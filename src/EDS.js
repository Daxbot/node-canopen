const fs = require('fs');
const ini = require('ini');
const util = require('util');
const { EOL } = require('os');
const EventEmitter = require('events');

/** CANopen object types.
 * @const {number}
 * @memberof EDS
 * @see CiA301 "Object code usage" (§7.4.3)
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

/** CANopen access types.
 * @const {string}
 * @memberof EDS
 * @see CiA301 "Access usage" (§7.4.5)
 */
const accessTypes = {
    READ_WRITE: 'rw',
    WRITE_ONLY: 'wo',
    READ_ONLY:  'ro',
    CONSTANT:   'const',
};

/** CANopen data types.
 * @const {number}
 * @memberof EDS
 * @see CiA301 "Data type entry usage" (§7.4.7)
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

/** A Canopen Data Object.
 * @emits 'update' on value change.
 * @see CiA306 "Object descriptions" (§4.6.3)
 */
class DataObject extends EventEmitter {
    constructor(args) {
        super();

        let {
            ObjectType = objectTypes.VAR,
            ObjFlags = 0,
            ParameterName,
            DataType,
            LowLimit,
            HighLimit,
            AccessType,
            DefaultValue,
            PDOMapping,
            SubNumber,
            CompactSubObj,
        } = args;

        if(!ParameterName)
            throw TypeError("ParameterName is mandatory for all objects.");

        switch(parseInt(ObjectType)) {
            case objectTypes.DEFTYPE:
            case objectTypes.VAR:
                /* Mandatory args. */
                if(DataType === undefined) {
                    throw TypeError(
                        `DataType is mandatory for type ${ObjectType}.`);
                }
                if(AccessType === undefined) {
                    throw TypeError(
                        `AccessType is mandatory for type ${ObjectType}.`);
                }

                /* Not supported args. */
                if(SubNumber !== undefined) {
                    throw TypeError(
                        `SubNumber is not supported for type ${ObjectType}.`);
                }
                if(CompactSubObj !== undefined) {
                    throw TypeError(
                        `CompactSubObj is not supported for type ${ObjectType}.`);
                }

                /* Optional args. */
                if(DefaultValue === undefined)
                    DefaultValue = null;

                if(LowLimit === undefined)
                    LowLimit = null;

                if(HighLimit === undefined)
                    HighLimit = null;

                if(PDOMapping === undefined)
                    PDOMapping = false;

                break;
            case objectTypes.DEFSTRUCT:
            case objectTypes.ARRAY:
            case objectTypes.RECORD:
                if(CompactSubObj) {
                    /* Mandatory args. */
                    if(DataType === undefined) {
                        throw TypeError(
                            `DataType is mandatory for compact type ${ObjectType}.`);
                    }
                    if(AccessType === undefined) {
                        throw TypeError(
                            `AccessType is mandatory for compact type ${ObjectType}.`);
                    }

                    /* Not supported args (Optionally may be zero). */
                    if(SubNumber) {
                        throw TypeError(
                            `SubNumber must be zero for compact type ${ObjectType}.`);
                    }

                    /* Optional args. */
                    if(DefaultValue === undefined)
                        DefaultValue = null;

                    if(LowLimit === undefined)
                        LowLimit = null;

                    if(HighLimit === undefined)
                        HighLimit = null;

                    if(PDOMapping === undefined)
                        PDOMapping = false;
                }
                else {
                    /* Mandatory args. */
                    if(SubNumber === undefined) {
                        throw TypeError(
                            `SubNumber is mandatory for type ${ObjectType}.`);
                    }

                    /* Not supported args. */
                    if(DataType !== undefined) {
                        throw TypeError(
                            `DataType is not supported for type ${ObjectType}.`);
                    }
                    if(AccessType !== undefined) {
                        throw TypeError(
                            `AccessType is not supported for type ${ObjectType}.`);
                    }
                    if(DefaultValue !== undefined) {
                        throw TypeError(
                            `DefaultValue is not supported for type ${ObjectType}.`);
                    }
                    if(PDOMapping !== undefined) {
                        throw TypeError(
                            `PDOMapping is not supported for type ${ObjectType}.`);
                    }
                    if(LowLimit !== undefined) {
                        throw TypeError(
                            `LowLimit is not supported for type ${ObjectType}.`);
                    }
                    if(HighLimit !== undefined) {
                        throw TypeError(
                            `HighLimit is not supported for type ${ObjectType}.`);
                    }

                    /* Create sub-objects array. */
                    this._subObjects = new Array(SubNumber + 1);
                    Object.defineProperty(this, '_subObjects', {
                        enumerable: false
                    });

                    /* Store array size at index 0. */
                    this._subObjects[0] = new DataObject({
                        ParameterName:      'Max sub-index',
                        ObjectType:         objectTypes.VAR,
                        DataType:           dataTypes.UNSIGNED8,
                        AccessType:         accessTypes.READ_ONLY,
                        DefaultValue:       SubNumber,
                    });

                    /* Allow access to sub-objects using bracket notation */
                    for(let i = 0; i < SubNumber+1; i++) {
                        Object.defineProperty(this, i, {
                            get: () => { return this._subObjects[i] },
                            set: (args) => { this._setSubObject(i, args) },
                        });
                    }
                }
                break;
            case objectTypes.DOMAIN:
                /* Not supported args. */
                if(PDOMapping !== undefined) {
                    throw TypeError(
                        `PDOMapping is not supported for type ${ObjectType}.`);
                }
                if(LowLimit !== undefined) {
                    throw TypeError(
                        `LowLimit is not supported for type ${ObjectType}.`);
                }
                if(HighLimit !== undefined) {
                    throw TypeError(
                        `HighLimit is not supported for type ${ObjectType}.`);
                }
                if(SubNumber !== undefined) {
                    throw TypeError(
                        `SubNumber is not supported for type ${ObjectType}.`);
                }
                if(CompactSubObj !== undefined) {
                    throw TypeError(
                        `CompactSubObj is not supported for type ${ObjectType}.`);
                }

                /* Optional args. */
                if(DataType === undefined)
                    DataType = dataTypes.DOMAIN;

                if(AccessType === undefined)
                    AccessType = accessTypes.READ_WRITE;

                if(DefaultValue === undefined)
                    DefaultValue = null;

                break;
            default:
                throw TypeError(`ObjectType not supported (${ObjectType}).`);
        };

        /* Create raw data buffer. */
        if(DefaultValue !== undefined) {
            this._raw = DataObject.typeToRaw(DefaultValue, DataType);
            Object.defineProperty(this, '_raw', {
                enumerable: false,
            });
        }

        /* Store args. */
        Object.assign(this, args);
    }

    get parameterName() {
        return this.ParameterName;
    }

    get objectType() {
        return parseInt(this.ObjectType);
    }

    get dataType() {
        return parseInt(this.DataType);
    }

    get accessType() {
        return this.AccessType;
    }

    get defaultValue() {
        return this.DefaultValue;
    }

    get subNumber() {
        return parseInt(this.SubNumber);
    }

    get lowLimit() {
        return this.LowLimit;
    }

    get highLimit() {
        return this.HighLimit;
    }

    get objFlags() {
        return parseInt(this.ObjFlags);
    }

    get compactSubObj() {
        return parseInt(this.CompactSubObj);
    }

    get size() {
        let size = 0;
        if(this.subNumber > 0) {
            for(let i = 1; i < this.subNumber + 1; ++i)
                size += this._subObjects[i].size;
        }
        else {
            size = this._raw.length;
        }

        return size;
    }

    get raw() {
        return this._raw;
    }

    get value() {
        return DataObject.rawToType(this._raw, this.dataType);
    }

    set value(value) {
        if(!this.accessType.includes('w'))
            throw TypeError(`Object is not writable (${this.accessType}).`);

        if(value != this.value) {
            this._raw = DataObject.typeToRaw(value, this.dataType);
            this.emit("update", this);
        }
    }

    _setSubObject(subIndex, args) {
        if(subIndex > this.subNumber)
            throw TypeError(`'subIndex' must be less than ${this.subNumber+1}`);

        this._subObjects[subIndex] = new DataObject(args);
    }

    /** Convert a Buffer object to a value based on type.
     * @param {Buffer} raw - data to convert.
     * @param {dataTypes} dataType - type of the data.
     * @return {number | string}
     */
    static rawToType(raw, dataType) {
        switch(dataType) {
            case dataTypes.BOOLEAN:
                return !!raw.readUInt8();
            case dataTypes.INTEGER8:
                return raw.readInt8();
            case dataTypes.INTEGER16:
                return raw.readInt16LE();
            case dataTypes.INTEGER32:
                return raw.readInt32LE();
            case dataTypes.UNSIGNED8:
                return raw.readUInt8();
            case dataTypes.UNSIGNED16:
                return raw.readUInt16LE();
            case dataTypes.UNSIGNED32:
                return raw.readUInt32LE();
            case dataTypes.REAL32:
                return raw.readFloatLE();
            case dataTypes.REAL64:
                return raw.readDoubleLE();
            case dataTypes.VISIBLE_STRING:
            case dataTypes.OCTET_STRING:
            case dataTypes.UNICODE_STRING:
                return raw.toString();
            case dataTypes.TIME_OF_DAY:
            case dataTypes.TIME_DIFFERENCE:
                const ms = raw.readUInt32LE();
                const days = raw.readUInt16LE(4);
                return new Date(days*8.64e7 + ms);
            default:
                return raw;
        }
    }

    /** Convert a value to a Buffer object based on type.
     * @param {number | string | Date} value - data to convert.
     * @param {number} dataType - type of the data.
     * @return {Buffer}
     */
    static typeToRaw(value, dataType) {
        if(value === null)
            value = 0;

        let raw;
        switch(parseInt(dataType)) {
            case dataTypes.BOOLEAN:
                raw = Buffer.from(value ? [1] : [0] );
                break;
            case dataTypes.INTEGER8:
            case dataTypes.UNSIGNED8:
                raw = Buffer.from([value & 0xFF]);
                break;
            case dataTypes.INTEGER16:
            case dataTypes.UNSIGNED16:
                raw = Buffer.from([
                    (value >>> 0) & 0xFF,
                    (value >>> 8) & 0xFF,
                ]);
                break;
            case dataTypes.INTEGER24:
            case dataTypes.UNSIGNED24:
                raw = Buffer.alloc(3);
                for(let i = 0; i < 3; i++)
                    raw[i] = ((value >>> i*8) & 0xFF);
                break;
            case dataTypes.INTEGER32:
            case dataTypes.UNSIGNED32:
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
                raw = (value) ? Buffer.from(value) : Buffer.alloc(0);
                break;
            case dataTypes.TIME_OF_DAY:
            case dataTypes.TIME_DIFFERENCE:
                raw = Buffer.alloc(6);
                if(util.types.isDate(value)) {
                    const midnight = new Date(
                        value.getFullYear(), value.getMonth(), value.getDate());

                    /* Milliseconds since midnight. */
                    const ms = value.getTime() - midnight.getTime();

                    /* Days since epoch. */
                    const days = Math.floor(value/8.64e7);

                    raw.writeUInt32LE(ms);
                    raw.writeUInt16LE(days, 4);
                }
                break;
        }

        return raw;
    }
};

/** A CANopen Electronic Data Sheet.
 *
 * This class provides methods for loading and saving CANopen EDS v4.0 files.
 *
 * @see CiA306 "Electronic data sheet specification for CANopen"
 */
class EDS {
    constructor() {
        this.fileInfo = {};
        this.deviceInfo = {};
        this.dummyUsage = {};
        this.dataObjects = {};
        this.comments = [];

        /* Add default data types. */
        for(const [name, index] of Object.entries(dataTypes)) {
            this.dataObjects[index] = new DataObject({
                ParameterName:  name,
                ObjectType:     objectTypes.DEFTYPE,
                DataType:       dataTypes[name],
                AccessType:     accessTypes.READ_WRITE,
            });
        }

        /* Add mandatory objects. */
        this.dataObjects[0x1000] = new DataObject({
            ParameterName:      'Device type',
            ObjectType:         objectTypes.VAR,
            DataType:           dataTypes.UNSIGNED32,
            AccessType:         accessTypes.READ_ONLY,
        });

        this.dataObjects[0x1001] = new DataObject({
            ParameterName:      'Error register',
            ObjectType:         objectTypes.VAR,
            DataType:           dataTypes.UNSIGNED8,
            AccessType:         accessTypes.READ_ONLY,
        });

        this.dataObjects[0x1018] = new DataObject({
            ParameterName:      'Identity object',
            ObjectType:         objectTypes.RECORD,
            SubNumber:          1,
        });

        this.dataObjects[0x1018][1] = new DataObject({
            ParameterName:      'Vendor-ID',
            ObjectType:         objectTypes.VAR,
            DataType:           dataTypes.UNSIGNED32,
            AccessType:         accessTypes.READ_ONLY,
        });
    }

    /** Read and parse an EDS file.
     * @param {string} path - path to file.
     */
    load(path) {
        /* Parse EDS file. */
        const file = ini.parse(fs.readFileSync(path, 'utf-8'));

        /* Extract header fields. */
        this.fileInfo = file['FileInfo'];
        this.deviceInfo = file['DeviceInfo'];
        this.dummyUsage = file['DummyUsage'];
        this.comments = file['Comments'];

        /* Construct data objects. */
        const entries = Object.entries(file);
        const indexMatch = RegExp('^[0-9A-Fa-f]{4}$');
        const subIndexMatch = RegExp('^([0-9A-Fa-f]{4})sub([0-9A-Fa-f]+)$');

        entries
            .filter(([key, ]) => { return indexMatch.test(key); })
            .forEach(([key, value]) => {
                const index = parseInt(key, 16);
                this.dataObjects[index] = new DataObject(value);
            });

        entries
            .filter(([key, ]) => { return subIndexMatch.test(key); })
            .forEach(([key, value]) => {
                let [index, subIndex] = key.split('sub');
                index = parseInt(index, 16);
                subIndex = parseInt(subIndex, 16);

                this.dataObjects[index][subIndex] = new DataObject(value);
            });
    }

    /** Write an EDS file.
     * @param {string} path - path to file.
     */
    save(path) {
        const fd = fs.openSync(path, 'w');

        this._write(fd, ini.encode(this.fileInfo, { section: 'FileInfo' }));
        this._write(fd, ini.encode(this.deviceInfo, { section: 'DeviceInfo' }));
        this._write(fd, ini.encode(this.dummyUsage, { section: 'DummyUsage' }));
        this._write(fd, ini.encode(this.comments, { section: 'Comments' }));

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

    static get objectTypes() {
        return objectTypes;
    }

    static get accessTypes() {
        return accessTypes;
    }

    static get dataTypes() {
        return dataTypes;
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

    get LSS_Supported() {
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

    set EDSVersion(value) {
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

    set LSS_Supported(value) {
        this.deviceInfo['LSS_Supported'] = value;
    }

    /** Parse EDS date and time.
     * @private
     * @param {string} time - time string (hh:mm[AM|PM]).
     * @param {string} date - date string (mm-dd-yyyy).
     * @return {Date}
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

    /** Helper method to write strings to an EDS file.
     * @private
     * @param {number} fd - file descriptor to write.
     * @param {string} data - string to write.
     */
    _write(fd, data) {
        const nullMatch = new RegExp('=null', 'g');
        fs.writeSync(fd, data.replace(nullMatch, '=') + EOL);
    }

    /** Helper method to write objects to an EDS file.
     * @private
     * @param {number} fd - file descriptor to write.
     * @param {Object} objects - objects to write.
     */
    _writeObjects(fd, objects) {

        for(const [key, value] of Object.entries(objects)) {
            if(key == 'SupportedObjects')
                continue;

            const index = parseInt(value);

            /* Separate enumerable properties (skip sub-indices) */
            let dataObject = {};
            Object.assign(dataObject, this.dataObjects[index]);

            /* Write top level object. */
            const section = index.toString(16);
            this._write(fd, ini.encode(dataObject, { section: section }));

            /* Write sub-objects. */
            for(let i = 0; i < dataObject.SubNumber; i++) {
                if(this.dataObjects[index][i]) {
                    const sub = section + 'sub' + i;
                    this._write(fd, ini.encode(
                        this.dataObjects[index][i], { section: sub }));
                }
            }
        }
    }
};

module.exports=exports={
    objectTypes:    objectTypes,
    accessTypes:    accessTypes,
    dataTypes:      dataTypes,
    DataObject:     DataObject,
    EDS:            EDS,
}
