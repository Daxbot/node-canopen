const { ObjectType, AccessType, DataType, typeToRaw, rawToType } = require('../eds');

/** CANopen TIME protocol handler.
 *
 * The time stamp (TIME) protocol follows a producer-consumer structure that
 * provides a simple network clock. There should be at most one time stamp
 * producer on the network.
 *
 * @param {Device} device - parent device.
 * @see CiA301 "Time stamp object (TIME)" (§7.2.6)
 * @memberof Device
 */
class Time {
    constructor(device) {
        this.device = device;
        this._produce = false;
        this._consume = false;
        this._cobId = null;
    }

    /**
     * Set the time stamp producer enable bit.
     * @param {boolean} produce - enable flag.
     */
    set produce(produce) {
        let obj1012 = this.device.eds.getEntry(0x1012);
        if(obj1012 === undefined) {
            obj1012 = this.device.eds.addEntry(0x1012, {
                'ParameterName':    'COB-ID TIME',
                'ObjectType':       ObjectType.VAR,
                'DataType':         DataType.UNSIGNED32,
                'AccessType':       AccessType.READ_WRITE,
            });
        }

        if(produce)
            obj1012.value |= (1 << 30);
        else
            obj1012.value &= ~(1 << 30);
    }

    /**
     * Get the time stamp producer enable bit.
     * @return {boolean} - enable flag.
     */
    get produce() {
        return this._produce;
    }

    /**
     * Set the time stamp consumer enable bit.
     * @param {boolean} consume - enable flag.
     */
    set consume(consume) {
        let obj1012 = this.device.eds.getEntry(0x1012);
        if(obj1012 === undefined) {
            obj1012 = this.device.eds.addEntry(0x1012, {
                'ParameterName':    'COB-ID TIME',
                'ObjectType':       ObjectType.VAR,
                'DataType':         DataType.UNSIGNED32,
                'AccessType':       AccessType.READ_WRITE,
            });
        }

        let raw = obj1012.raw;
        if(consume)
            raw[3] |= (1 << 7); // bit 31
        else
            raw[3] &= ~(1 << 7); // bit 31

        obj1012.raw = raw;
    }

    /**
     * Get the time stamp consumer enable bit.
     * @return {boolean} - enable flag.
     */
    get consume() {
        return this._consume;
    }

    /**
     * Set the COB-ID.
     * @param {number} cobId - COB-ID.
     */
    set cobId(cobId) {
        let obj1012 = this.device.eds.getEntry(0x1012);
        if(obj1012 === undefined) {
            obj1012 = this.device.eds.addEntry(0x1012, {
                'ParameterName':    'COB-ID TIME',
                'ObjectType':       ObjectType.VAR,
                'DataType':         DataType.UNSIGNED32,
                'AccessType':       AccessType.READ_WRITE,
            });
        }

        cobId &= 0x7FF;
        obj1012.value = (obj1012.value & ~(0x7FF)) | cobId;
    }

    /**
     * Get the COB-ID.
     * @return {number} - COB-ID.
     */
    get cobId() {
        return this._cobId;
    }

    /** Initialize members and begin consuming time stamp objects. */
    init() {
        // Object 0x1012 - COB-ID TIME
        const obj1012 = this.device.eds.getEntry(0x1012);
        if(obj1012) {
            this._parse1012(obj1012);
            obj1012.addListener('update', this._parse1012.bind(this));

            this.device.addListener('message', this._onMessage.bind(this));
        }
    }

    /**
     * Service: TIME write.
     * @param {Date} date - date to write.
     */
    write(date=new Date()) {
        if(!this.produce)
            throw TypeError('TIME production is disabled.');

        const data = typeToRaw(date, DataType.TIME_OF_DAY);
        this.device.send({
            id:     this.cobId,
            data:   data,
        });
    }

    /**
     * Called when a new CAN message is received.
     * @param {Object} message - CAN frame.
     * @private
     */
    _onMessage(message) {
        if(!this.consume || (message.id & 0x7FF) != this.cobId)
            return;

        const date = rawToType(message.data, DataType.TIME_OF_DAY);
        this.device.emit('time', date);
    }

    /**
     * Called when 0x1012 (COB-ID TIME) is updated.
     * @param {DataObject} data - updated DataObject.
     * @private
     */
    _parse1012(data) {
        /* Object 0x1012 - COB-ID TIME.
         *   bit 0..10      11-bit CAN base frame.
         *   bit 11..28     29-bit CAN extended frame.
         *   bit 29         Frame type.
         *   bit 30         Produce time objects.
         *   bit 31         Consume time objects.
         */
        const value = data.value;
        const consume = (value >> 31) & 0x1;
        const produce = (value >> 30) & 0x1;
        const rtr = (value >> 29) & 0x1;
        const cobId = value & 0x7FF;

        if(rtr == 0x1)
            throw TypeError("CAN extended frames are not supported.")

        if(cobId == 0)
            throw TypeError('COB-ID TIME can not be 0.');

        this._consume = !!consume;
        this._produce = !!produce;
        this._cobId = cobId;
    }
}

module.exports=exports={ Time };
