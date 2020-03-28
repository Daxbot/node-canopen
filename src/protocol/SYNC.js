/** CANopen SYNC protocol handler.
 *
 * The synchronization (SYNC) protocol follows a producer-consumer structure
 * that provides a basic network synchronization mechanism. There should be
 * at most one sync producer on the network at a time.
 *
 * @param {Device} device - parent device.
 * @see CiA301 "Synchronization object (SYNC)" (§7.2.5)
 */
class SYNC {
    constructor(device) {
        this.device = device;
        this.cobId = null;
        this.syncCounter = 0;
        this.syncTimer = null;
    }

    /** Begin consuming synchronization objects. */
    init() {
        /* Object 0x1005 - COB-ID SYNC.
         *   bit 0..10      11-bit CAN base frame.
         *   bit 11..28     29-bit CAN extended frame.
         *   bit 29         Frame type.
         *   bit 30         Produce sync objects.
         */
        const obj1005 = this.device.EDS.getEntry(0x1005);
        if(obj1005) {
            const cobId = obj1005.value;
            if(((cobId >> 29) & 0x1) == 0x1)
                throw TypeError("CAN extended frames are not supported.")

            this.cobId = cobId & 0x7FF;
            if(this.cobId == 0)
                throw TypeError('COB-ID SYNC can not be 0.');

            this.device.channel.addListener(
                "onMessage", this._onMessage, this);

            obj1005.addListener('update', this._update1005);
        }
    }

    /** Begin producing synchronization objects. */
    start() {
        /* Object 0x1005 - COB-ID SYNC. */
        const obj1005 = this.device.EDS.getEntry(0x1005);
        if(!obj1005)
            throw ReferenceError('0x1006 is required for SYNC protocol.');

        if(((obj1005.value >> 30) & 0x1) == 0x1)
            throw TypeError('SYNC production is disabled by 0x1005.');

        /* Object 0x1006 - Communication cycle period. */
        const obj1006 = this.device.EDS.getEntry(0x1006);
        if(!obj1006)
            throw ReferenceError('0x1006 is required for SYNC protocol.');

        const syncPeriod = obj1006.value / 1000;
        if(syncPeriod == 0)
            throw TypeError('SYNC production is disabled by 0x1006.')

        /* Object 0x1019 - Synchronous counter overflow value. */
        const obj1019 = this.device.EDS.getEntry(0x1019);
        if(obj1019) {
            const overflow = obj1019.value;
            this.syncTimer = setInterval(() => {
                    this.syncCounter += 1;
                    if(this.syncCounter > overflow)
                        this.syncCounter = 1;

                    this.write(this.syncCounter);
                }, syncPeriod);
        }
        else {
            this.syncTimer = setInterval(() => {
                this.write();
            }, syncPeriod);
        }
    }

    /** Stop producing synchronization objects. */
    stop() {
        clearInterval(this.syncTimer);
        this.syncTimer = null;
        this.syncCounter = 0;
    }

    /** Service: SYNC write.
     * @param {number | null} counter - sync counter;
     */
    write(counter=null) {
        if(!this.cobId)
            throw ReferenceError('SYNC module has not been initialized.');

        const data = (counter) ? Buffer.from([counter]) : Buffer.alloc(0);
        this.device.channel.send({
            id:     this.cobId,
            data:   data,
        });
    }

    /** socketcan 'onMessage' listener.
     * @private
     * @param {Object} message - CAN frame.
     */
    _onMessage(message) {
        if(message && (message.id & 0x7FF) == this.cobId) {
            if(message.data)
                this.device.emit('sync', message.data[1]);
            else
                this.device.emit('sync');
        }
    }

    /** Called when 0x1005 (COB-ID SYNC) is updated.
     * @private
     * @param {DataObject} data - updated DataObject.
     */
    _update1005(data) {
        let cobId = data.value;
        if(((cobId >> 29) & 0x1) == 0x1)
            throw TypeError("CAN extended frames are not supported.")

        cobId &= 0x7FF;
        if(cobId == 0)
            throw TypeError('COB-ID SYNC can not be 0.');

        this.cobId = cobId;
    }
}

module.exports=exports=SYNC;
