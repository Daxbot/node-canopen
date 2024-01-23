/**
 * @file Implements the CANopen Synchronization (SYNC) protocol.
 * @author Wilkins White
 * @copyright 2024 Daxbot
 */

const EventEmitter = require('events');
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
 * @fires 'message' on preparing a CAN message to send.
 * @fires 'sync' on consuming a synchronization object.
 */
class Sync extends EventEmitter {
    constructor(eds) {
        super();

        if(!Eds.isEds(eds))
            throw new TypeError('not an Eds');

        this.eds = eds;
        this.syncCounter = 0;
        this.syncTimer = null;
    }

    /**
     * Sync generation enable bit (Object 0x1005, bit 30).
     *
     * @type {boolean}
     */
    get generate() {
        const obj1005 = this.eds.getEntry(0x1005);
        if(obj1005)
            return !!((obj1005.value >> 30) & 0x1);

        return false;
    }

    /**
     * Sync COB-ID (Object 0x1005, bits 0-28).
     *
     * @type {number}
     */
    get cobId() {
        const obj1005 = this.eds.getEntry(0x1005);
        if(obj1005)
            return obj1005.value & 0x7FF;

        return null;
    }

    /**
     * Sync interval in μs (Object 0x1006).
     *
     * @type {number}
     */
    get cyclePeriod() {
        const obj1006 = this.eds.getEntry(0x1006);
        if (obj1006)
            return obj1006.value;

        return null;
    }

    /**
     * Sync counter overflow value (Object 0x1019).
     *
     * @type {number}
     */
    get overflow() {
        const obj1019 = this.eds.getEntry(0x1019);
        if (obj1019)
            return obj1019.value;

        return null;
    }

    /**
     * Start the module;
     */
    start() {
        if(this.syncTimer !== null)
            return;

        if (this.generate) {
            if (!this.cobId)
                throw new EdsError('COB-ID SYNC may not be 0');

            if (!this.cyclePeriod)
                throw new EdsError('communication cycle period may not be 0');

            if (this.overflow) {
                this.syncTimer = setInterval(() => {
                    this.syncCounter += 1;
                    if (this.syncCounter > this.overflow)
                        this.syncCounter = 1;

                    this.write(this.syncCounter);
                }, this.cyclePeriod / 1000);
            }
            else {
                this.syncTimer = setInterval(() => {
                    this.write();
                }, this.cyclePeriod / 1000);
            }
        }
    }

    /**
     * Stop the module.
     */
    stop() {
        clearInterval(this.syncTimer);
        this.syncTimer = null;
        this.syncCounter = 0;
    }

    /**
     * Service: SYNC write.
     *
     * @param {number | null} counter - sync counter;
     */
    write(counter = null) {
        if (!this.generate)
            throw new EdsError('SYNC generation is disabled');

        this.emit('message', {
            id: this.cobId,
            data: (counter) ? Buffer.from([counter]) : Buffer.alloc(0),
        });
    }

    /**
     * Call when a new CAN message is received.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @param {number} message.len - CAN message length in bytes.
     */
    receive(message) {
        if ((message.id & 0x7FF) === this.cobId) {
            if (message.data)
                this.emit('sync', message.data[0]);
            else
                this.emit('sync', null);
        }
    }

    ////////////////////////////// Deprecated //////////////////////////////

    /**
     * Initialize the device and audit the object dictionary.
     *
     * @deprecated
     */
    init() {
        deprecate(() => this.start(),
            'init() is deprecated. Use start() instead.');
    }
}

module.exports = exports = { Sync };
