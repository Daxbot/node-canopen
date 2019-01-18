/** CANopen Timestamp protocol handler.
 * @param {RawChannel} channel - socketcan RawChannel object.
 */
class TimeStamp {
    constructor(channel) {
        this.channel = channel;
    }
}

module.exports=exports=TimeStamp;