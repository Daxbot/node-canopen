const EDS = require('../EDS');
const TIME_OF_DAY = EDS.dataTypes.TIME_OF_DAY;

/** CANopen TIME protocol handler.
 *
 * The time stamp (TIME) protocol follows a producer-consumer structure that
 * provides a simple network clock. There should be at most one time stamp
 * producer on the network.
 *
 * @param {Device} device - parent device.
 * @see CiA301 "Time stamp object (TIME)" (§7.2.6)
 */
class TIME {
    constructor(device) {
        this.device = device;
        this.cobId = null;
    }

    /** Begin consuming time stamp objects. */
    init() {
        /* Object 0x1012 - COB-ID TIME.
         *   bit 0..10      11-bit CAN base frame.
         *   bit 11..28     29-bit CAN extended frame.
         *   bit 29         Frame type.
         *   bit 30         Produce time objects.
         *   bit 31         Consume time objects.
         */
        const obj1012 = this.device.getEntry(0x1012);
        if(obj1012) {
            const cobId = obj1012.value;
            if(((cobId >> 29) & 0x1) == 0x1)
                throw TypeError("CAN extended frames are not supported.")

            if(((cobId >> 31) & 0x1) == 0x0) {
                this.cobId = cobId;
                this.device.channel.addListener(
                    "onMessage", this._onMessage, this);
            }
            obj1012.addListener('update', this._update1012);
        }
    }

    /** Service: TIME write.
     * @param {Date} date - date to write.
     */
    write(date=new Date()) {
        /* Object 0x1012 - COB-ID TIME. */
        const obj1012 = this.device.getEntry(0x1012);
        if(!obj1012)
            throw ReferenceError('0x1012 is required for TIME protocol.');

        let cobId = obj1012.value;
        if(((cobId >> 29) & 0x1) == 0x1)
            throw TypeError("CAN extended frames are not supported.")

        if(((cobId >> 30) & 0x1) == 0x1)
            throw TypeError('TIME production is disabled by 0x1014.');

        cobId &= 0x7ff;
        if(cobId == 0)
            throw TypeError('COB-ID TIME can not be 0.');

        const data = EDS.typeToRaw(date, TIME_OF_DAY);
        this.device.channel.send({
            id:     cobId,
            data:   data,
        });
    }

    /** socketcan 'onMessage' listener.
     * @private
     * @param {Object} message - CAN frame.
     */
    _onMessage(message) {
        if(message && (message.id & 0x7FF) == this.cobId) {
            const date = EDS.rawToType(message.data, TIME_OF_DAY);
            this.device.emit('time', date);
        }
    }

    /** Called when 0x1012 (COB-ID TIME) is updated.
     * @private
     * @param {DataObject} data - updated DataObject.
     */
    _update1012(data) {
        const cobId = data.value;
        if(((cobId >> 29) & 0x1) == 0x1)
            throw TypeError("CAN extended frames are not supported.")

        this.cobId = ((cobId >> 31) & 0x1) ? cobId : null;
    }
}

module.exports=exports=TIME;
