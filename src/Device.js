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
 * @param {Object} $0
 * @param {RawChannel} $0.channel - socketcan RawChannel object.
 * @param {number} $0.id - device identifier.
 * @param {EDS} $0.eds - the device's electronic data sheet.
 * @param {boolean} $0.loopback - enable loopback mode.
 *
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
    constructor({channel, id, eds, loopback=false}) {
        super();
        if(loopback) {
            this.channel = {
                callbacks: [],
                send: function(message) {
                    //console.log("\t", message.id.toString(16), message.data);
                    for(let i = 0; i < this.callbacks.length; i++)
                        this.callbacks[i](message);
                },
                addListener: function(event, callback, instance) {
                    if(event == 'onMessage')
                        this.callbacks.push(callback.bind(instance));
                },
            }
        }
        else {
            if(!channel)
                throw TypeError("Must provide channel (or use loopback mode)");

            this.channel = channel;
        }

        if(!id || id > 0x7F)
            throw RangeError("ID must be in range 1-127");

        this.id = id;

        this._EDS = (eds) ? eds : new EDS();
        this._EMCY = new EMCY(this);
        this._NMT = new NMT(this);
        this._PDO = new PDO(this);
        this._SDO = new SDO(this);
        this._SYNC = new SYNC(this);
        this._TIME = new TIME(this);
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

    /* Initialize the device and audit the object dictionary. */
    init() {
        this.EMCY.init();
        this.NMT.init();
        this.PDO.init();
        this.SDO.init();
        this.SYNC.init();
        this.TIME.init();
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
