const {EDS} = require('../eds');

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
 * @memberof Device
 */
class NMT {
    constructor(device) {
        this._device = device;
        this._producerTime = 0;
        this._state = states.INITIALIZING;
        this._heartbeatTimer = null;
        this._heartbeats = {};
    }

    /** Set the NMT state.
     * @param {number} newState - NMT state.
     */
    set state(newState) {
        const oldState = this.state;
        if(newState != oldState) {
            this._state = newState;
            this._device.emit('nmtChangeState', newState, oldState);
        }
    }

    /** Get the NMT state.
     * @return {number} - NMT state.
     */
    get state() {
        return this._state;
    }

    /** Set producer heartbeat time.
     * @param {number} time - heartbeat time (ms).
     */
    set producerTime(time) {
        let obj1017 = this._device.EDS.getEntry(0x1017);
        if(obj1017 === undefined) {
            obj1017 = this._device.EDS.addEntry(0x1017, {
                ParameterName:      'Producer heartbeat time',
                ObjectType:         EDS.objectTypes.VAR,
                DataType:           EDS.dataTypes.UNSIGNED32,
                AccessType:         EDS.accessTypes.READ_WRITE,
            });
        }

        obj1017.value = time;
    }

    /** Get producer heartbeat time.
     * @return {number} - heartbeat time (ms).
     */
    get producerTime() {
        return this._producerTime;
    }

    /** Initialize members and begin heartbeat monitoring. */
    init() {
        /* Object 0x1016 - Consumer heartbeat time. */
        const obj1016 = this._device.EDS.getEntry(0x1016);
        if(obj1016) {
            for(let i = 1; i <= obj1016[0].value; ++i) {
                const entry = obj1016[i];
                if(entry === undefined)
                    continue;

                this._parse1016(entry);
                entry.addListener('update', this._parse1016.bind(this));
            }
        }

        /* Object 0x1017 - Producer heartbeat time. */
        const obj1017 = this._device.EDS.getEntry(0x1017);
        if(obj1017) {
            this._parse1017(obj1017);
            obj1017.addListener('update', this._parse1017.bind(this));
        }

        this._device.addListener('message', this._onMessage.bind(this));
    }

    /** Begin heartbeat generation. */
    start() {
        if(this.producerTime == 0)
            throw TypeError('Producer heartbeat time can not be 0.')

        this._heartbeatTimer = setInterval(() => {
            this._sendHeartbeat();
        }, this.producerTime);
    }

    /** Stop heartbeat generation. */
    stop() {
        clearInterval(this._heartbeatTimer);
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

    /** Serve an NMT command object.
     * @private
     * @param {number} command - NMT command to serve.
     */
    _sendNMT(nodeId, command) {
        if(nodeId == 0 || nodeId == this._device.id)
            this._handleNMT(command);

        this._device.send({
            id:     0x0,
            data:   Buffer.from([command, nodeId]),
        });
    }

    /** Serve a Heartbeat object.
     * @private
     */
    _sendHeartbeat() {
        this._device.send({
            id: 0x700 + this._device.id,
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

    /** Called when a new CAN message is received.
     * @private
     * @param {Object} message - CAN frame.
     */
    _onMessage(message) {
        if((message.id & 0x7FF) == 0x0) {
            const nodeId = message.data[1];
            if(nodeId == 0 || nodeId == this._device.id)
                this._handleNMT(message.data[0]);
        }
        else if((message.id & 0x700) == 0x700) {
            const deviceId = message.id & 0x7F;
            if(deviceId in this._heartbeats) {
                this._heartbeats[deviceId]['state'] = message.data[0];
                this._heartbeats[deviceId]['last'] = Date.now();

                if(!this._heartbeats[deviceId]['timer']) {
                    /* First heartbeat - start timer. */
                    const interval = this._heartbeats[deviceId]['interval'];
                    this._heartbeats[deviceId]['timer'] = setTimeout(() => {
                        this._device.emit("nmtTimeout",
                            deviceId, this._heartbeats[deviceId]);
                        this._heartbeats[deviceId]['timer'] = null;
                    }, interval);
                }
                else {
                    this._heartbeats[deviceId]['timer'].refresh();
                }
            }
        }
    }

    /** Called when 0x1016 (Consumer heartbeat time) is updated.
     * @private
     * @param {DataObject} data - updated DataObject.
     */
    _parse1016(data) {
        /* Object 0x1016 - Consumer heartbeat time.
         *   sub-index 1+:
         *     bit 0..15    Heartbeat time in ms.
         *     bit 16..23   Node-ID of producer.
         *     bit 24..31   Reserved (0x00);
         */
        const heartbeatTime = data.raw.readUInt16LE(0);
        const deviceId = data.raw.readUInt8(2);

        const heartbeat = this._heartbeats[deviceId];
        if(heartbeat !== undefined) {
            heartbeat['interval'] = heartbeatTime;
            clearTimeout(heartbeat['timer']);
        }
        else {
            this._heartbeats[deviceId] = {
                state:      states.INITIALIZING,
                interval:   heartbeatTime,
            }
        }
    }

    /** Called when 0x1017 (Producer heartbeat time) is updated.
     * @private
     * @param {DataObject} data - updated DataObject.
     */
    _parse1017(data) {
        this._producerTime = data.value;
    }
}

module.exports=exports=NMT;
