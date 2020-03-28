/** CANopen emergency error code types.
 * @private
 * @const {number}
 * @see CiA301 "Emergency object (EMCY)" (§7.2.7)
 */
const errorTypes = {
    0x00:   'Error reset',
    0x10:   'Generic',
    0x20:   'Current',
    0x21:   'Current, CANopen device input side',
    0x22:   'Current inside the CANopen device',
    0x23:   'Current, CANopen device output side',
    0x30:   'Voltage',
    0x31:   'Mains voltage',
    0x32:   'Voltage inside the CANopen device',
    0x33:   'Output voltage',
    0x40:   'Temperature',
    0x41:   'Ambient temperature',
    0x50:   'CANopen device hardware',
    0x60:   'CANopen device software',
    0x61:   'Internal software',
    0x62:   'User software',
    0x63:   'Data set',
    0x70:   'Additional modules',
    0x80:   'Monitoring',
    0x81:   'Communication',
    0x82:   'Protocol error',
    0x90:   'External error',
    0xF0:   'Additional functions',
    0xFF:   'CANopen device specific',
};

/** CANopen emergency error codes.
 * @private
 * @const {number}
 * @see CiA301 "Emergency object (EMCY)" (§7.2.7)
 */
const errorCodes = {
    0x8110: 'CAN overrun',
    0x8120: 'CAN in error passive mode',
    0x8130: 'Life guard or heartbeat error',
    0x8140: 'Recovered from bus off',
    0x8150: 'CAN-ID collision',
    0x8210: 'PDO not processed due to length error',
    0x8220: 'PDO length exceeded',
    0x8230: 'DAM MPDO not processed, destination object not available',
    0x8240: 'Unexpected SYNC data length',
    0x8250: 'RPDO timeout',
};

/** Structure for storing and parsing CANopen emergency objects.
 * @param {number} code - error code.
 * @param {number} register - error register.
 * @param {Buffer} info - error info.
 */
class EmergencyMessage {
    constructor(code, register, info=null) {
        this.code = code;
        this.register = register;
        this.info = Buffer.alloc(5);

        if(info) {
            if(!Buffer.isBuffer(info) || info.length > 5)
                throw TypeError("info must be a Buffer of length 0-5");

            info.copy(this.info);
        }
    }

    toString() {
        if(this.code in errorCodes)
            return errorCodes[this.code];

        const type = this.code >>= 8;
        if(type in errorTypes)
            return errorTypes[type];

        return undefined;
    }

    toBuffer() {
        let data = Buffer.alloc(8);
        data.writeUInt16LE(this.code);
        data.writeUInt8(this.register, 2);
        this.info.copy(data, 3);

        return data;
    }
}

/** CANopen EMCY protocol handler.
 *
 * The emergency (EMCY) protocol follows a producer-consumer structure where
 * emergency objects are used to indicate CANopen device errors. An emergency
 * object should be transmitted only once per error event.
 *
 * This class implements the EMCY write service for producing emergency objects.
 *
 * @param {Device} device - parent device.
 * @see CiA301 "Emergency object" (§7.2.7)
 */
class EMCY {
    constructor(device) {
        this.device = device;
        this.cobId = null;
        this.pending = Promise.resolve();
    }

    /** Begin emergency monitoring. */
    init() {
        /* Object 0x1001 - Error register. */
        const obj1001 = this.device.EDS.getEntry(0x1001);
        if(!obj1001)
            throw ReferenceError("0x1001 is required for EMCY protocol.");

        /* Object 0x1014 - COB-ID EMCY.
         *   bit 0..10      11-bit CAN base frame.
         *   bit 11..28     29-bit CAN extended frame.
         *   bit 29         Frame type.
         *   bit 30         Reserved (0x00).
         *   bit 31         EMCY valid.
         */
        const obj1014 = this.device.EDS.getEntry(0x1014);
        if(obj1014) {
            const cobId = obj1014.value;
            if(((cobId >> 29) & 0x1) == 0x1)
                throw TypeError("CAN extended frames are not supported.")

            if(((cobId >> 31) & 0x1) == 0x0) {
                this.cobId = cobId & 0x7FF;
                if(cobId & 0xF == 0x0)
                    this.cobId |= this.device.id;

                this.device.channel.addListener(
                    "onMessage", this._onMessage, this);
            }
            obj1014.addListener('update', this._update1014);
        }
    }

