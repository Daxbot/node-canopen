/** CANopen Heartbeat producer.
 * @param {RawChannel} channel - socketcan RawChannel object.
 * @param {number} deviceId - device ID of the heartbeat producer.
 */
class Heartbeat
{
    constructor(channel, deviceId=0x3)
    {
        this.channel = channel;
        this.deviceId = deviceId;
        this.timer = null;
    }

    /** Serve a Heartbeat object to the channel.
     * @private
     */
    _sendHeartbeat()
    {
        this.channel.send({
            id: 0x700 + deviceId,
            ext: false,
            rtr: false,
            data: Buffer.from([0x05])
        });
    }

    /** Start serving Heartbeat objects.
     * @param {number} guardTime - milliseconds between Heartbeat objects.
     */
    start(guardTime)
    {
        this.timer = setInterval(()=>{ this._sendHeartbeat(); }, guardTime);
    }

    /** Stop serving Heartbeat objects. */
    stop()
    {
        clearInterval(this.timer);
    }
}

module.exports=exports=Heartbeat;