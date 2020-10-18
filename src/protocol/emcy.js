const { ObjectType, AccessType, DataType } = require('../eds');

/**
 * CANopen emergency error code classes.
 * @enum {number}
 * @see CiA301 "Emergency object (EMCY)" (§7.2.7)
 */
const EmcyClass = {
    ERROR_RESET: 0x0000,
    GENERIC_ERROR: 0x1000,
    CURRENT_GENERAL: 0x2000,
    CURRENT_INPUT: 0x2100,
    CURRENT_INTERNAL: 0x2200,
    CURRENT_OUTPUT: 0x2300,
    VOLTAGE_GENERAL: 0x3000,
    VOLTAGE_MAINS: 0x3100,
    VOLTAGE_INTERNAL: 0x3200,
    VOLTAGE_OUTPUT: 0x3300,
    TEMPERATURE_GENERAL: 0x4000,
    TEMPERATURE_AMBIENT: 0x4100,
    TEMPERATURE_DEVICE: 0x4200,
    HARDWARE: 0x5000,
    SOFTWARE_GENERAL: 0x6000,
    SOFTWARE_INTERNAL: 0x6100,
    SOFTWARE_USER: 0x6200,
    SOFTWARE_DATA: 0x6300,
    MODULES: 0x7000,
    MONITORING: 0x8000,
    COMMUNICATION: 0x8100,
    PROTOCOL: 0x8200,
    EXTERNAL: 0x9000,
    ADDITIONAL_FUNCTIONS: 0xf000,
    DEVICE_SPECIFIC: 0xff00,
}

/**
 * CANopen emergency error codes.
 * @enum {number}
 * @see CiA301 "Emergency object (EMCY)" (§7.2.7)
 */
const EmcyCode = {
    CAN_OVERRUN: EmcyClass.COMMUNICATION | 0x10,
    BUS_PASSIVE: EmcyClass.COMMUNICATION | 0x20,
    HEARTBEAT: EmcyClass.COMMUNICATION | 0x30,
    BUS_OFF_RECOVERED: EmcyClass.COMMUNICATION | 0x40,
    CAN_ID_COLLISION: EmcyClass.COMMUNICATION | 0x50,
    PDO_LENGTH: EmcyClass.PROTOCOL | 0x10,
    PDO_LENGTH_EXCEEDED: EmcyClass.PROTOCOL | 0x20,
    DAM_MPDO: EmcyClass.PROTOCOL | 0x30,
    SYNC_LENGTH: EmcyClass.PROTOCOL | 0x40,
    RPDO_TIMEOUT: EmcyClass.PROTOCOL | 0x50,
    TIME_LENGTH: EmcyClass.PROTOCOL | 0x60,
}

