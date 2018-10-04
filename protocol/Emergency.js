function parseCode(code)
{
    switch(code)
    {
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
            switch(code >> 2)
            {
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
            }
    }
}

class Emergency
{
    constructor()
    {
        // TODO: Store active errors
    }

    _parse(message)
    {
        const code = message.data.readUInt16LE(0);
        const reg = message.data[2];
        const bit = message.data[3];
        const info = message.data.slice(4);
        const parsed = parseCode(code);
        return [parsed, code, reg, bit, info];
    }
};

module.exports=exports=Emergency;