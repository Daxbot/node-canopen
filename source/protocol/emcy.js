/**
 * @file Implements the CANopen Emergency (EMCY) protocol.
 * @author Wilkins White
 * @copyright 2021 Daxbot
 */

const Device = require('../device');
const { EdsError, DataObject } = require('../eds');
const { ObjectType, AccessType, DataType } = require('../types');

/**
 * CANopen emergency error code classes.
 *
 * @enum {number}
 * @see CiA301 "Emergency object (EMCY)" (§7.2.7)
 * @memberof EmcyMessage
 */
const EmcyType = {
    /** Error reset or no error. */
    ERROR_RESET: 0x0000,

    /** Generic error. */
    GENERIC_ERROR: 0x1000,

    /** Current error. */
    CURRENT_GENERAL: 0x2000,

    /** Current error, CANopen device input side. */
    CURRENT_INPUT: 0x2100,

    /** Current error inside the CANopen device. */
    CURRENT_INTERNAL: 0x2200,

    /** Current error, CANopen device output side. */
    CURRENT_OUTPUT: 0x2300,

    /** Voltage error. */
    VOLTAGE_GENERAL: 0x3000,

    /** Voltage error, mains. */
    VOLTAGE_MAINS: 0x3100,

    /** Voltage error inside the CANopen device. */
    VOLTAGE_INTERNAL: 0x3200,

    /** Voltage error, CANopen device output side. */
    VOLTAGE_OUTPUT: 0x3300,

    /** Temperature error. */
    TEMPERATURE_GENERAL: 0x4000,

    /** Temperature error, ambient. */
    TEMPERATURE_AMBIENT: 0x4100,

    /** Temperature error, CANopen device. */
    TEMPERATURE_DEVICE: 0x4200,

    /** CANopen device hardware error. */
    HARDWARE: 0x5000,

    /** CANopen device software error. */
    SOFTWARE_GENERAL: 0x6000,

    /** Internal software error. */
    SOFTWARE_INTERNAL: 0x6100,

    /** User software error. */
    SOFTWARE_USER: 0x6200,

    /** Data set error. */
    SOFTWARE_DATA: 0x6300,

    /** Additional modules error. */
    MODULES: 0x7000,

    /** Monitoring error. */
    MONITORING: 0x8000,

    /** Monitoring error, communication. */
    COMMUNICATION: 0x8100,

    /** Monitoring error, protocol. */
    PROTOCOL: 0x8200,

    /** External error. */
    EXTERNAL: 0x9000,

    /** Additional functions error. */
    ADDITIONAL_FUNCTIONS: 0xf000,

    /** CANopen device specific error. */
    DEVICE_SPECIFIC: 0xff00,
}

/**
 * CANopen emergency error codes.
 *
 * @enum {number}
 * @see CiA301 "Emergency object (EMCY)" (§7.2.7)
 * @memberof EmcyMessage
 */
const EmcyCode = {
    /** CAN overrun (objects lost). */
    CAN_OVERRUN: EmcyType.COMMUNICATION | 0x10,

    /** CAN in error passive mode. */
    BUS_PASSIVE: EmcyType.COMMUNICATION | 0x20,

    /** Life guard or heartbeat error. */
    HEARTBEAT: EmcyType.COMMUNICATION | 0x30,

    /** CAN recovered from bus off. */
    BUS_OFF_RECOVERED: EmcyType.COMMUNICATION | 0x40,

    /** CAN-ID collision. */
    CAN_ID_COLLISION: EmcyType.COMMUNICATION | 0x50,

    /** PDO not processed due to length error. */
    PDO_LENGTH: EmcyType.PROTOCOL | 0x10,

    /** PDO length exceeded. */
    PDO_LENGTH_EXCEEDED: EmcyType.PROTOCOL | 0x20,

    /** DAM MPDO not processed, destination object not available. */
    DAM_MPDO: EmcyType.PROTOCOL | 0x30,

    /** Unexpected SYNC data length. */
    SYNC_LENGTH: EmcyType.PROTOCOL | 0x40,

    /** RPDO timed out. */
    RPDO_TIMEOUT: EmcyType.PROTOCOL | 0x50,

    /** Unexpected TIME data length. */
    TIME_LENGTH: EmcyType.PROTOCOL | 0x60,
}

/**
 * Structure for storing and parsing CANopen emergency objects.
 *
 * @param {number} id - message id.
 * @param {EmcyCode} code - error code.
 * @param {number} register - error register.
 * @param {Buffer} info - error info.
 */
