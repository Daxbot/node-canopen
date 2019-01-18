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
 * @param {RawChannel} channel - socketcan RawChannel object.
 */
class NMT {
    constructor(channel) {
        this.channel = channel;
    }

    /** Serve an NMT command.
     * @private
     * @param {commands} command - NMT command to serve.
     */
    _send(deviceId, command) {
        this.channel.send({
            id: 0x0,
            ext: false,
            rtr: false,
            data: Buffer.from([command, deviceId])
        });
    }

    get states() {
        return states;
    }

    get commands() {
        return commands;
    }

    /** Set the device to Pre Operational state. */
    PreOperational(deviceId) {
        this._send(deviceId, commands.ENTER_PRE_OPERATIONAL);
    }

    /** Set the device to Operational state. */
    Operational(deviceId) {
        this._send(deviceId, commands.ENTER_OPERATIONAL);
    }

    /** Set the device to Stopped state. */
    Stopped(deviceId) {
        this._send(deviceId, commands.ENTER_STOPPED);
    }

    /** Reset the device. */
    ResetDevice(deviceId) {
        this._send(deviceId, commands.RESET_NODE);
    }

    /** Reset device communication. */
    ResetCommunication(deviceId) {
        this._send(deviceId, commands.RESET_COMMUNICATION);
    }
}

module.exports=exports=NMT;