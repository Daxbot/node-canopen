/**
 * @file Implements the CANopen Emergency (EMCY) protocol.
 * @author Wilkins White
 * @copyright 2024 Daxbot
 */

const Protocol = require('./protocol');
const { Eds, EdsError } = require('../eds');
const { deprecate } = require('util');

/**
 * CANopen emergency error code classes.
 *
 * @enum {number}
 * @see CiA301 "Emergency object (EMCY)" (§7.2.7)
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
};

/**
 * CANopen emergency error codes.
 *
 * @enum {number}
 * @see CiA301 "Emergency object (EMCY)" (§7.2.7)
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
};

/**
 * Structure for storing and parsing CANopen emergency objects.
 *
 * @param {object} args - arguments.
 * @param {EmcyCode} args.code - error code.
 * @param {number} args.register - error register (Object 0x1001).
 * @param {Buffer} args.info - error info.
 */
class EmcyMessage {
    constructor(...args) {
        if(typeof args[0] === 'object') {
            args = args[0];
        }
        else {
            args = {
                code: args[0],
                register: args[1],
                info: args[2],
            };
        }

        this.code = args.code;
        this.register = args.register || 0;
        this.info = Buffer.alloc(5);

        if (args.info) {
            if (!Buffer.isBuffer(args.info) || args.info.length > 5)
                throw TypeError('info must be a Buffer of length [0-5]');

            args.info.copy(this.info);
        }
    }