class EmcyMessage {
    constructor({ id, code, register, info }) {
        this.id = id;
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
            case EmcyType.ERROR_RESET:
                return 'Error reset';
            case EmcyType.GENERIC_ERROR:
                return 'Generic error';
            case EmcyType.CURRENT_GENERAL:
                return 'Current error';
            case EmcyType.CURRENT_INPUT:
                return 'Current, CANopen device input side';
            case EmcyType.CURRENT_INTERNAL:
                return 'Current inside the CANopen device';
            case EmcyType.CURRENT_OUTPUT:
                return 'Current, CANopen device output side';
            case EmcyType.VOLTAGE_GENERAL:
                return 'Voltage error';
            case EmcyType.VOLTAGE_MAINS:
                return 'Voltage mains';
            case EmcyType.VOLTAGE_INTERNAL:
                return 'Voltage inside the CANopen device';
            case EmcyType.VOLTAGE_OUTPUT:
                return 'Voltage output';
            case EmcyType.TEMPERATURE_GENERAL:
                return 'Temperature error';
            case EmcyType.TEMPERATURE_AMBIENT:
                return 'Ambient temperature';
            case EmcyType.HARDWARE:
                return 'CANopen device hardware';
            case EmcyType.SOFTWARE_GENERAL:
                return 'CANopen device software';
            case EmcyType.SOFTWARE_INTERNAL:
                return 'Internal software';
            case EmcyType.SOFTWARE_USER:
                return 'User software';
            case EmcyType.SOFTWARE_DATA:
                return 'Data set';
            case EmcyType.MODULES:
                return 'Additional modules';
            case EmcyType.MONITORING:
                return 'Monitoring error';
            case EmcyType.COMMUNICATION:
                return 'Communication error';
            case EmcyType.PROTOCOL:
                return 'Protocol error';
            case EmcyType.EXTERNAL:
                return 'External error';
            case EmcyType.ADDITIONAL_FUNCTIONS:
                return 'Additional functions';
            case EmcyType.DEVICE_SPECIFIC:
                return 'CANopen device specific';
        }

        return `Unknown error (0x${this.code.toString(16)})`;
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
 * @example
 * const can = require('socketcan');
 *
 * const channel = can.createRawChannel('can0');
 * const device = new Device({ id: 0xa });
 *
 * channel.addListener('onMessage', (message) => device.receive(message));
 * device.setTransmitFunction((message) => channel.send(message));
 *
 * device.init();
 * channel.start();
 *
 * device.emcy.cobId = 0x80;
 * device.emcy.write(0x1000);
 */
class Emcy {
    constructor(device) {
        this.device = device;
        this.pending = Promise.resolve();
        this.consumers = [];
        this._valid = false;
        this._cobId = null;
        this._inhibitTime = 0;
    }

    /**
     * Error register (Object 0x1001).
     *
     * @type {number}
     */
    get register() {
        return this.device.getValue(0x1001);
    }

    set register(value) {
        let obj1001 = this.device.eds.getEntry(0x1001);
        if(obj1001 === undefined) {
            obj1001 = this.device.eds.addEntry(0x1001, {
                parameterName:  'Error register',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED8,
                accessType:     AccessType.READ_ONLY,
            });
        }

        obj1001.value = value;
    }

    /**
     * Error history (Object 0x1003).
     *
     * @type {Array<number>}
     */
    get history() {
        const obj1003 = this.device.eds.getEntry(0x1003);
        if(obj1003 === undefined)
            return [];

        return obj1003.value;
    }

    /**
     * Emcy valid bit (Object 0x1014, bit 31).
     *
     * @type {boolean}
     */
    get valid() {
        return this._valid;
    }

    set valid(valid) {
        let obj1014 = this.device.eds.getEntry(0x1014);
        if(obj1014 === undefined) {
            obj1014 = this.device.eds.addEntry(0x1014, {
                parameterName:  'COB-ID EMCY',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
                accessType:     AccessType.READ_WRITE,
            });
        }

        if(valid)
            obj1014.value |= (1 << 31);
        else
            obj1014.value &= ~(1 << 31);
    }

    /**
     * Emcy COB-ID (Object 0x1014, bits 0-28).
     *
     * @type {number}
     */
    get cobId() {
        return this._cobId;
    }

