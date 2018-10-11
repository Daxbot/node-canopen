/** NMT internal states.
 * @protected
 * @const {number}
 * @memberof NMT
 */
const states = {
    INITIALIZING: 0,
    PRE_OPERATIONAL: 127,
    OPERATIONAL: 5,
    STOPPED: 4,
};

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
class NMT {
    constructor(device) {
        this.device = device;
        this.deviceId = device.deviceId;
        this.status = states.INITIALIZING;
    }

    /** Serve an NMT command.
     * @private
     * @param {commands} command - NMT command to serve.
     */
    _send(command) {
        this.device.channel.send({
            id: 0x0,
            ext: false,
            rtr: false,
            data: Buffer.from([command, this.deviceId])
        });
    }

    _process(message) {
        switch(message.data[0])
        {
            case commands.ENTER_OPERATIONAL:
                this.status = state.OPERATIONAL;
                break;
            case commands.STOPPED:
                this.status = state.STOPPED;
                break;
            case commands.PRE_OPERATIONAL:
                this.status = state.PRE_OPERATIONAL;
                break;
        }
    }

    get states() {
        return states;
    }

    /** Set the device to Pre Operational state. */
    PreOperational() {
        this._send(commands.ENTER_PRE_OPERATIONAL);
    }

    /** Set the device to Operational state. */
    Operational() {
        this._send(commands.ENTER_OPERATIONAL);
    }

    /** Set the device to Stopped state. */
    Stopped() {
        this._send(commands.ENTER_STOPPED);
    }

    /** Reset the device. */
    ResetDevice() {
        this._send(commands.RESET_NODE);
    }

    /** Reset device communication. */
    ResetCommunication() {
        this._send(commands.RESET_COMMUNICATION);
    }
}

module.exports=exports=NMT;