    /**
     * Convert to a string.
     *
     * @returns {string} string representation.
     */
    toString() {
        // Check codes
        switch (this.code) {
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
        switch (this.code & 0xff00) {
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

    /**
     * Convert to a Buffer.
     *
     * @returns {Buffer} encoded data.
     */
    toBuffer() {
        let data = Buffer.alloc(8);
        data.writeUInt16LE(this.code);
        data.writeUInt8(this.register, 2);
        this.info.copy(data, 3);

        return data;
    }

    /**
     * Returns true if the object is an instance of EmcyMessage.
     *
     * @param {object} obj - object to test.
     * @returns {boolean} true if obj is an EmcyMessage.
     */
    static isMessage(obj) {
        return obj instanceof EmcyMessage;
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
 * @param {Eds} eds - Eds object.
 * @see CiA301 "Emergency object" (§7.2.7)
 */
class Emcy extends Protocol {
    constructor(eds) {
        super();

        if(!Eds.isEds(eds))
            throw new TypeError('not an Eds');

        this.eds = eds;
        this.sendQueue = [];
        this.sendTimer = null;
        this.consumers = [];
    }

    /**
     * Get object 0x1001 - Error register.
     *
     * @returns {number} error register value.
     * @deprecated Use {@link Eds#getErrorRegister} instead.
     */
    get register() {
        return this.eds.getErrorRegister();
    }

    /**
     * Set object 0x1001 - Error register.
     *
     * @param {number} flags - error flags.
     * @deprecated Use {@link Eds#setErrorRegister} instead.
     */
    set register(flags) {
        this.eds.setErrorRegister(flags);
    }

    /**
     * Get object 0x1014 [bit 31] - EMCY valid.
     *
     * @returns {boolean} Emcy valid.
     * @deprecated Use {@link Eds#getEmcyValid} instead.
     */
    get valid() {
        return this.eds.getEmcyValid();
    }

    /**
     * Set object 0x1014 [bit 31] - EMCY valid.
     *
     * @param {number} valid - Emcy valid.
     * @deprecated Use {@link Eds#setEmcyValid} instead.
     */
    set valid(valid) {
        this.eds.setEmcyValid(valid);
    }

    /**
     * Get object 0x1014 - COB-ID EMCY.
     *
     * @returns {number} Emcy COB-ID.
     * @deprecated Use {@link Eds#getEmcyCobId} instead.
     */
    get cobId() {
        return this.eds.getEmcyCobId();
    }

    /**
     * Set object 0x1014 - COB-ID EMCY.
     *
     * @param {number} value - Emcy COB-ID.
     * @deprecated Use {@link Eds#setEmcyCobId} instead.
     */
    set cobId(value) {
        this.eds.setEmcyCobId(value);
    }

    /**
     * Get object 0x1015 - Inhibit time EMCY.
     *
     * @returns {number} Emcy inhibit time in 100 μs.
     * @deprecated Use {@link Eds#getEmcyInhibitTime} instead.
     */
    get inhibitTime() {
        return this.eds.getEmcyInhibitTime();
    }

    /**
     * Set object 0x1015 - Inhibit time EMCY.
     *
     * @param {number} value - inhibit time in multiples of 100 μs.
     * @deprecated Use {@link Eds#setEmcyInhibitTime} instead.
     */
    set inhibitTime(value) {
        this.eds.setEmcyInhibitTime(value);
    }

    /**
     * Start the module.
     *
     * @fires Protocol#start
     */
    start() {
        const obj1015 = this.eds.getEntry(0x1015);
        if(obj1015) {
            obj1015.on('update', (obj) => this._updateSendTimer(obj.value));
            this._updateSendTimer(obj1015.value);
        }

        const obj1028 = this.eds.getEntry(0x1028);
        if(obj1028) {
            obj1028.on('update', () => {
                this.consumers = this.eds.getEmcyConsumers();
            });
        }

        this.consumers = this.eds.getEmcyConsumers();

        super.start();
    }

    /**
     * Stop the module.
     *
     * @fires Protocol#stop
     */
    stop() {
        if(this.sendTimer) {
            clearInterval(this.sendTimer);
            this.sendTimer = null;
        }

        super.stop();
    }

    /**
     * Service: EMCY write.
     *
     * @param {object} args - arguments.
     * @param {number} args.code - error code.
     * @param {Buffer} [args.info] - error info.
     * @fires Protocol#message
     */
    write(...args) {
        if(!this.eds.getEmcyValid())
            throw new EdsError('EMCY production is disabled');

        const cobId = this.eds.getEmcyCobId();
        if (!cobId)
            throw new EdsError('COB-ID EMCY may not be 0');

        let code, info;
        if(typeof args[0] === 'object') {
            // write({ code, info })
            code = args.code;
            info = args.info;
        }
        else {
            // write(code, info)
            code = args[0];
            info = args[1];
        }

        const register = this.eds.getErrorRegister();
        const em = new EmcyMessage({ code, register, info });

        if(this.sendTimer)
            this.sendQueue.push([ cobId, em.toBuffer() ]);
        else
            this.send(cobId, em.toBuffer());
    }

    /**
     * Call when a new CAN message is received.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @fires Emcy#emergency
     */
    receive({ id, data }) {
        if (data.length != 8)
            return;

        for (let cobId of this.consumers) {
            if (id === cobId) {
                /**
                 * An emergency message was received.
                 *
                 * @event Emcy#emergency
                 * @type {object}
                 * @property {number} cobId - message identifier.
                 * @property {EmcyMessage} em - message object.
                 */
                this.emit('emergency', {
                    cobId: id,
                    em: new EmcyMessage({
                        code: data.readUInt16LE(0),
                        register: data.readUInt8(2),
                        info: data.subarray(3),
                    }),
                });
                break;
            }
        }
    }

    /**
     * Update the inhibit timer.
     *
     * @param {number} inhibitTime - Emcy inhibit time in 100 μs.
     * @private
     */
    _updateSendTimer(inhibitTime) {
        if(this.sendTimer) {
            // Clear the old timer
            clearInterval(this.sendTimer);
            this.sendTimer = null;
        }

        if(inhibitTime > 0) {
            const delay = inhibitTime / 10; // 100 μs
            this.sendTimer = setInterval(() => {
                if(this.sendQueue.length > 0) {
                    const [ id, data ] = this.sendQueue.shift();
                    this.send(id, data);
                }
            }, delay);
        }
        else {
            // If the inhibitTime is 0, then send all queued messages
            while(this.sendQueue.length > 0) {
                const [ id, data ] = this.sendQueue.shift();
                this.send(id, data);
            }
        }
    }
}

////////////////////////////////// Deprecated //////////////////////////////////

/**
 * Initialize the device and audit the object dictionary.
 *
 * @deprecated Use {@link Emcy#start} instead.
 * @function
 */
Emcy.prototype.init = deprecate(
    function() {
        const { ObjectType, DataType } = require('../types');

        this.register = 0;

        let obj1014 = this.eds.getEntry(0x1014);
        if(obj1014 === undefined) {
            obj1014 = this.eds.addEntry(0x1014, {
                parameterName:  'COB-ID EMCY',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
            });
        }

        let obj1015 = this.eds.getEntry(0x1015);
        if(obj1015 === undefined) {
            obj1015 = this.eds.addEntry(0x1015, {
                parameterName:  'Inhibit time EMCY',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED16,
            });
        }

        if((this.cobId & 0xF) == 0)
            this.cobId |= this.deviceId;

        this.eds.addEmcyConsumer(this.cobId);

        this.start();
    }, 'Emcy.init() is deprecated. Use Emcy.start() instead.');

/**
 * Configures the number of sub-entries for 0x1003 (Pre-defined error field).
 *
 * @param {number} length - how many historical error events should be kept.
 * @deprecated Use {@link Eds#setHistoryLength} instead.
 * @function
 */
Emcy.prototype.setHistoryLength = deprecate(
    function (length) {
        this.eds.setErrorHistoryLength(length);
    }, 'Emcy.setHistoryLength is deprecated. Use Eds.setHistoryLength() instead.');

module.exports = exports = { EmcyType, EmcyCode, EmcyMessage, Emcy };
