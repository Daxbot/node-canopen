/** CANopen Emergency protocol handler. */
class Emergency {
    /** Parse a CANopen Emergency message.
     * @private
     * @param {Object} message - CAN frame to parse.
     * @return {Array.<string, number, number, number, number>} 
     */
    static _process(message) {
        console.log(message);
        const code = message.data.readUInt16LE(0);
        const reg = message.data[2];
        const bit = message.data[3];
        const info = message.data.slice(4);
        const parsed = Emergency._parseCode(code) + ': ' + Emergency._parseBit(bit);
        return [parsed, code, reg, bit, info];
    }

    /** Parse a standard error code.
     * @private
     * @param {number} code - CANopen error code to parse.
     * @return {string}
     */
    static _parseCode(code) {
        switch(code) {
            case 0x8110:
                return 'CAN Overrun';
            case 0x8120:
                return 'CAN Error Passive';
            case 0x8130:
                return 'Heartbeat';
            case 0x8140:
                return 'Bus Off Recovery';
            case 0x8150:
                return 'CAN-ID Collision';
            case 0x8210:
                return 'PDO Not Processed';
            case 0x8220:
                return 'PDO Length Error';
            case 0x8230:
                return 'DAM MPDO Not Processed';
            case 0x8240:
                return 'Unexpected SYNC Length';
            case 0x8250:
                return 'RPDO Timeout';
            default:
                switch(code >> 8) {
                    case 0x00:
                        return 'Error Reset';
                    case 0x10:
                        return 'Generic Error';
                    case 0x20:
                        return 'Current';
                    case 0x21:
                        return 'Current Device Input';
                    case 0x22:
                        return 'Current Inside Device';
                    case 0x23:
                        return 'Current Device Output';
                    case 0x30:
                        return 'Voltage';
                    case 0x31:
                        return 'Mains Voltage';
                    case 0x32:
                        return 'Voltage Inside Device';
                    case 0x33:
                        return 'Output Voltage';
                    case 0x40:
                        return 'Temperature';
                    case 0x41:
                        return 'Ambient Temperature';
                    case 0x42:
                        return 'Device Temperature';
                    case 0x50:
                        return 'Device Hardware';
                    case 0x60:
                        return 'Device Software';
                    case 0x61:
                        return 'Internal Software';
                    case 0x62:
                        return 'User Software';
                    case 0x63:
                        return 'Data Set';
                    case 0x70:
                        return 'Additional Modules';
                    case 0x80:
                        return 'Monitoring';
                    case 0x81:
                        return 'Communication';
                    case 0x82:
                        return 'Protocol Error';
                    case 0x90:
                        return 'External Error';
                    case 0xF0:
                        return 'Additional Functions';
                    case 0xFF:
                        return 'Device Specific';
                    default:
                        return 'Invalid Code';
                }
        }
    }

    /** Parse a standard error register.
     * @private
     * @param {number} bit - CANopen error bit to parse.
     * @return {string}
     */
    static _parseBit(bit) {
        if(bit > 0x2F)
            return 'Manufacturer';

        switch(bit) {
            case 0x00:
                return 'No Error';
            case 0x01:
                return 'Bus Warning';
            case 0x02:
                return 'RXMSG Bad Length';
            case 0x03:
                return 'RXMSG Overflow';
            case 0x04:
                return 'RPDO Bad Length';
            case 0x05:
                return 'RPDO Overflow';
            case 0x06:
                return 'RX Bus Passive';
            case 0x07:
                return 'TX Bus Passive';
            case 0x08:
                return 'NMT Bad Command';
            case 0x12:
                return 'TX Bus Off';
            case 0x13:
                return 'RXB Overflow';
            case 0x14:
                return 'TXB Overflow';
            case 0x15:
                return 'TPDO Outside Sync';
            case 0x18:
                return 'Sync Timeout';
            case 0x19:
                return 'Sync Bad Length';
            case 0x1A:
                return 'PDO Bad Mapping';
            case 0x1B:
                return 'Heartbeat Timeout';
            case 0x1C:
                return 'Remote Reset';
            case 0x20:
                return 'EMCY Buffer Full';
            case 0x22:
                return 'Microcontroller Reset';
            case 0x28:
                return 'Wrong Error Report';
            case 0x29:
                return 'Timer Overflow';
            case 0x2A:
                return 'Memory Allocation Error';
            case 0x2B:
                return 'Generic Error';
            case 0x2C:
                return 'Software Error';
            case 0x2D:
                return 'Object Dictionary Error';
            case 0x2E:
                return 'Device Parameter Error';
            case 0x2F:
                return 'Non-Volatile Memory Access Error';
            default:
                return 'Unknown';
        }
    }
}

module.exports=exports=Emergency;
