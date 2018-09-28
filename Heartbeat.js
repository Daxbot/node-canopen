class Heartbeat
{
    constructor(channel, deviceId=0x3)
    {
        this.channel = channel;
        this.deviceId = deviceId;
        this.message = {
            id: 0x700 + deviceId,
            ext: false,
            rtr: false,
            data: Buffer.from([0x05])
        }
        this.timer = null;
    }

    _sendHeartbeat()
    {
        this.channel.send(this.message);
    }

    start(guardTime)
    {
        this.timer = setInterval(()=>{ this._sendHeartbeat() }, guardTime);
    }

    stop()
    {
        clearInterval(this.timer);
    }
}

module.exports=exports=Heartbeat