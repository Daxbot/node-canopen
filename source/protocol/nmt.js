/**
 * @file Implements the CANopen Network Managements (NMT) protocol.
 * @author Wilkins White
 * @copyright 2021 Nova Dynamics LLC
 */

const Device = require('../device');
const { ObjectType, AccessType, DataType, DataObject } = require('../eds');

/**
 * NMT internal states.
 *
 * @enum {number}
 * @memberof Nmt
 */
const NmtState = {
    INITIALIZING: 0,
    PRE_OPERATIONAL: 127,
    OPERATIONAL: 5,
    STOPPED: 4,
};

/**
 * NMT commands.
 *
 * @enum {number}
 * @memberof Nmt
 */
const NmtCommand = {
    ENTER_OPERATIONAL: 1,
    ENTER_STOPPED: 2,
    ENTER_PRE_OPERATIONAL: 128,
    RESET_NODE: 129,
    RESET_COMMUNICATION: 130,
};

/**
 * CANopen NMT protocol handler.
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
 * @protected
 */
class Nmt {
    constructor(device) {
        this.device = device;
        this.heartbeatTimer = null;
        this.heartbeats = {};
        this._producerTime = 0;
        this._state = NmtState.INITIALIZING;
    }

    /**
     * Set the NMT state.
     *
     * @param {number} newState - NMT state.
     */
    set state(newState) {
        const oldState = this.state;
        if(newState != oldState) {
            this._state = newState;
            this.device.emit('nmtChangeState', newState, oldState);
        }
    }

    /**
     * Get the NMT state.
     *
     * @returns {number} - NMT state.
     */
    get state() {
        return this._state;
    }

    /**
     * Set producer heartbeat time.
     *
     * @param {number} time - heartbeat time (ms).
     */
    set producerTime(time) {
        let obj1017 = this.device.eds.getEntry(0x1017);
        if(obj1017 === undefined) {
            obj1017 = this.device.eds.addEntry(0x1017, {
                parameterName:  'Producer heartbeat time',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
                accessType:     AccessType.READ_WRITE,
            });
        }

        obj1017.value = time;
    }

    /**
     * Get producer heartbeat time.
     *
     * @returns {number} - heartbeat time (ms).
     */
    get producerTime() {
        return this._producerTime;
    }

    /** Initialize members and begin heartbeat monitoring. */
    init() {
        // Object 0x1016 - Consumer heartbeat time
        const obj1016 = this.device.eds.getEntry(0x1016);
        if(obj1016 !== undefined) {
            for(let i = 1; i <= obj1016[0].value; ++i) {
                const entry = obj1016[i];
                if(entry === undefined)
                    continue;

                this._parse1016(entry);
                entry.addListener('update', this._parse1016.bind(this));
            }
        }

        // Object 0x1017 - Producer heartbeat time
        const obj1017 = this.device.eds.getEntry(0x1017);
        if(obj1017 !== undefined) {
            this._parse1017(obj1017);
            obj1017.addListener('update', this._parse1017.bind(this));
        }

        this.device.addListener('message', this._onMessage.bind(this));
    }

    /** Begin heartbeat generation. */
    start() {
        if(this.producerTime == 0)
            throw TypeError('Producer heartbeat time can not be 0.')

        this.heartbeatTimer = setInterval(() => {
            this._sendHeartbeat();
        }, this.producerTime);
    }

    /** Stop heartbeat generation. */
    stop() {
        clearInterval(this.heartbeatTimer);
    }

    /**
     * Service: start remote node.
     *
     * Change the state of NMT slave(s) to NMT state operational.
     *
     * @param {number} nodeId - id of node or 0 for broadcast.
     * @see CiA301 "Service start remote node" (§7.2.8.2.1.2)
     */
    startNode(nodeId) {
        this._sendNmt(nodeId, NmtCommand.ENTER_OPERATIONAL);
    }

    /**
     * Service: stop remote node.
     *
     * Change the state of NMT slave(s) to NMT state stopped.
     *
     * @param {number} nodeId - id of node or 0 for broadcast.
     * @see CiA301 "Service stop remote node" (§7.2.8.2.1.3)
     */
    stopNode(nodeId) {
        this._sendNmt(nodeId, NmtCommand.ENTER_STOPPED);
    }

