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
     * @deprecated Use {@link Eds#getSyncGenerationEnable} instead.
     */
    get generate() {
        return this.eds.getSyncGenerationEnable();
    }

    /**
     * Set object 0x1005 [bit 30] - Sync generation enable.
     *
     * @param {boolean} enable - Sync generation enable.
     * @deprecated Use {@link Eds#setSyncGenerationEnable} instead.
     */
    set generate(enable) {
        this.eds.setSyncGenerationEnable(enable);
    }

    /**
     * Get object 0x1005 - COB-ID SYNC.
     *
     * @returns {number} Sync COB-ID.
     * @deprecated Use {@link Eds#getSyncCobId} instead.
     */
    get cobId() {
        return this.eds.getSyncCobId();
    }

    /**
     * Set object 0x1005 - COB-ID SYNC.
     *
     * @param {number} cobId - Sync COB-ID (typically 0x80).
     * @deprecated Use {@link Eds#setSyncCobId} instead.
     */
    set cobId(cobId) {
        this.eds.setSyncCobId(cobId);
    }

    /**
     * Get object 0x1006 - Communication cycle period.
     *
     * @returns {number} Sync interval in μs.
     * @deprecated Use {@link Eds#getSyncCyclePeriod} instead.
     */
    get cyclePeriod() {
        return this.eds.getSyncCyclePeriod();
    }

    /**
     * Set object 0x1006 - Communication cycle period.
     *
     * @param {number} period - communication cycle period.
     * @deprecated Use {@link Eds#setSyncCyclePeriod} instead.
     */
    set cyclePeriod(period) {
        this.eds.setSyncCyclePeriod(period);
    }

    /**
     * Get object 0x1019 - Synchronous counter overflow value.
     *
     * @returns {number} Sync counter overflow value.
     * @deprecated Use {@link Eds#getSyncOverflow} instead.
     */
    get overflow() {
        return this.eds.getSyncOverflow();
    }

    /**
     * Set object 0x1019 - Synchronous counter overflow value.
     *
     * @param {number} overflow - Sync overflow value.
     * @deprecated Use {@link Eds#setSyncOverflow} instead.
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

        const obj1005 = this.eds.getEntry(0x1005);
        if(obj1005) {
            obj1005.on('update', (obj) => {
                this._cobId = obj.raw.readUInt16LE() & 0x7ff;
                const generate = (obj.raw[3] & (1 << 6));
                this._updateSendTimer({ generate, cobId: this._cobId });
            });
        }

        const obj1006 = this.eds.getEntry(0x1006);
        if(obj1006) {
            obj1006.on('update',
                (obj) => this._updateSendTimer({ cyclePeriod: obj.value }));
        }

        const obj1019 = this.eds.getEntry(0x1019);
        if(obj1019) {
            obj1019.on('update',
                (obj) => this._updateSendTimer({ overflow: obj.value }));
        }

        this._cobId = this.eds.getSyncCobId();
        this._updateSendTimer({});

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
            this.send(cobId);
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

    /**
     * Update the sync generation timer.
     *
     * @param {object} args - arguments.
     * @param {boolean} args.generate - Sync generation enable.
     * @param {number} args.cobId - COB-ID SYNC.
     * @param {number} args.cyclePeriod - Emcy inhibit time in 100 μs.
     * @param {number} args.overflow - counter overflow value.
     * @private
     */
    _updateSendTimer({ generate, cobId, cyclePeriod, overflow }) {
        if(this.syncTimer) {
            // Clear the old timer
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }

        if(generate === undefined)
            generate = this.eds.getSyncGenerationEnable();

        if(generate) {
            if(cobId === undefined)
                cobId = this.eds.getSyncCobId();

            if(cyclePeriod === undefined)
                cyclePeriod = this.eds.getSyncCyclePeriod();

            if (cobId > 0 && cyclePeriod > 0) {
                if(overflow === undefined)
                    overflow = this.eds.getSyncOverflow();

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
        const { ObjectType, DataType } = require('../types');

        let obj1005 = this.eds.getEntry(0x1005);
        if(obj1005 === undefined) {
            obj1005 = this.eds.addEntry(0x1005, {
                parameterName:  'COB-ID SYNC',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
            });
        }

        let obj1006 = this.eds.getEntry(0x1006);
        if(obj1006 === undefined) {
            obj1006 = this.eds.addEntry(0x1006, {
                parameterName:  'Communication cycle period',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
            });
        }

        let obj1019 = this.eds.getEntry(0x1019);
        if(obj1019 === undefined) {
            obj1019 = this.eds.addEntry(0x1019, {
                parameterName:  'Synchronous counter overflow value',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED8,
            });
        }

        this.start();
    }, 'Sync.init() is deprecated. Use Sync.start() instead.');


module.exports = exports = { Sync };
