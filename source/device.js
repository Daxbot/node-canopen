/**
 * @file Implements a CANopen device
 * @author Wilkins White
 * @copyright 2021 Daxbot
 */

const EventEmitter = require('events');
const { Emcy } = require('./protocol/emcy');
const { Lss } = require('./protocol/lss');
const { Nmt } = require ('./protocol/nmt');
const { Pdo } = require('./protocol/pdo');
const SdoClient = require('./protocol/sdo_client');
const SdoServer = require('./protocol/sdo_server');
const { Sync } = require('./protocol/sync');
const { Time } = require('./protocol/time');
const { Eds, EdsError, DataObject } = require('./eds');

/**
 * A CANopen device.
 *
 * This class represents a single addressable device (or node) on the bus and
 * provides methods for manipulating the object dictionary.
 *
 * @param {object} args - arguments.
 * @param {number} args.id - device identifier [1-127].
 * @param {Eds} args.eds - the device's electronic data sheet.
 * @param {boolean} args.loopback - enable loopback mode.
 * @fires 'message' on receiving a CAN message.
 * @fires 'emergency' on consuming an emergency object.
 * @fires 'lssChangeMode' on change of LSS mode.
 * @fires 'lssChangeDeviceId' on change of device id.
 * @fires 'nmtTimeout' on missing a tracked heartbeat.
 * @fires 'nmtChangeState' on change of NMT state.
 * @fires 'nmtResetNode' on NMT reset node.
 * @fires 'nmtResetCommunication' on NMT reset communication.
 * @fires 'sync' on consuming a synchronization object.
 * @fires 'time' on consuming a time stamp object.
 * @fires 'pdo' on updating a mapped pdo object.
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
 */
class Device extends EventEmitter {
    constructor(args={}) {
        super();

        this._id = null;
        if(args.id !== undefined)
            this.id = args.id;

        this._send = null;

        if(args.loopback) {
            this.setTransmitFunction((message) => {
                /* We use setImmediate here to allow the method that called
                 * send() to run to completion before receive() is processed.
                 */
                setImmediate(() => this.receive(message));
            });
        }

        this.eds = args.eds || new Eds();
        this.emcy = new Emcy(this);
        this.lss = new Lss(this);
        this.nmt = new Nmt(this);
        this.pdo = new Pdo(this);
        this.sdo = new SdoClient(this);
        this.sdoServer = new SdoServer(this);
        this.sync = new Sync(this);
        this.time = new Time(this);
    }

    /**
     * The device id.
     *
     * @type {number}
     */
    get id() {
        return this._id;
    }

    set id(value) {
        if(value < 1 || value > 0x7F)
            throw RangeError("id must be in range 1-127");

        this._id = value;
    }

    /**
     * The device's DataObjects.
     *
     * @type {Array<DataObject>}
     */
    get dataObjects() {
        return this.eds.dataObjects;
    }

    /**
     * Set the send function.
     *
     * @param {Function} send - send function.
     */
    setTransmitFunction(send) {
        this._send = send;
    }

    /** Initialize the device and audit the object dictionary. */
    init() {
        this.emcy.init();
        this.lss.init();
        this.nmt.init();
        this.pdo.init();
        this.sdo.init();
        this.sdoServer.init();
        this.sync.init();
        this.time.init();
    }

    /**
     * Called with each outgoing CAN message. This method should not be called
     * directly - use the protocol objects instead.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @param {number} message.len - CAN message length in bytes.
     * @protected
     */
    send(message) {
        if(this._send === null)
            throw ReferenceError("please call setTransmitFunction() first");

        this._send(message);
    }

    /**
     * Call with each incoming CAN message.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @param {number} message.len - CAN message length in bytes.
     */
    receive(message) {
        if(message)
            this.emit('message', message);
    }

    /**
     * Get the value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @returns {number | bigint | string | Date} entry value.
     */
    getValue(index) {
        const entry = this.eds.getEntry(index);
        if(!entry)
            throw new EdsError("entry does not exist");

        return entry.value;
    }

    /**
     * Get the value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - sub-object index.
     * @returns {number | bigint | string | Date} entry value.
     */
    getValueArray(index, subIndex) {
        const entry = this.eds.getSubEntry(index, subIndex);
        if(!entry)
            throw new EdsError("entry does not exist");

        return entry.value;
    }

    /**
     * Get the raw value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @returns {Buffer} entry data.
     */
    getRaw(index) {
        const entry = this.eds.getEntry(index);
        if(!entry)
            throw new EdsError("entry does not exist");

        return entry.raw;
    }

    /**
     * Get the raw value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - sub-object index.
     * @returns {Buffer} entry data.
     */
    getRawArray(index, subIndex) {
        const entry = this.eds.getSubEntry(index, subIndex);
        if(!entry)
            throw new EdsError("entry does not exist");

        return entry.raw;
    }

    /**
     * Set the value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number | bigint | string | Date} value - value to set.
     */
    setValue(index, value) {
        const entry = this.eds.getEntry(index);
        if(!entry)
            throw new EdsError("entry does not exist");

        entry.value = value;
    }

    /**
     * Set the value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - array sub-index to set;
     * @param {number | bigint | string | Date} value - value to set.
     */
    setValueArray(index, subIndex, value) {
        const entry = this.eds.getSubEntry(index, subIndex);
        if(!entry)
            throw new EdsError("entry does not exist");

        entry.value = value;
    }

    /**
     * Set the raw value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {Buffer} raw - raw Buffer to set.
     */
    setRaw(index, raw) {
        const entry = this.eds.getEntry(index);
        if(!entry)
            throw new EdsError("entry does not exist");

        entry.raw = raw;
    }

    /**
     * Set the raw value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - sub-object index.
     * @param {Buffer} raw - raw Buffer to set.
     */
    setRawArray(index, subIndex, raw) {
        const entry = this.eds.getSubEntry(index, subIndex);
        if(!entry)
            throw new EdsError("entry does not exist");

        entry.raw = raw;
    }
}

module.exports=exports=Device;