/**
 * Structure for storing and parsing CANopen emergency objects.
 * @param {number} code - error code.
 * @param {number} register - error register.
 * @param {Buffer} info - error info.
 * @private
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
        // Check codes
        switch(this.code) {
            case EmcyCode.CAN_OVERRUN:
                return 'CAN overrun';
            case EmcyCode.BUS_PASSIVE:
                return 'CAN in error passive mode';
            case EmcyCode.HEARTBEAT:
                return 'Life guard or heartbeat error';
            case EmcyCode.BUS_OFF_RECOVERED:
                return 'Recovered from bus off';
            case EmcyCode.CAN_ID_COLLISION:
                return 'CAN-ID collision';
            case EmcyCode.PDO_LENGTH:
                return 'PDO not processed due to length error';
            case EmcyCode.PDO_LENGTH_EXCEEDED:
                return 'PDO length exceeded';
            case EmcyCode.DAM_MPDO:
                return 'DAM MPDO not processed, destination object not available';
            case EmcyCode.SYNC_LENGTH:
                return 'Unexpected SYNC data length';
            case EmcyCode.RPDO_TIMEOUT:
                return 'RPDO timeout';
            case EmcyCode.TIME_LENGTH:
                return 'Unexpected TIME data length';
        }

        // Check class
        switch(this.code & 0xff00) {
            case EmcyClass.ERROR_RESET:
                return 'Error reset';
            case EmcyClass.GENERIC_ERROR:
                return 'Generic error';
            case EmcyClass.CURRENT_GENERAL:
                return 'Current error';
            case EmcyClass.CURRENT_INPUT:
                return 'Current, CANopen device input side';
            case EmcyClass.CURRENT_INTERNAL:
                return 'Current inside the CANopen device';
            case EmcyClass.CURRENT_OUTPUT:
                return 'Current, CANopen device output side';
            case EmcyClass.VOLTAGE_GENERAL:
                return 'Voltage error';
            case EmcyClass.VOLTAGE_MAINS:
                return 'Voltage mains';
            case EmcyClass.VOLTAGE_INTERNAL:
                return 'Voltage inside the CANopen device';
            case EmcyClass.VOLTAGE_OUTPUT:
                return 'Voltage output';
            case EmcyClass.TEMPERATURE_GENERAL:
                return 'Temperature error';
            case EmcyClass.TEMPERATURE_AMBIENT:
                return 'Ambient temperature';
            case EmcyClass.HARDWARE:
                return 'CANopen device hardware';
            case EmcyClass.SOFTWARE_GENERAL:
                return 'CANopen device software';
            case EmcyClass.SOFTWARE_INTERNAL:
                return 'Internal software';
            case EmcyClass.SOFTWARE_USER:
                return 'User software';
            case EmcyClass.SOFTWARE_DATA:
                return 'Data set';
            case EmcyClass.MODULES:
                return 'Additional modules';
            case EmcyClass.MONITORING:
                return 'Monitoring error';
            case EmcyClass.COMMUNICATION:
                return 'Communication error';
            case EmcyClass.PROTOCOL:
                return 'Protocol error';
            case EmcyClass.EXTERNAL:
                return 'External error';
            case EmcyClass.ADDITIONAL_FUNCTIONS:
                return 'Additional functions';
            case EmcyClass.DEVICE_SPECIFIC:
                return 'CANopen device specific';
        }
    }

    toBuffer() {
        let data = Buffer.alloc(8);
        data.writeUInt16LE(this.code);
        data.writeUInt8(this.register, 2);
        this.info.copy(data, 3);

        return data;
    }
}

/**
 * CANopen EMCY protocol handler.
 *
 * The emergency (EMCY) protocol follows a producer-consumer structure where
 * emergency objects are used to indicate CANopen device errors. An emergency
 * object should be transmitted only once per error event.
 *
 * This class implements the EMCY write service for producing emergency objects.
 *
 * @param {Device} device - parent device.
 * @see CiA301 "Emergency object" (§7.2.7)
 * @memberof Device
 */
class Emcy {
    constructor(device) {
        this.device = device;
        this.pending = Promise.resolve();
        this._valid = false;
        this._cobId = null;
        this._inhibitTime = 0;
    }

    /**
     * Set the emcy valid bit.
     * @param {boolean} valid - valid flag.
     */
    set valid(valid) {
        let obj1014 = this.device.eds.getEntry(0x1014);
        if(obj1014 === undefined) {
            obj1014 = this.device.eds.addEntry(0x1014, {
                'ParameterName':    'COB-ID SYNC',
                'ObjectType':       ObjectType.VAR,
                'DataType':         DataType.UNSIGNED32,
                'AccessType':       AccessType.READ_WRITE,
            });
        }

        if(valid)
            obj1014.value |= (1 << 31);
        else
            obj1014.value &= ~(1 << 31);
    }

    /**
     * Get the emcy valid bit.
     * @return {boolean} valid flag.
     */
    get valid() {
        return this._valid;
    }

    /**
     * Set the COB-ID.
     * @param {number} cobId - COB-ID.
     */
    set cobId(cobId) {
        let obj1014 = this.device.eds.getEntry(0x1014);
        if(obj1014 === undefined) {
            obj1014 = this.device.eds.addEntry(0x1014, {
                'ParameterName':    'COB-ID EMCY',
                'ObjectType':       ObjectType.VAR,
                'DataType':         DataType.UNSIGNED32,
                'AccessType':       AccessType.READ_WRITE,
            });
        }

        cobId &= 0x7FF;
        obj1014.value = (obj1014.value & ~(0x7FF)) | cobId;
    }

    /**
     * Get the COB-ID.
     * @return {number} - COB-ID.
     */
    get cobId() {
        return this._cobId;
    }

    /**
     * Set the inhibit time.
     * @param {number} time - inhibit time (100 μs).
     */
    set inhibitTime(time) {
        let obj1015 = this.device.eds.getEntry(0x1015);
        if(obj1015 === undefined) {
            obj1015 = this.device.eds.addEntry(0x1015, {
                'ParameterName':    'Inhibit time EMCY',
                'ObjectType':       ObjectType.VAR,
                'DataType':         DataType.UNSIGNED16,
                'AccessType':       AccessType.READ_WRITE,
            });
        }

        time &= 0xFFFF;
        obj1015.value = time
    }