    set cobId(cobId) {
        let obj1014 = this.device.eds.getEntry(0x1014);
        if(obj1014 === undefined) {
            obj1014 = this.device.eds.addEntry(0x1014, {
                parameterName:  'COB-ID EMCY',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
                accessType:     AccessType.READ_WRITE,
            });
        }

        cobId &= 0x7FF;
        obj1014.value = (obj1014.value & ~(0x7FF)) | cobId;
    }

    /**
     * Emcy inhibit time (Object 0x1015).
     *
     * @type {number}
     */
    get inhibitTime() {
        return this._inhibitTime;
    }

    set inhibitTime(time) {
        let obj1015 = this.device.eds.getEntry(0x1015);
        if(obj1015 === undefined) {
            obj1015 = this.device.eds.addEntry(0x1015, {
                parameterName:  'Inhibit time EMCY',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED16,
                accessType:     AccessType.READ_WRITE,
            });
        }

        time &= 0xFFFF;
        obj1015.value = time
    }

    /**
     * Configures the number of sub-entries for 0x1003 (Pre-defined error field).
     *
     * @param {number} length - how many historical error events should be kept.
     */
    setHistoryLength(length) {
        if(length === undefined || length < 0)
            throw ReferenceError('error field size must >= 0');

        let obj1003 = this.device.eds.getEntry(0x1003);
        if(obj1003 === undefined) {
            obj1003 = this.device.eds.addEntry(0x1003, {
                parameterName:  'Pre-defined error field',
                objectType:     ObjectType.ARRAY,
            });
        }

        while(length < obj1003.subNumber - 1) {
            // Remove extra entries
            this.device.eds.removeSubEntry(0x1003, obj1003.subNumber - 1);
        }

        while(length > obj1003.subNumber - 1) {
            // Add new entries
            const index = obj1003.subNumber;
            this.device.eds.addSubEntry(0x1003, index, {
                parameterName:  `Standard error field ${index}`,
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
                accessType:     AccessType.READ_WRITE,
            });
        }
    }

    /**
     * Get a particular entry from 0x1028 (Emergency consumer object).
     *
     * @param {number} cobId - COB-ID of the entry to get.
     * @returns {DataObject | null} the matching entry or null.
     */
    getConsumer(cobId) {
        const obj1028 = this.device.eds.getEntry(0x1028);
        if(obj1028 !== undefined) {
            for(let i = 1; i <= obj1028._subObjects[0].value; ++i) {
                const subObject = obj1028._subObjects[i];
                if(subObject === undefined)
                    continue;

                const value = subObject.value;
                if(value >> 31)
                    continue; // Invalid

                if((value & 0x7FF) === cobId)
                    return subObject;
            }
        }

        return null;
    }

    /**
     * Add an entry to 0x1028 (Emergency consumer object).
     *
     * @param {number} cobId - COB-ID to add.
     * @param {number} [subIndex] - sub-index to store the entry, optional.
     */
    addConsumer(cobId, subIndex) {
        if(cobId > 0x7FF)
            throw RangeError('CAN extended frames not supported');

        if(this.getConsumer(cobId) !== null) {
            cobId = '0x' + cobId.toString(16);
            throw new EdsError(`entry for device ${cobId} already exists`);
        }

        let obj1028 = this.device.eds.getEntry(0x1028);
        if(obj1028 === undefined) {
            obj1028 = this.device.eds.addEntry(0x1028, {
                parameterName:  'Emergency consumer object',
                objectType:     ObjectType.ARRAY,
            });
        }

        if(!subIndex) {
            // Find first empty index
            for(let i = 1; i <= 255; ++i) {
                if(obj1028[i] === undefined) {
                    subIndex = i;
                    break;
                }
            }
        }
        if(!subIndex)
            throw new EdsError('failed to find empty sub-index');

        // Install sub entry
        this.device.eds.addSubEntry(0x1028, subIndex, {
            parameterName:  `Emergency consumer ${subIndex}`,
            objectType:     ObjectType.VAR,
            dataType:       DataType.UNSIGNED32,
            accessType:     AccessType.READ_WRITE,
            defaultValue:   cobId,
        });

        this._parse1028(obj1028);
    }

    /**
     * Remove an entry from 0x1028 (Emergency consumer object).
     *
     * @param {number} cobId - COB-ID of the entry to remove.
     */
    removeConsumer(cobId) {
        const subEntry = this.getConsumer(cobId);
        if(subEntry === null)
            throw new EdsError(`entry for device ${cobId} does not exist`);

        this.device.eds.removeSubEntry(0x1028, subEntry.subIndex);
    }

