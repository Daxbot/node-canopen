/** NMT commands.
 * @private
 * @const {number}
 * @memberof NMT
 */
const commands = {
    ENTER_OPERATIONAL: 1,
    ENTER_STOPPED: 2,
    ENTER_PRE_OPERATIONAL: 128,
    RESET_NODE: 129,
    RESET_COMMUNICATION: 130,
 };

/** CANopen NMT protocol handler.
 * @param {Device} device - parent device.
 */
class NMT
{
    constructor(device)
    {
        this.device = device;
        this.deviceId = device.deviceId;
    }

    /** Serve an NMT command.
     * @private
     * @param {commands} command - NMT command to serve.
     */
    _send(command)
    {
        this.device.channel.send({
            id: 0x0,
            ext: false,
            rtr: false,
            data: Buffer.from([command, this.deviceId])
        });
    }

    /** Set the device to Pre Operational state. */
    PreOperational()
    {
        this._send(commands.ENTER_PRE_OPERATIONAL);
    }

    /** Set the device to Operational state. */
    Operational()
    {
        this._send(commands.ENTER_OPERATIONAL);
    }

    /** Set the device to Stopped state. */
    Stopped()
    {
        this._send(commands.ENTER_STOPPED);
    }

    /** Reset the device. */
    ResetDevice()
    {
        this._send(commands.RESET_NODE);
    }

    /** Reset device communication. */
    ResetCommunication()
    {
        this._send(commands.RESET_COMMUNICATION);
    }
}

module.exports=exports=NMT;