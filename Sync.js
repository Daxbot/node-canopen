class Sync
{
    constructor(channel)
    {
        this.channel = channel;
        this.message = {
            id: 0x80,
            ext: false,
            rtr: false,
            data: Buffer.alloc(1)
        }
        this.timer = null;
        this.syncCount = 0;
    }

    _sendSync()
    {
        this.message['data'][0] += 1;
        this.channel.send(this.message);
    }

    start(syncTime)
    {
        this.timer = setInterval(()=>{ this._sendSync() }, syncTime);
    }

    stop()
    {
        clearInterval(this.timer);
    }
}

module.exports=exports=Sync