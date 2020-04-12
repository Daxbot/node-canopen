const EventEmitter = require('events');
const EMCY = require('./protocol/EMCY');
const NMT = require ('./protocol/NMT');
const PDO = require('./protocol/PDO');
const SDO = require('./protocol/SDO');
const SYNC = require('./protocol/SYNC');
const TIME = require('./protocol/TIME');
const {EDS} = require('./EDS');

/** A CANopen device.
 *
 * This class represents a single addressable device (or node) on the bus and
 * provides methods for manipulating the object dictionary.
 *
 * @param {Object} args
 * @param {number} args.id - device identifier.
 * @param {EDS} args.eds - the device's electronic data sheet.
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

        this._id = id;
        this._send = undefined;

        if(loopback) {
            this._send = function(message) {
                this.receive(message);
            }
        }

        this._EDS = (eds) ? eds : new EDS();
        this._EMCY = new EMCY(this);
        this._NMT = new NMT(this);
        this._PDO = new PDO(this);
        this._SDO = new SDO(this);
        this._SYNC = new SYNC(this);
        this._TIME = new TIME(this);
    }

    get id() {
        return this._id;
    }

    get dataObjects() {
        return this.EDS.dataObjects;
    }

    get EDS() {
        return this._EDS;
    }

    get SDO() {
        return this._SDO;
    }

    get PDO() {
        return this._PDO;
    }

    get EMCY() {
        return this._EMCY;
    }

    get NMT() {
        return this._NMT;
    }

    get SYNC() {
        return this._SYNC;
    }

    get TIME() {
        return this._TIME;
    }

    /** Set the send function.
     * @param {Function} send - send function.
     */
    transmit(send) {
        this._send = send;
    }

    /** Initialize the device and audit the object dictionary. */
    init() {
        this.EMCY.init();
        this.NMT.init();
        this.PDO.init();
        this.SDO.init();
        this.SYNC.init();
        this.TIME.init();
    }

    /** Starts the channel and any configured services. */
    start() {
        try { this.NMT.start(); } catch(e) {};
        try { this.PDO.start(); } catch(e) {};
        try { this.SYNC.start(); } catch(e) {};

        this.NMT.startNode(this.id);
    }

    /** Called with each outgoing CAN message.
     *
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

    /** Call with each incoming CAN message.
     *
     * @param {Object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @param {number} message.len - CAN message length in bytes.
     */
    receive(message) {
        if(message)
            this.emit('message', message);
    }

    /** Get the value of a DataObject.
     * @param {number | string} index - index or name of the DataObject.
     */
    getValue(index) {
        const entry = this.EDS.getEntry(index);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        return entry.value;
    }

    /** Get the value of a DataObject's sub-index.
     * @param {number | string} index - index or name of the DataObject.
     * @param {number} subIndex - sub-object index.
     */
    getValueArray(index, subIndex) {
        const entry = this.EDS.getSubEntry(index, subIndex);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        return entry.value;
    }

    /** Get the raw value of a DataObject.
     * @param {number | string} index - index or name of the DataObject.
     */
    getRaw(index) {
        const entry = this.EDS.getEntry(index);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        return entry.raw;
    }

    /** Get the raw value of a DataObject's sub-index.
     * @param {number | string} index - index or name of the DataObject.
     * @param {number} subIndex - sub-object index.
     */
    getRawArray(index, subIndex) {
        const entry = this.EDS.getSubEntry(index, subIndex);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        return entry.raw;
    }

    /** Set the value of a DataObject.
     * @param {number | string} index - index or name of the DataObject.
     * @param value - value to set.
     */
    setValue(index, value) {
        const entry = this.EDS.getEntry(index);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        entry.value = value;
    }

    /** Set the value of a DataObject's sub-index.
     * @param {number | string} index - index or name of the DataObject.
     * @param {number} subIndex - array sub-index to set;
     * @param value - value to set.
     */
    setValueArray(index, subIndex, value) {
        const entry = this.EDS.getSubEntry(index, subIndex);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        entry.value = value;
    }

    /** Set the raw value of a DataObject.
     * @param {number | string} index - index or name of the DataObject.
     * @param {Buffer} raw - raw Buffer to set.
     */
    setRaw(index, raw) {
        const entry = this.EDS.getEntry(index);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        entry.raw = raw;
    }

    /** Set the raw value of a DataObject's sub-index.
     * @param {number | string} index - index or name of the DataObject.
     * @param {number} subIndex - sub-object index.
     * @param {Buffer} raw - raw Buffer to set.
     */
    setRawArray(index, subIndex, raw) {
        const entry = this.EDS.getSubEntry(index, subIndex);
        if(!entry)
            throw ReferenceError("Entry does not exist");

        entry.raw = raw;
    }
}

module.exports=exports=Device;
