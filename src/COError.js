/** CANopen abort codes.
  * @const {string}
  * @see CiA301 'Protocol SDO abort transfer' (§7.2.4.3.17)
  */
 const abortCodes = {
    0x05030000: 'Toggle bit not altered',
    0x05040000: 'SDO protocol timed out',
    0x05040001: 'Command specifier not valid or unknown',
    0x05040002: 'Invalid block size in block mode',
    0x05040003: 'Invalid sequence number in block mode',
    0x05040004: 'CRC error (block mode only)',
    0x05040005: 'Out of memory',
    0x06010000: 'Unsupported access to an object',
    0x06010001: 'Attempt to read a write only object',
    0x06010002: 'Attempt to write a read only object',
    0x06020000: 'Object does not exist',
    0x06040041: 'Object cannot be mapped to the PDO',
    0x06040042: 'Number and length of object to be mapped exceeds PDO length',
    0x06040043: 'General parameter incompatibility reasons',
    0x06040047: 'General internal incompatibility in device',
    0x06060000: 'Access failed due to hardware error',
    0x06070010: 'Data type does not match: length of service parameter does not match',
    0x06070012: 'Data type does not match: length of service parameter too high',
    0x06070013: 'Data type does not match: length of service parameter too short',
    0x06090011: 'Sub index does not exist',
    0x06090030: 'Invalid value for parameter (download only).',
    0x06090031: 'Value range of parameter written too high',
    0x06090032: 'Value range of parameter written too low',
    0x06090036: 'Maximum value is less than minimum value.',
    0x060A0023: 'Resource not available: SDO connection',
    0x08000000: 'General error',
    0x08000020: 'Data cannot be transferred or stored to application',
    0x08000021: 'Data cannot be transferred or stored to application because of local control',
    0x08000022: 'Data cannot be transferred or stored to application because of present device state',
    0x08000023: 'Object dictionary not present or dynamic generation failed',
    0x08000024: 'No data available',
};

/** CANopen error.
 * @param {number} code - error code.
 * @param {number} index - object index.
 * @param {number} subIndex - object subIndex.
 */
class COError extends Error {
    constructor(code, index, subIndex=null) {
        let message = abortCodes[code];
        if(message === undefined)
            message = "Unknown error"

        let tag = `0x${index.toString(16)}`;
        if(subIndex !== null)
            tag += `.${subIndex.toString()}`;

        super(`${message} [${tag}]`);

        this.code = code;
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports=exports=COError;