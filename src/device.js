const EventEmitter = require('events');
const { Emcy } = require('./protocol/emcy');
const { Nmt } = require ('./protocol/nmt');
const { Pdo } = require('./protocol/pdo');
const { Sdo } = require('./protocol/sdo');
const { Sync } = require('./protocol/sync');
const { Time } = require('./protocol/time');
const { Eds } = require('./eds');

/**
 * A CANopen device.
 *
 * This class represents a single addressable device (or node) on the bus and
 * provides methods for manipulating the object dictionary.
 *
 * @param {Object} args
 * @param {number} args.id - device identifier.
 * @param {Eds} args.eds - the device's electronic data sheet.
 * @param {boolean} args.loopback - enable loopback mode.
 *
 * @emits 'message' on receiving a CAN message.
 * @emits 'emergency' on consuming an emergency object.
 * @emits 'nmtTimeout' on missing a tracked heartbeat.
 * @emits 'nmtChangeState' on change of NMT state.
 * @emits 'nmtResetNode' on NMT reset node.
 * @emits 'nmtResetCommunication' on NMT reset communication.
 * @emits 'sync' on consuming a synchronization object.
 * @emits 'time' on consuming a time stamp object.
 * @emits 'pdo' on updating a mapped pdo object.
 */
class Device extends EventEmitter {
    constructor({ id, eds, loopback=false }) {
        super();

        if(!id || id > 0x7F)
            throw RangeError("ID must be in range 1-127");

        this.id = id;
        this._send = undefined;

        if(loopback) {
            this._send = function(message) {
                this.receive(message);
            }
        }

        this.eds = (eds) ? eds : new Eds();
        this.emcy = new Emcy(this);
        this.nmt = new Nmt(this);
        this.pdo = new Pdo(this);
        this.sdo = new Sdo(this);
        this.sync = new Sync(this);
        this.time = new Time(this);
    }

    get dataObjects() {
        return this.eds.dataObjects;
    }

    /**
     * Set the send function.
     * @param {Function} send - send function.
     */
    transmit(send) {
        this._send = send;
    }

    /** Initialize the device and audit the object dictionary. */
    init() {
        this.emcy.init();
        this.nmt.init();
        this.pdo.init();
        this.sdo.init();
        this.sync.init();
        this.time.init();
    }

    /**
     * Called with each outgoing CAN message.
     * @param {Object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @param {number} message.len - CAN message length in bytes.
     */
    send(message) {
        if(this._send === undefined)
            throw ReferenceError("Must provide a send method!");

        this._send(message);
    }

    /**
     * Call with each incoming CAN message.
     * @param {Object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @param {number} message.len - CAN message length in bytes.
     */
    receive(message) {
        if(message)
            this.emit('message', message);
    }

    /**
     * Get the value of a DataObject.
     * @param {number | string} index - index or name of the DataObject.
     */
    getValue(index) {
        const entry = this.eds.getEntry(index);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        return entry.value;
    }

    /**
     * Get the value of a DataObject's sub-index.
     * @param {number | string} index - index or name of the DataObject.
     * @param {number} subIndex - sub-object index.
     */
    getValueArray(index, subIndex) {
        const entry = this.eds.getSubEntry(index, subIndex);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        return entry.value;
    }

    /**
     * Get the raw value of a DataObject.
     * @param {number | string} index - index or name of the DataObject.
     */
    getRaw(index) {
        const entry = this.eds.getEntry(index);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        return entry.raw;
    }

    /**
     * Get the raw value of a DataObject's sub-index.
     * @param {number | string} index - index or name of the DataObject.
     * @param {number} subIndex - sub-object index.
     */
    getRawArray(index, subIndex) {
        const entry = this.eds.getSubEntry(index, subIndex);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        return entry.raw;
    }

    /**
     * Set the value of a DataObject.
     * @param {number | string} index - index or name of the DataObject.
     * @param value - value to set.
     */
    setValue(index, value) {
        const entry = this.eds.getEntry(index);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        entry.value = value;
    }

    /**
     * Set the value of a DataObject's sub-index.
     * @param {number | string} index - index or name of the DataObject.
     * @param {number} subIndex - array sub-index to set;
     * @param value - value to set.
     */
    setValueArray(index, subIndex, value) {
        const entry = this.eds.getSubEntry(index, subIndex);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        entry.value = value;
    }

    /**
     * Set the raw value of a DataObject.
     * @param {number | string} index - index or name of the DataObject.
     * @param {Buffer} raw - raw Buffer to set.
     */
    setRaw(index, raw) {
        const entry = this.eds.getEntry(index);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        entry.raw = raw;
    }

    /**
     * Set the raw value of a DataObject's sub-index.
     * @param {number | string} index - index or name of the DataObject.
     * @param {number} subIndex - sub-object index.
     * @param {Buffer} raw - raw Buffer to set.
     */
    setRawArray(index, subIndex, raw) {
        const entry = this.eds.getSubEntry(index, subIndex);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        entry.raw = raw;
    }
}

module.exports=exports=Device;