    /** Initialize members and begin emergency monitoring. */
    init() {
        // Object 0x1001 - Error register.
        this.register = 0;

        // Object 0x1014 - COB-ID EMCY.
        let obj1014 = this.device.eds.getEntry(0x1014);
        if(obj1014 === undefined) {
            obj1014 = this.device.eds.addEntry(0x1014, {
                parameterName:  'COB-ID EMCY',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
                accessType:     AccessType.READ_WRITE,
            });
        }
        else {
            this._parse1014(obj1014);
        }

        // Object 0x1015 - Inhibit time EMCY.
        let obj1015 = this.device.eds.getEntry(0x1015);
        if(obj1015 === undefined) {
            obj1015 = this.device.eds.addEntry(0x1015, {
                parameterName:  'Inhibit time EMCY',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED16,
                accessType:     AccessType.READ_WRITE,
            });
        }
        else {
            this._parse1015(obj1015);
        }

        // Object 0x1028 - Emergency consumer object
        let obj1028 = this.device.eds.getEntry(0x1028);
        if(obj1028 === undefined) {
            obj1028 = this.device.eds.addEntry(0x1028, {
                parameterName:  'Emergency consumer object',
                objectType:     ObjectType.ARRAY,
            });
        }
        else {
            this._parse1028(obj1028);
        }

        obj1014.addListener('update', this._parse1014.bind(this));
        obj1015.addListener('update', this._parse1015.bind(this));
        obj1028.addListener('update', this._parse1028.bind(this));

        this.device.addListener('message', this._onMessage.bind(this));
    }

    /**
     * Service: EMCY write.
     *
     * @param {number} code - error code.
     * @param {Buffer} info - error info.
     * @returns {Promise} resolves once the message has been sent.
     */
    write(code, info=null) {
        if(!this.valid)
            throw TypeError('EMCY is disabled');

        this.pending = this.pending.then(() => {
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Create emergency object.
                    let cobId = this.cobId;
                    if((cobId & 0xF) == 0)
                        cobId |= this.device.id;

                    const em = new EmcyMessage({
                        id: cobId,
                        code,
                        register: this.register,
                        info
                    });

                    // Send object.
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
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @param {number} message.len - CAN message length in bytes.
     * @private
     */
    _onMessage(message) {
        if(message.data.length != 8)
            return;

        let match = false;
        for(let id of this.consumers) {
            if(id == message.id) {
                match = true;
                break;
            }
        }

        if(!match)
            return;

        const code = message.data.readUInt16LE(0);
        const register = message.data.readUInt8(2);
        const info = message.data.subarray(3);

        const em = new EmcyMessage({
            id: message.id,
            code,
            register,
            info
        });

        // Object 0x1001 - Error register.
        this.register = register;

        // Object 0x1003 - Pre-defined error field.
        const obj1003 = this.device.eds.getEntry(0x1003);
        if(obj1003) {
            // Shift out oldest value.
            const errorCount = obj1003[0].value;
            for(let i = errorCount; i > 1; --i)
                obj1003[i-1].raw.copy(obj1003[i].raw);

            // Set new code at sub-index 1.
            obj1003[1].raw.writeUInt16LE(code);

            // Update error count.
            if(errorCount < (obj1003.subNumber - 1))
                obj1003[0].raw.writeUInt8(errorCount + 1);
        }

        this.device.emit('emergency', em);
    }

    /**
     * Called when 0x1014 (COB-ID EMCY) is updated.
     *
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
     *
     * @param {DataObject} data - updated DataObject.
     * @private
     */
    _parse1015(data) {
        this._inhibitTime = data.value;
    }

    /**
     * Called when 0x1028 (Emergency consumer object) is updated.
     *
     * @param {DataObject} entry - updated DataObject.
     * @private
     */
    _parse1028(entry) {
        /* Object 0x1028 - Emergency consumer object.
         *   sub-index 1+:
         *     bit 0..11    11-bit CAN-ID.
         *     bit 16..23   Reserved (0x00).
         *     bit 31       0 = valid, 1 = invalid.
         */

        this.consumers = [];
        for(let i = 1; i <= entry[0].value; ++i) {
            const subEntry = entry[i];
            if(subEntry === undefined)
                continue;

            if(subEntry.value >> 31)
                continue;

            const cobId = subEntry.value & 0x7ff;
            this.consumers.push(cobId);
        }
    }
}

module.exports=exports={ EmcyType, EmcyCode, EmcyMessage, Emcy };
