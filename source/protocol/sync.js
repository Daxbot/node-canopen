/**
 * @file Implements the CANopen Synchronization (SYNC) protocol.
 * @author Wilkins White
 * @copyright 2024 Daxbot
 */

const Protocol = require('./protocol');
const { Eds, EdsError } = require('../eds');
const { deprecate } = require('util');

/**
 * CANopen SYNC protocol handler.
 *
 * The synchronization (SYNC) protocol follows a producer-consumer structure
 * that provides a basic network synchronization mechanism. There should be
 * at most one sync producer on the network at a time.
 *
 * @param {Eds} eds - Eds object.
 * @see CiA301 "Synchronization object (SYNC)" (§7.2.5)
 */
class Sync extends Protocol {
    constructor(eds) {
        super();

        if (!Eds.isEds(eds))
            throw new TypeError('not an Eds');

        this.eds = eds;
        this.syncCounter = 0;
        this.syncTimer = null;
        this._cobId = null;
    }

    /**
     * Get object 0x1005 [bit 30] - Sync generation enable.
     *
     * @returns {boolean} Sync generation enable.
     * @deprecated
     */
    get generate() {
        return this.eds.getSyncGenerationEnable();
    }

    /**
     * Set object 0x1005 [bit 30] - Sync generation enable.
     *
     * @param {boolean} enable - Sync generation enable.
     * @deprecated
     */
    set generate(enable) {
        this.eds.setSyncGenerationEnable(enable);
    }

    /**
     * Get object 0x1005 - COB-ID SYNC.
     *
     * @returns {number} Sync COB-ID.
     * @deprecated
     */
    get cobId() {
        return this.eds.getSyncCobId();
    }

    /**
     * Set object 0x1005 - COB-ID SYNC.
     *
     * @param {number} cobId - Sync COB-ID (typically 0x80).
     * @deprecated
     */
    set cobId(cobId) {
        this.eds.setSyncCobId(cobId);
    }

    /**
     * Get object 0x1006 - Communication cycle period.
     *
     * @returns {number} Sync interval in μs.
     * @deprecated
     */
    get cyclePeriod() {
        return this.eds.getSyncCyclePeriod();
    }

    /**
     * Set object 0x1006 - Communication cycle period.
     *
     * @param {number} period - communication cycle period.
     * @deprecated
     */
    set cyclePeriod(period) {
        this.eds.setSyncCyclePeriod(period);
    }

    /**
     * Get object 0x1019 - Synchronous counter overflow value.
     *
     * @returns {number} Sync counter overflow value.
     * @deprecated
     */
    get overflow() {
        return this.eds.getSyncOverflow();
    }

    /**
     * Set object 0x1019 - Synchronous counter overflow value.
     *
     * @param {number} overflow - Sync overflow value.
     * @deprecated
     */
    set overflow(overflow) {
        this.eds.setSyncOverflow(overflow);
    }

    /**
     * Start the module;
     *
     * @fires Protocol#start
     */
    start() {
        if (this.syncTimer !== null)
            return;

        if (this.eds.getSyncGenerationEnable()) {
            const cobId = this.eds.getSyncCobId();
            if (!cobId)
                throw new EdsError('COB-ID SYNC may not be 0');

            this._cobId = cobId;

            const cyclePeriod = this.eds.getSyncCyclePeriod();
            if (!cyclePeriod)
                throw new EdsError('communication cycle period may not be 0');

            const overflow = this.eds.getSyncOverflow();
            if (overflow) {
                this.syncTimer = setInterval(() => {
                    this.syncCounter += 1;
                    if (this.syncCounter > overflow)
                        this.syncCounter = 1;

                    this.send(cobId, Buffer.from([this.syncCounter]));
                }, cyclePeriod / 1000);
            }
            else {
                this.syncTimer = setInterval(() => {
                    this.send(cobId, Buffer.alloc(0));
                }, cyclePeriod / 1000);
            }
        }

        super.start();
    }

    /**
     * Stop the module.
     *
     * @fires Protocol#stop
     */
    stop() {
        clearInterval(this.syncTimer);
        this.syncTimer = null;
        this.syncCounter = 0;
        super.stop();
    }

    /**
     * Service: SYNC write.
     *
     * @param {number | null} counter - sync counter;
     * @fires Protocol#message
     */
    write(counter = null) {
        if(!this.eds.getSyncGenerationEnable())
            throw new EdsError('SYNC generation is disabled');

        const cobId = this.eds.getSyncCobId();
        if (!cobId)
            throw new EdsError('COB-ID SYNC may not be 0');

        if(counter !== null)
            this.send(cobId, Buffer.from([counter]));
        else
            this.send(cobId, Buffer.alloc(0));
    }

    /**
     * Call when a new CAN message is received.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @fires Sync#sync
     */
    receive({ id, data }) {
        if (this._cobId === id) {
            if (data)
                data = data[0];

            /**
             * A Sync object was received.
             *
             * @event Sync#sync
             * @type {number}
             */
            this.emit('sync', data);
        }
    }
}

////////////////////////////////// Deprecated //////////////////////////////////

/**
 * Initialize the device and audit the object dictionary.
 *
 * @deprecated Use {@link Sync#start} instead.
 * @function
 */
Sync.prototype.init = deprecate(
    function () {
        this.start();
    }, 'Sync.init() is deprecated. Use Sync.start() instead.');


module.exports = exports = { Sync };
