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
    }

    /**
     * Time stamp producer enable bit (Object 0x1012, bit 30).
     *
     * @type {boolean}
     */
    get produce() {
        if(this._produce !== undefined)
            return this._produce;

        const obj1012 = this.eds.getEntry(0x1012);
        if(obj1012)
            return !!((obj1012.value >> 30) & 0x1);

        return false;
    }

    set produce(value) {
        this._produce = value;
    }

    /**
     * Time stamp consumer enable bit (Object 0x1012, bit 31).
     *
     * @type {boolean}
     */
    get consume() {
        if(this._consume !== undefined)
            return this._consume;

        const obj1012 = this.eds.getEntry(0x1012);
        if(obj1012)
            return !!((obj1012.value >> 31) & 0x1);

        return false;
    }

    set consume(value) {
        this._consume = value;
    }

    /**
     * Time COB-ID (Object 0x1012, bits 0-28).
     *
     * @type {number}
     */
    get cobId() {
        if(this._cobId !== undefined)
            return this._cobId;

        const obj1012 = this.eds.getEntry(0x1012);
        if(obj1012)
            return obj1012.value & 0x7FF;

        return null;
    }

    set cobId(value) {
        this._cobId = value;
    }

    /**
     * Start the module.
     *
     * @fires Protocol#start
     */
    start() {
        if ((this.produce || this.consume) && !this.cobId)
            throw new EdsError('COB-ID TIME may not be 0');

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
        if (!this.produce)
            throw new EdsError('TIME production is disabled');

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
        if (this.consume && (id & 0x7FF) === this.cobId) {
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

    ////////////////////////////// Deprecated //////////////////////////////

    /**
     * Initialize the device and audit the object dictionary.
     *
     * @deprecated since 6.0.0
     */
    init() {
        deprecate(() => this.start(),
            'init() is deprecated. Use start() instead.');
    }
}

module.exports = exports = { Time };