    /**
     * Service: enter pre-operational.
     *
     * Change the state of NMT slave(s) to NMT state pre-operational.
     *
     * @param {number} nodeId - id of node or 0 for broadcast.
     * @see CiA301 "Service enter pre-operational" (§7.2.8.2.1.4)
     */
    enterPreOperational(nodeId) {
        this._sendNmt(nodeId, NmtCommand.ENTER_PRE_OPERATIONAL);
    }

    /**
     * Service: reset node.
     *
     * Reset the application of NMT slave(s).
     *
     * @param {number} nodeId - id of node or 0 for broadcast.
     * @see CiA301 "Service reset node" (§7.2.8.2.1.5)
     */
    resetNode(nodeId) {
        this._sendNmt(nodeId, NmtCommand.RESET_NODE);
    }

    /**
     * Service: reset communication.
     *
     * Reset communication of NMT slave(s).
     *
     * @param {number} nodeId - id of node or 0 for broadcast.
     * @see CiA301 "Service reset communication" (§7.2.8.2.1.6)
     */
    resetCommunication(nodeId) {
        this._sendNmt(nodeId, NmtCommand.RESET_COMMUNICATION);
    }

    /**
     * Serve an NMT command object.
     *
     * @param {number} nodeId - id of node or 0 for broadcast.
     * @param {number} command - NMT command to serve.
     * @private
     */
    _sendNmt(nodeId, command) {
        if(nodeId == 0 || nodeId == this.device.id)
            this._handleNmt(command);

        this.device.send({
            id:     0x0,
            data:   Buffer.from([command, nodeId]),
        });
    }

    /**
     * Serve a Heartbeat object.
     *
     * @private
     */
    _sendHeartbeat() {
        this.device.send({
            id: 0x700 + this.device.id,
            data: Buffer.from([this.state])
        });
    }


    /**
     * Parse an NMT command.
     *
     * @param {number} command - NMT command to handle.
     * @private
     */
    _handleNmt(command) {
        switch(command) {
            case NmtCommand.ENTER_OPERATIONAL:
                this.state = NmtState.OPERATIONAL;
                break;
            case NmtCommand.ENTER_STOPPED:
                this.state = NmtState.STOPPED;
                break;
            case NmtCommand.ENTER_PRE_OPERATIONAL:
                this.state = NmtState.PRE_OPERATIONAL;
                break;
            case NmtCommand.RESET_NODE:
            case NmtCommand.RESET_COMMUNICATION:
                this.state = NmtState.INITIALIZING;
                break;
        }
    }

    /**
     * Called when a new CAN message is received.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @param {number} message.len - CAN message length in bytes.
     * @private
     */
    _onMessage(message) {
        if((message.id & 0x7FF) == 0x0) {
            const nodeId = message.data[1];
            if(nodeId == 0 || nodeId == this.device.id)
                this._handleNmt(message.data[0]);
        }
        else if((message.id & 0x700) == 0x700) {
            const deviceId = message.id & 0x7F;
            if(deviceId in this.heartbeats) {
                this.heartbeats[deviceId]['state'] = message.data[0];
                this.heartbeats[deviceId]['last'] = Date.now();

                if(!this.heartbeats[deviceId]['timer']) {
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

    /**
     * Called when 0x1016 (Consumer heartbeat time) is updated.
     *
     * @param {DataObject} data - updated DataObject.
     * @private
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

        const heartbeat = this.heartbeats[deviceId];
        if(heartbeat !== undefined) {
            heartbeat['interval'] = heartbeatTime;
            clearTimeout(heartbeat['timer']);
        }
        else {
            this.heartbeats[deviceId] = {
                state:      NmtState.INITIALIZING,
                interval:   heartbeatTime,
            }
        }
    }

    /**
     * Called when 0x1017 (Producer heartbeat time) is updated.
     *
     * @param {DataObject} data - updated DataObject.
     * @private
     */
    _parse1017(data) {
        this._producerTime = data.value;
    }
}

module.exports=exports={ NmtState, NmtCommand, Nmt };
