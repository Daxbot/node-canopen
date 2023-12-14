const { DataType } = require('../types');
const { dateToTime } = require('./date');

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
    if (end != -1)
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
    const raw = Buffer.alloc(6);
    const { days, ms } = dateToTime(value);
    raw.writeUInt16LE(days, 4);
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
    if (value === undefined || value === null)
        value = 0;

    if (typeof type === 'string')
        type = DataType[type];

    let raw;
    switch (type) {
        case DataType.BOOLEAN:
            raw = Buffer.from(value ? [1] : [0]);
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
            if (typeof value != 'bigint')
                value = BigInt(value);

            raw = Buffer.alloc(8);
            raw.writeBigInt64LE(value);
            break;
        case DataType.UNSIGNED56:
        case DataType.UNSIGNED64:
            if (typeof value != 'bigint')
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

module.exports = exports = typeToRaw;