    /** Service: EMCY write.
     * @param {number} code - error code.
     * @param {Buffer} info - error info.
     * @return {Promise}
    */
    write(code, info=null) {
        /* Object 0x1001 - Error register. */
        const obj1001 = this.device.EDS.getEntry(0x1001);
        if(!obj1001)
            throw ReferenceError("0x1001 is required for EMCY protocol.");

        const register = obj1001.value;

        /* Object 0x1014 - COB-ID EMCY. */
        const obj1014 = this.device.EDS.getEntry(0x1014);
        if(!obj1014)
            throw ReferenceError('0x1014 is required for EMCY protocol.');

        let cobId = obj1014.value;
        if(((cobId >> 29) & 0x1) == 0x1)
            throw TypeError("CAN extended frames are not supported.")

        if(((cobId >> 31) & 0x1) == 0x1)
            throw TypeError('EMCY production is disabled by 0x1014.');

        cobId &= 0x7ff;
        if(cobId == 0)
            throw TypeError('COB-ID EMCY can not be 0.');

        if(cobId & 0xF == 0x0)
            cobId |= this.device.id;

        /* Object 0x1015 - Inhibit time EMCY. */
        const obj1015 = this.device.EDS.getEntry(0x1015);
        const inhibitTime = (obj1015) ? obj1015.value / 10 : 0;

        this.pending = this.pending.then(() => {
            return new Promise((resolve) => {
                setTimeout(() => {
                    /* Create emergency object. */
                    const em = new EmergencyMessage(code, register, info);

                    /* Send object to channel. */
                    this.device.channel.send({
                        id:     cobId,
                        data:   em.toBuffer(),
                    });

                    resolve();
                }, inhibitTime);
            });
        });

        return this.pending;
    }

    /** socketcan 'onMessage' listener.
     * @private
     * @param {Object} message - CAN frame.
     */
    _onMessage(message) {
        if(message && (message.id & 0x7FF) == this.cobId) {
            const code = message.data.readUInt16LE(0);
            const reg = message.data.readUInt8(2);
            const em = new EmergencyMessage(code, reg, message.data.slice(5));

            /* Object 0x1001 - Error register. */
            const obj1001 = this.device.EDS.getEntry(0x1001);
            obj1001.raw.writeUInt8(reg);

            /* Object 0x1003 - Pre-defined error field.
             *   sub-index 0:
             *     bit 0..7     Number of errors.
             *
             *   sub-index 1+:
             *     bit 0..15    Error code.
             *     bit 16..31   Manufacturer info.
             */
            const obj1003 = this.device.EDS.getEntry(0x1003);
            if(obj1003) {
                /* Shift out oldest value. */
                for(let i = obj1003.subNumber; i > 1; --i)
                    obj1003[i-1].raw.copy(obj1003[i].raw);

                /* Set new code at sub-index 1. */
                obj1003[1].raw.writeUInt16LE(code);

                /* Update error count. */
                const errorCount = obj1003[0].value;
                if(errorCount < obj1003.subNumber)
                    obj1003.raw.writeUInt8(errorCount + 1);
            }

            this.device.emit('emergency', this.deviceId, em);
        }
    }

    /** Called when 0x1014 (COB-ID EMCY) is updated.
     * @private
     * @param {DataObject} data - updated DataObject.
     */
    _update1014(data) {
        const cobId = data.value;
        if(((cobId >> 29) & 0x1) == 0x1)
            throw TypeError("CAN extended frames are not supported.")

        if(((cobId >> 31) & 0x1) == 0x0) {
            this.cobId = cobId & 0x7FF;
            if(cobId | 0xF == 0x0)
                this.cobId |= this.device.deviceId;
        }
    }
}

module.exports=exports=EMCY;