    /**
     * Get the inhibit time.
     * @return {number} - inhibit time (100 μs).
     */
    get inhibitTime() {
        return this._inhibitTime;
    }

    /** Initialize members and begin emergency monitoring. */
    init() {
        /* Object 0x1001 - Error register. */
        const obj1001 = this.device.eds.getEntry(0x1001);
        if(!obj1001)
            throw ReferenceError("0x1001 is required for EMCY protocol.");

        /* Object 0x1014 - COB-ID EMCY. */
        const obj1014 = this.device.eds.getEntry(0x1014);
        if(obj1014) {
            this._parse1014(obj1014);
            obj1014.addListener('update', this._parse1014.bind(this));
        }

        /* Object 0x1015 - Inhibit time EMCY. */
        const obj1015 = this.device.eds.getEntry(0x1015);
        if(obj1015) {
            this._parse1015(obj1015);
            obj1015.addListener('update', this._parse1015.bind(this));
        }

        this.device.addListener('message', this._onMessage.bind(this));
    }

    /**
     * Service: EMCY write.
     * @param {number} code - error code.
     * @param {Buffer} info - error info.
     * @return {Promise}
    */
    write(code, info=null) {
        if(!this.valid)
            throw TypeError('EMCY is disabled');

        this.pending = this.pending.then(() => {
            return new Promise((resolve) => {
                setTimeout(() => {
                    /* Create emergency object. */
                    const register = this.device.getValue(0x1001);
                    const em = new EmergencyMessage(code, register, info);

                    let cobId = this.cobId;
                    if((cobId & 0xF) == 0)
                        cobId |= this.device.id;

                    /* Send object. */
                    this.device.send({
                        id:     cobId,
                        data:   em.toBuffer(),
                    });

                    resolve();
                }, this._inhibitTime / 10);
            });
        });

        return this.pending;
    }

    /**
     * Called when a new CAN message is received.
     * @param {Object} message - CAN frame.
     * @private
     */
    _onMessage(message) {
        const mask = (this.cobId & 0xF) ? 0x7FF : 0x7F0;
        if((message.id & mask) != this.cobId)
            return;

        const deviceId = message.id & 0xF;
        if(deviceId == 0)
            return;

        const code = message.data.readUInt16LE(0);
        const reg = message.data.readUInt8(2);
        const em = new EmergencyMessage(code, reg, message.data.slice(3));

        if(deviceId == this.device.id) {
            /* Object 0x1001 - Error register. */
            const obj1001 = this.device.eds.getEntry(0x1001);
            obj1001.raw.writeUInt8(reg);

            /* Object 0x1003 - Pre-defined error field. */
            const obj1003 = this.device.eds.getEntry(0x1003);
            if(obj1003) {
                /* Shift out oldest value. */
                const errorCount = obj1003[0].value;
                for(let i = errorCount; i > 1; --i)
                    obj1003[i-1].raw.copy(obj1003[i].raw);

                /* Set new code at sub-index 1. */
                obj1003[1].raw.writeUInt16LE(code);

                /* Update error count. */
                if(errorCount < (obj1003.subNumber - 1))
                    obj1003.raw.writeUInt8(errorCount + 1);
            }
        }

        this.device.emit('emergency', deviceId, em);
    }

    /**
     * Called when 0x1014 (COB-ID EMCY) is updated.
     * @param {DataObject} data - updated DataObject.
     * @private
     */
    _parse1014(data) {
        /* Object 0x1014 - COB-ID EMCY.
         *   bit 0..10      11-bit CAN base frame.
         *   bit 11..28     29-bit CAN extended frame.
         *   bit 29         Frame type.
         *   bit 30         Reserved (0x00).
         *   bit 31         EMCY valid.
         */
        const value = data.value;
        const valid = (value >> 31) & 0x1
        const rtr = (value >> 29) & 0x1;
        const cobId = value & 0x7FF;

        if(rtr == 0x1)
            throw TypeError("CAN extended frames are not supported.")

        if(cobId == 0)
            throw TypeError('COB-ID EMCY can not be 0.');

        this._valid = !valid;
        this._cobId = cobId;
    }

    /**
     * Called when 0x1015 (Inhibit time EMCY) is updated.
     * @param {DataObject} data - updated DataObject.
     * @private
     */
    _parse1015(data) {
        this._inhibitTime = data.value;
    }
}

module.exports=exports={ EmcyClass, EmcyCode, Emcy };
