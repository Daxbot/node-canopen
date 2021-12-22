const { DataType } = require('../types');

/** Time offset in milliseconds between January 1, 1970 and January 1, 1984. */
const EPOCH_OFFSET = 441763200 * 1000;

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

module.exports=exports=rawToType;
