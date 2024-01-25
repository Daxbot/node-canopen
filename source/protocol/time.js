/**
 * @file Implements the CANopen Time Stamp (TIME) protocol.
 * @author Wilkins White
 * @copyright 2024 Daxbot
 */

const Protocol = require('./protocol');
const { Eds, EdsError } = require('../eds');
const { DataType } = require('../types');
const rawToType = require('../functions/raw_to_type');
const typeToRaw = require('../functions/type_to_raw');
const { deprecate } = require('util');

/**
 * CANopen TIME protocol handler.
 *
 * The time stamp (TIME) protocol follows a producer-consumer structure that
 * provides a simple network clock. There should be at most one time stamp
 * producer on the network.
 *
 * @param {Eds} eds - Eds object.
 * @see CiA301 "Time stamp object (TIME)" (§7.2.6)
 */
class Time extends Protocol {
    constructor(eds) {
        super();

        if(!Eds.isEds(eds))
            throw new TypeError('not an Eds');

        this.eds = eds;
        this._cobId = null;
    }

    /**
     * Get object 0x1012 [bit 30] - Time producer enable.
     *
     * @returns {boolean} Time producer enable.
     * @deprecated
     */
    get produce() {
        return this.eds.getTimeProducerEnable();
    }

    /**
     * Set object 0x1012 [bit 30] - Time producer enable.
     *
     * @param {boolean} enable - Time producer enable.
     * @deprecated
     */
    set produce(enable) {
        this.eds.setTimeProducerEnable(enable);
    }

    /**
     * Get object 0x1012 [bit 31] - Time consumer enable.
     *
     * @returns {boolean} Time consumer enable.
     * @deprecated
     */
    get consume() {
        return this.eds.getTimeConsumerEnable();
    }

    /**
     * Set object 0x1012 [bit 31] - Time consumer enable.
     *
     * @param {boolean} enable - Time consumer enable.
     * @deprecated
     */
    set consume(enable) {
        this.eds.setTimeConsumerEnable(enable);
    }

    /**
     * Get object 0x1012 - COB-ID TIME.
     *
     * @returns {number} Time COB-ID.
     * @deprecated
     */
    get cobId() {
        return this.eds.getTimeCobId();
    }

    /**
     * Set object 0x1012 - COB-ID TIME.
     *
     * @param {number} cobId - Time COB-ID (typically 0x100).
     * @deprecated
     */
    set cobId(cobId) {
        this.eds.setTimeCobId(cobId);
    }

    /**
     * Start the module.
     *
     * @fires Protocol#start
     */
    start() {
        if(this.eds.getTimeConsumerEnable()) {
            const cobId = this.eds.getTimeCobId();
            if(!cobId)
                throw new EdsError('COB-ID TIME may not be 0');

            this._cobId = cobId;
        }

        super.start();
    }

    /**
     * Stop the module.
     *
     * @fires Protocol#start
     */
    stop() {
        super.stop();
    }

    /**
     * Service: TIME write.
     *
     * @param {Date} date - date to write.
     * @fires Protocol#message
     */
    write(date) {
        if (!this.eds.getTimeProducerEnable())
            throw new EdsError('TIME production is disabled');

        const cobId = this.eds.getTimeCobId();
        if(!cobId)
            throw new EdsError('COB-ID TIME may not be 0');

        if(!date)
            date = new Date();

        this.send(this.cobId, typeToRaw(date, DataType.TIME_OF_DAY));
    }

    /**
     * Call when a new CAN message is received.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @fires Time#time
     */
    receive({ id, data }) {
        if (this._cobId === id) {
            const date = rawToType(data, DataType.TIME_OF_DAY);

            /**
             * A Time object was received.
             *
             * @event Time#time
             * @type {Date}
             */
            this.emit('time', date);
        }
    }
}

////////////////////////////////// Deprecated //////////////////////////////////

/**
 * Initialize the device and audit the object dictionary.
 *
 * @deprecated Use {@link Time#start} instead.
 * @function
 */
Time.prototype.init = deprecate(
    function () {
        this.start();
    }, 'Time.init() is deprecated. Use Time.start() instead.');

module.exports = exports = { Time };
