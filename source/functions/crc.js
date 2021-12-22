const { crc } = require('node-crc');

/**
 * Calculates a CRC16 on a block of data.
 *
 * @param {Buffer} data - data block.
 * @returns {number} crc value.
 */
function calculateCrc(data) {
    const result = crc(16, false, 0x1021, 0, 0, 0, 0, 0, data);
    return result.readUInt16BE();
}

module.exports=exports=calculateCrc;
