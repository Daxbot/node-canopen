/**
 * @file Implements the CANopen Synchronization (SYNC) protocol.
 * @author Wilkins White
 * @copyright 2021 Daxbot
 */

const Device = require('../device');
const { DataObject } = require('../eds');
const { ObjectType, AccessType, DataType } = require('../types');

/**
 * CANopen SYNC protocol handler.
 *
 * The synchronization (SYNC) protocol follows a producer-consumer structure
 * that provides a basic network synchronization mechanism. There should be
 * at most one sync producer on the network at a time.
 *
 * @param {Device} device - parent device.
 * @see CiA301 "Synchronization object (SYNC)" (§7.2.5)
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
 * device.sync.cobId = 0x80;
 * device.sync.cyclePeriod = 1e6; // 1 second
 * device.sync.overflow = 10;
 * device.sync.generate = true;
 * device.sync.start();
 */
class Sync {
    constructor(device) {
        this.device = device;
        this.syncCounter = 0;
        this.syncTimer = null;
        this._generate = false;
        this._cobId = null;
        this._cyclePeriod = 0;
        this._overflow = 0;
    }

    /**
     * Sync generation enable bit (Object 0x1005, bit 30).
     *
     * @type {boolean}
     */
    get generate() {
        return this._generate;
    }

    set generate(gen) {
        let obj1005 = this.device.eds.getEntry(0x1005);
        if(obj1005 === undefined) {
            obj1005 = this.device.eds.addEntry(0x1005, {
                parameterName:  'COB-ID SYNC',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
                accessType:     AccessType.READ_WRITE,
            });
        }

        if(gen)
            obj1005.value |= (1 << 30);
        else
            obj1005.value &= ~(1 << 30);
    }

    /**
     * Sync COB-ID (Object 0x1005, bits 0-28).
     *
     * @type {number}
     */
    get cobId() {
        return this._cobId;
    }

    set cobId(cobId) {
        let obj1005 = this.device.eds.getEntry(0x1005);
        if(obj1005 === undefined) {
            obj1005 = this.device.eds.addEntry(0x1005, {
                parameterName:  'COB-ID SYNC',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
                accessType:     AccessType.READ_WRITE,
            });
        }

        cobId &= 0x7FF;
        obj1005.value = (obj1005.value & ~(0x7FF)) | cobId;
    }

    /**
     * Sync interval in μs (Object 0x1006).
     *
     * @type {number}
     */
    get cyclePeriod() {
        return this._cyclePeriod;
    }

    set cyclePeriod(period) {
        let obj1006 = this.device.eds.getEntry(0x1006);
        if(obj1006 === undefined) {
            obj1006 = this.device.eds.addEntry(0x1006, {
                parameterName:  'Communication cycle period',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
                accessType:     AccessType.READ_WRITE,
            });
        }

        obj1006.value = period;
    }

    /**
     * Sync counter overflow value (Object 0x1019).
     *
     * @type {number}
     */
    get overflow() {
        return this._overflow;
    }

    set overflow(overflow) {
        let obj1019 = this.device.eds.getEntry(0x1019);
        if(obj1019 === undefined) {
            obj1019 = this.device.eds.addEntry(0x1019, {
                parameterName:  'Synchronous counter overflow value',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED8,
                accessType:     AccessType.READ_WRITE,
            });
        }

        overflow &= 0xFF;
        obj1019.value = overflow;
    }

    /** Initialize members and begin consuming sync objects. */
    init() {
        // Object 0x1005 - COB-ID SYNC
        let obj1005 = this.device.eds.getEntry(0x1005);
        if(obj1005 === undefined) {
            obj1005 = this.device.eds.addEntry(0x1005, {
                parameterName:  'COB-ID SYNC',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
                accessType:     AccessType.READ_WRITE,
            });
        }
        else {
            this._parse1005(obj1005);
        }

        // Object 0x1006 - Communication cycle period
        let obj1006 = this.device.eds.getEntry(0x1006);
        if(obj1006 === undefined) {
            obj1006 = this.device.eds.addEntry(0x1006, {
                parameterName:  'Communication cycle period',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
                accessType:     AccessType.READ_WRITE,
            });
        }
        else {
            this._parse1006(obj1006);
        }

        // Object 0x1019 - Synchronous counter overflow value
        let obj1019 = this.device.eds.getEntry(0x1019);
        if(obj1019 === undefined) {
            obj1019 = this.device.eds.addEntry(0x1019, {
                parameterName:  'Synchronous counter overflow value',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED8,
                accessType:     AccessType.READ_WRITE,
            });
        }
        else {
            this._parse1019(obj1019);
        }

        obj1005.addListener('update', this._parse1005.bind(this));
        obj1006.addListener('update', this._parse1006.bind(this));
        obj1019.addListener('update', this._parse1019.bind(this));

        this.device.addListener('message', this._onMessage.bind(this));
    }

    /** Begin producing sync objects. */
    start() {
        if(!this.generate)
            throw TypeError('SYNC generation is disabled');

        if(this._overflow) {
            this.syncTimer = setInterval(() => {
                this.syncCounter += 1;
                if(this.syncCounter > this._overflow)
                    this.syncCounter = 1;

                this.write(this.syncCounter);
            }, this._cyclePeriod / 1000);
        }
        else {
            this.syncTimer = setInterval(() => {
                this.write();
            }, this._cyclePeriod / 1000);
        }
    }

    /** Stop producing sync objects. */
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
    write(counter=null) {
        if(!this.generate)
            throw TypeError('SYNC generation is disabled');

        const data = (counter) ? Buffer.from([counter]) : Buffer.alloc(0);
        this.device.send({
            id:     this.cobId,
            data:   data,
        });
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
        if((message.id & 0x7FF) !== this._cobId)
            return;

        if(message.data)
            this.device.emit('sync', message.data[1]);
        else
            this.device.emit('sync', null);
    }

    /**
     * Called when 0x1005 (COB-ID SYNC) is updated.
     *
     * @param {DataObject} data - updated DataObject.
     * @private
     */
    _parse1005(data) {
        /* Object 0x1005 - COB-ID SYNC.
         *   bit 0..10      11-bit CAN base frame.
         *   bit 11..28     29-bit CAN extended frame.
         *   bit 29         Frame type.
         *   bit 30         Produce sync objects.
         */
        const value = data.value;
        const gen = (value >> 30) & 0x1
        const rtr = (value >> 29) & 0x1;
        const cobId = value & 0x7FF;

        if(rtr == 0x1)
            throw TypeError("CAN extended frames are not supported")

        if(cobId == 0)
            throw TypeError('COB-ID SYNC must not be 0');

        this._generate = !!gen;
        this._cobId = cobId;
    }

    /**
     * Called when 0x1006 (Communication cycle period) is updated.
     *
     * @param {DataObject} data - updated DataObject.
     * @private
     */
    _parse1006(data) {
        const cyclePeriod = data.value;
        if(cyclePeriod == 0)
            throw TypeError('communication cycle period must not be 0')

        this._cyclePeriod = cyclePeriod;
    }

    /**
     * Called when 0x1019 (Synchronous counter overflow value) is updated.
     *
     * @param {DataObject} data - updated DataObject.
     * @private
     */
    _parse1019(data) {
        this._overflow = data.value;
    }
}

module.exports=exports={ Sync };
