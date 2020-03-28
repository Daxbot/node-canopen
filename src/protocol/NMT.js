/** NMT internal states.
 * @private
 * @const {number}
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
 */
const commands = {
    ENTER_OPERATIONAL: 1,
    ENTER_STOPPED: 2,
    ENTER_PRE_OPERATIONAL: 128,
    RESET_NODE: 129,
    RESET_COMMUNICATION: 130,
 };

/** CANopen NMT protocol handler.
 *
 * The network management (NMT) protocol follows a master-slave structure where
 * NMT objects are used to initialze, start, monitor, reset, or stop nodes. All
 * CANopen devices are considered NMT slaves with one device fulfilling the
 * role of NMT master.
 *
 * This class implements the NMT node control services and tracks the device's
 * current NMT slave state.
 *
 * @param {Device} device - parent device.
 * @see CiA301 "Network management" (§7.2.8)
 */
class NMT {
    constructor(device) {
        this.device = device;
        this._state = states.INITIALIZING;
        this.heartbeatTimer = null;
        this.heartbeats = {};
    }

    /** Begin heartbeat monitoring. */
    init() {
        /* Object 0x1016 - Consumer heartbeat time.
         *   sub-index 0:
         *     bit 0..7     Highest sub-index supported.
         *
         *   sub-index 1+:
         *     bit 0..15    Heartbeat time in ms.
         *     bit 16..23   Node-ID of producer.
         *     bit 24..31   Reserved (0x00);
         */
        const obj1016 = this.device.EDS.getEntry(0x1016);
        if(obj1016) {
            for(let i = 1; i < obj1016.SubNumber + 1; ++i) {
                const heartbeatTime = obj1016[i].raw.readUInt16LE(0);
                const deviceId = obj1016[i].raw.readUInt8(2);
                this.heartbeats[deviceId] = {
                    state:      states.INITIALIZING,
                    interval:   heartbeatTime,
                    last:       null,
                    timer:      null,
                }
                obj1016[i].addListener('update', this._update1016);
            }
        }
        this.device.channel.addListener('onMessage', this._onMessage, this);
    }

    /** Begin heartbeat generation. */
    start() {
        /* Object 0x1017 - Producer heartbeat time. */
        const obj1017 = this.device.EDS.getEntry(0x1017);
        if(!obj1017)
            throw ReferenceError('0x1017 is required for heartbeat generation.');

        const heartbeatTime = obj1017.value;
        if(heartbeatTime == 0)
            throw TypeError('Heartbeat generation is disabled by 0x1017.')

        this.heartbeatTimer = setInterval(() => {
            this._sendHeartbeat();
        }, heartbeatTime);
    }

    /** Stop heartbeat generation. */
    stop() {
        clearInterval(this.heartbeatTimer);
    }

    /** Returns the device's NMT operational state. */
    get state() {
        return this._state;
    }

    /** Sets the device's NMT operational state. */
    set state(newState) {
        const oldState = this._state;
        this._state = newState;

        if(newState != oldState)
            this.device.emit('nmtChangeState', newState, oldState);
    }

    /** Service: start remote node.
     *
     * Change the state of NMT slave(s) to NMT state operational.
     * @param {number} nodeId - id of node or 0 for all.
     * @see CiA301 "Service start remote node" (§7.2.8.2.1.2)
     */
    startNode(nodeId) {
        this._sendNMT(nodeId, commands.ENTER_OPERATIONAL);
    }

    /** Service: stop remote node.
     *
     * Change the state of NMT slave(s) to NMT state stopped.
     * @param {number} nodeId - id of node or 0 for all.
     * @see CiA301 "Service stop remote node" (§7.2.8.2.1.3)
     */
    stopNode(nodeId) {
        this._sendNMT(nodeId, commands.ENTER_STOPPED);
    }

    /** Service: enter pre-operational.
     *
     * Change the state of NMT slave(s) to NMT state pre-operational.
     * @param {number} nodeId - id of node or 0 for all.
     * @see CiA301 "Service enter pre-operational" (§7.2.8.2.1.4)
     */
    enterPreOperational(nodeId) {
        this._sendNMT(nodeId, commands.ENTER_PRE_OPERATIONAL);
    }

    /** Service: reset node.
     *
     * Reset the application of NMT slave(s).
     * @param {number} nodeId - id of node or 0 for all.
     * @see CiA301 "Service reset node" (§7.2.8.2.1.5)
     */
    resetNode(nodeId) {
        this._sendNMT(nodeId, commands.RESET_NODE);
    }

    /** Service: reset communication.
     *
     * Reset communication of NMT slave(s).
     * @param {number} nodeId - id of node or 0 for all.
     * @see CiA301 "Service reset communication" (§7.2.8.2.1.6)
     */
    resetCommunication(nodeId) {
        this._sendNMT(nodeId, commands.RESET_COMMUNICATION);
    }

    /** Serve an NMT command object to the channel.
     * @private
     * @param {number} command - NMT command to serve.
     */
    _sendNMT(nodeId, command) {
        if(nodeId == this.device.id)
            this._handleNMT(command);

        this.device.channel.send({
            id:     0x0,
            data:   Buffer.from([nodeId, command]),
        });
    }

    /** Serve a Heartbeat object to the channel.
     * @private
     */
    _sendHeartbeat() {
        this.device.channel.send({
            id: 0x700 + this.device.id,
            data: Buffer.from([this.state])
        });
    }


    /** Parse an NMT command.
     * @private
     * @param {number} command - NMT command to handle.
     */
    _handleNMT(command) {
        switch(command) {
            case commands.ENTER_OPERATIONAL:
                this.state = states.OPERATIONAL;
                break;
            case commands.ENTER_STOPPED:
                this.state = states.STOPPED;
                break;
            case commands.ENTER_PRE_OPERATIONAL:
                this.state = states.PRE_OPERATIONAL;
                break;
            case commands.RESET_NODE:
            case commands.RESET_COMMUNICATION:
                this.state = states.INITIALIZING;
                break;
        }
    }

    /** socketcan 'onMessage' listener.
     * @private
     * @param {Object} message - CAN frame.
     */
    _onMessage(message) {
        if(!message)
            return;

        if((message.id & 0x7FF) == 0x0) {
            if(message.data[1] != this.device.id)
                this._handleNMT(message.data[0]);
        }
        else if((message.id & 0x700) == 0x700) {
            const deviceId = message.id & 0x7F;
            if(deviceId in this.heartbeats) {
                this.heartbeats[deviceId]['state'] = message.data[0];
                this.heartbeats[deviceId]['last'] = Date.now();

                if(this.heartbeats[deviceId]['timer'] === null) {
                    /* First heartbeat - start timer. */
                    const interval = this.heartbeats[deviceId]['interval'];
                    this.heartbeats[deviceId]['timer'] = setTimeout(() => {
                        this.device.emit("nmtTimeout",
                            deviceId, this.heartbeats[deviceId]);
                        this.heartbeats[deviceId]['timer'] = null;
                    }, interval);
                }
                else {
                    this.heartbeats[deviceId]['timer'].refresh();
                }
            }
        }
    }

    /** Called when 0x1016 (Consumer heartbeat time) is updated.
     * @private
     * @param {DataObject} data - updated DataObject.
     */
    _update1016(data) {
        const heartbeatTime = data.raw.readUInt16LE(0);
        const deviceId = data.raw.readUInt8(2);

        this.heartbeats[deviceId]['interval'] = heartbeatTime;
        clearTimeout(this.heartbeats[deviceId]['timer']);
    }
}

module.exports=exports=NMT;
