/**
 * @file Implements the CANopen Network Managements (NMT) protocol.
 * @author Wilkins White
 * @copyright 2021 Daxbot
 */

const Device = require('../device');
const { EdsError, DataObject } = require('../eds');
const { ObjectType, AccessType, DataType } = require('../types');

/**
 * NMT internal states.
 *
 * @enum {number}
 * @see CiA301 "NMT states" (§7.3.2.2)
 */
const NmtState = {
    /** The CANopen device's parameters are set to their power-on values. */
    INITIALIZING: 0,

    /**
     * Communication via SDOs is possible, but PDO communication is not
     * allowed. PDO configuration may be performed by the application.
     */
    PRE_OPERATIONAL: 127,

    /**
     * All communication objects are active. Access to certain aspects of the
     * application may be limited.
     */
    OPERATIONAL: 5,

    /** No communication except for node guarding and heartbeat.  */
    STOPPED: 4,
};

/**
 * NMT commands.
 *
 * @enum {number}
 * @see CiA301 "Node control protocols" (§7.2.8.3.1)
 * @private
 */
const NmtCommand = {
    /** Switch target device to {@link NmtState.OPERATIONAL}. */
    ENTER_OPERATIONAL: 1,

    /** Switch target device to {@link NmtState.STOPPED}. */
    ENTER_STOPPED: 2,

    /** Switch target device to {@link NmtState.PRE_OPERATIONAL}. */
    ENTER_PRE_OPERATIONAL: 128,

    /** Reset the target device. */
    RESET_NODE: 129,

    /** Reset the target device's communication. */
    RESET_COMMUNICATION: 130,
};

/**
 * CANopen NMT protocol handler.
 *
 * The network management (NMT) protocol follows a producer-consumer structure
 * where NMT objects are used to initialze, start, monitor, reset, or stop
 * nodes. All CANopen devices are considered NMT consumers with one device
 * fulfilling the role of NMT producer.
 *
 * This class implements the NMT node control services and tracks the device's
 * current NMT consumer state.
 *
 * @param {Device} device - parent device.
 * @see CiA301 "Network management" (§7.2.8)
 * @example
 * const can = require('socketcan');
 *
 * const channel = can.createRawChannel('can0');
 * const device = new Device({ id: 0xa });
 *
 * channel.addListener('onMessage', (message) => device.receive(message));
 * device.setTransmitFunction((message) => channel.send(message));
 *
 * device.init();
 * channel.start();
 *
 * device.nmt.producerTime = 500;
 * device.nmt.start();
 */
class Nmt {
    constructor(device) {
        this.device = device;
        this.heartbeats = {};
        this.timers = {};
        this._state = NmtState.INITIALIZING;
        this.started = false;
    }

    /**
     * Device NMT state.
     *
     * @type {NmtState}
     */
    get state() {
        return this._state;
    }

    set state(newState) {
        const oldState = this.state;
        if(newState !== oldState) {
            this._state = newState;
            this.device.emit('nmtChangeState', this.device.id, newState);
        }
    }

    /**
     * Producer heartbeat time in ms (Object 0x1017).
     *
     * @type {number}
     */
    get producerTime() {
        return this.device.getValue(0x1017);
    }

    set producerTime(value) {
        let obj1017 = this.device.eds.getEntry(0x1017);
        if(obj1017 === undefined) {
            obj1017 = this.device.eds.addEntry(0x1017, {
                parameterName:  'Producer heartbeat time',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
                accessType:     AccessType.READ_WRITE,
            });
        }

        obj1017.value = value;
    }

    /**
     * Get an entry from 0x1016 (Consumer heartbeat time).
     *
     * @param {number} deviceId - device COB-ID of the entry to get.
     * @returns {DataObject | null} the matching entry or null.
     */
    getConsumer(deviceId) {
        const obj1016 = this.device.eds.getEntry(0x1016);
        if(obj1016 !== undefined) {
            for(let i = 1; i <= obj1016._subObjects[0].value; ++i) {
                const subObject = obj1016._subObjects[i];
                if(subObject === undefined)
                    continue;

                if(((subObject.value >> 16) & 0x7F) === deviceId)
                    return subObject;
            }
        }

        return null;
    }

    /**
     * Get the consumer heartbeat time for a device.
     *
     * @param {number} deviceId - device COB-ID to get.
     * @returns {number | null} the consumer heartbeat time or null.
     */
    getConsumerTime(deviceId) {
        const subObject = this.getConsumer(deviceId);
        if(subObject !== null)
            return subObject.value & 0xffff;

        return null;
    }

    /**
     * Add an entry to 0x1016 (Consumer heartbeat time).
     *
     * @param {number} deviceId - device COB-ID to add.
     * @param {number} timeout - milliseconds before a timeout is reported.
     * @param {number} [subIndex] - sub-index to store the entry, optional.
     */
    addConsumer(deviceId, timeout, subIndex) {
        if(deviceId < 1 || deviceId > 0x7F)
            throw RangeError('deviceId must be in range [1-127]');

        if(timeout < 0 || timeout > 0xffff)
            throw RangeError('timeout must be in range [0-65535]');

        if(this.getConsumer(deviceId) !== null) {
            deviceId = '0x' + deviceId.toString(16);
            throw new EdsError(`NMT consumer ${deviceId} already exists`);
        }

        let obj1016 = this.device.eds.getEntry(0x1016);
        if(obj1016 === undefined) {
            obj1016 = this.device.eds.addEntry(0x1016, {
                parameterName:  'Consumer heartbeat time',
                objectType:     ObjectType.ARRAY,
            });
        }

        if(!subIndex) {
            // Find first empty index
            for(let i = 1; i <= 255; ++i) {
                if(obj1016[i] === undefined) {
                    subIndex = i;
                    break;
                }
            }
        }

        if(!subIndex)
            throw new EdsError('NMT consumer entry full');

        // Install sub entry
        this.device.eds.addSubEntry(0x1016, subIndex, {
            parameterName:  `Device 0x${deviceId.toString(16)}`,
            objectType:     ObjectType.VAR,
            dataType:       DataType.UNSIGNED32,
            accessType:     AccessType.READ_WRITE,
            defaultValue:   (deviceId << 16) | timeout,
        });
    }

    /**
     * Remove an entry from 0x1016 (Consumer heartbeat time).
     *
     * @param {number} deviceId - device COB-ID of the entry to remove.
     */
    removeConsumer(deviceId) {
        const subEntry = this.getConsumer(deviceId);
        if(subEntry === null)
            throw new EdsError(`NMT consumer ${deviceId} does not exist`);

        this.device.eds.removeSubEntry(0x1016, subEntry.subIndex);
    }

    /** Initialize members and begin heartbeat monitoring. */
    init() {
        // Object 0x1016 - Consumer heartbeat time
        let obj1016 = this.device.eds.getEntry(0x1016);
        if(obj1016 === undefined) {
            obj1016 = this.device.eds.addEntry(0x1016, {
                parameterName:  'Consumer heartbeat time',
                objectType:     ObjectType.ARRAY,
            });
        }
        else {
            this._parse1016(obj1016);
        }

        // Object 0x1017 - Producer heartbeat time
        let obj1017 = this.device.eds.getEntry(0x1017);
        if(obj1017 === undefined) {
            obj1017 = this.device.eds.addEntry(0x1017, {
                parameterName:  'Producer heartbeat time',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
                accessType:     AccessType.READ_WRITE,
            });
        }
        else {
            this._parse1017(obj1017);
        }

        obj1016.addListener('update', this._parse1016.bind(this));
        obj1017.addListener('update', this._parse1017.bind(this));


        this.device.addListener('message', this._onMessage.bind(this));
    }

    /** Begin heartbeat generation. */
    start() {
        if(this.producerTime == 0)
            throw new EdsError('producerTime must not be 0')

        // Switch to NmtState.OPERATIONAL
        this.startNode();

        // Start heartbeat timer
        this.timers[this.device.id] = setInterval(() => {
            this._sendHeartbeat();
        }, this.producerTime);

        this.started = true;
    }

    /** Stop heartbeat generation. */
    stop() {
        clearInterval(this.timers[this.device.id]);
        delete this.timers[this.device.id]
        this.started = false;
    }

    /**
     * Get a device's NMT state.
     *
     * @param {number} deviceId - CAN identifier.
     * @param {number} [timeout] - How long to wait (ms).
     * @returns {Promise<NmtState | null>} The node NMT state.
     */
    async getNodeState(deviceId, timeout) {
        let interval = this.getConsumerTime(deviceId);
        if(interval === null)
            throw new ReferenceError(`NMT consumer ${deviceId} does not exist`);

        if(!timeout)
            timeout = (interval * 2);

        return new Promise((resolve) => {
            const start = Date.now();

            let timeoutTimer = null;
            let intervalTimer = null;

            timeoutTimer = setTimeout(() => {
                const heartbeat = this.heartbeats[deviceId];
                if(heartbeat && heartbeat.last > start)
                    resolve(heartbeat.state);
                else
                    resolve(null);

                clearInterval(intervalTimer);
            }, timeout);

            intervalTimer = setInterval(() => {
                const heartbeat = this.heartbeats[deviceId];
                if(heartbeat && heartbeat.last > start) {
                    clearTimeout(timeoutTimer);
                    clearInterval(intervalTimer);
                    resolve(heartbeat.state);
                }
            }, (interval / 2));
        });
    }

    /**
     * Service: start remote node.
     *
     * Change the state of NMT consumer(s) to NMT state operational.
     *
     * @param {number} [nodeId] - id of node or 0 for broadcast.
     * @see CiA301 "Service start remote node" (§7.2.8.2.1.2)
     */
    startNode(nodeId) {
        this._sendNmt(nodeId, NmtCommand.ENTER_OPERATIONAL);
    }

    /**
     * Service: stop remote node.
     *
     * Change the state of NMT consumer(s) to NMT state stopped.
     *
     * @param {number} [nodeId] - id of node or 0 for broadcast.
     * @see CiA301 "Service stop remote node" (§7.2.8.2.1.3)
     */
    stopNode(nodeId) {
        this._sendNmt(nodeId, NmtCommand.ENTER_STOPPED);
    }

    /**
     * Service: enter pre-operational.
     *
     * Change the state of NMT consumer(s) to NMT state pre-operational.
     *
     * @param {number} [nodeId] - id of node or 0 for broadcast.
     * @see CiA301 "Service enter pre-operational" (§7.2.8.2.1.4)
     */
    enterPreOperational(nodeId) {
        this._sendNmt(nodeId, NmtCommand.ENTER_PRE_OPERATIONAL);
    }

    /**
     * Service: reset node.
     *
     * Reset the application of NMT consumer(s).
     *
     * @param {number} [nodeId] - id of node or 0 for broadcast.
     * @see CiA301 "Service reset node" (§7.2.8.2.1.5)
     */
    resetNode(nodeId) {
        this._sendNmt(nodeId, NmtCommand.RESET_NODE);
    }

    /**
     * Service: reset communication.
     *
     * Reset communication of NMT consumer(s).
     *
     * @param {number} [nodeId] - id of node or 0 for broadcast.
     * @see CiA301 "Service reset communication" (§7.2.8.2.1.6)
     */
    resetCommunication(nodeId) {
        this._sendNmt(nodeId, NmtCommand.RESET_COMMUNICATION);
    }

    /**
     * Serve an NMT command object.
     *
     * @param {number} nodeId - id of node or 0 for broadcast.
     * @param {NmtCommand} command - NMT command to serve.
     * @private
     */
    _sendNmt(nodeId, command) {
        if(nodeId === undefined || nodeId === this.device.id) {
            // Handle internally and return
            this._handleNmt(command);
            return;
        }

        if(nodeId === 0) {
            // Broadcast
            this._handleNmt(command);
        }

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
     * @param {NmtCommand} command - NMT command to handle.
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
                this.heartbeats[deviceId].last = Date.now();

                const state = message.data[0];
                if(state !== this.heartbeats[deviceId].state) {
                    this.heartbeats[deviceId].state = state;
                    this.device.emit('nmtChangeState', deviceId, state);
                }

                if(!this.timers[deviceId]) {
                    // First heartbeat - start timer.
                    const interval = this.heartbeats[deviceId].interval;
                    this.timers[deviceId] = setTimeout(() => {
                        this.device.emit('nmtTimeout', deviceId);
                        this.heartbeats[deviceId].state = null;
                        this.timers[deviceId] = null;
                    }, interval);
                }
                else {
                    this.timers[deviceId].refresh();
                }
            }
        }
    }

    /**
     * Called when 0x1016 (Consumer heartbeat time) is updated.
     *
     * @param {DataObject} entry - updated DataObject.
     * @private
     */
    _parse1016(entry) {
        /* Object 0x1016 - Consumer heartbeat time.
         *   sub-index 1+:
         *     bit 0..15    Heartbeat time in ms.
         *     bit 16..23   Node-ID of producer.
         *     bit 24..31   Reserved (0x00);
         */
        for(let i = 1; i <= entry[0].value; ++i) {
            const subEntry = entry[i];
            if(subEntry === undefined)
                continue;

            const heartbeatTime = subEntry.raw.readUInt16LE(0);
            const deviceId = subEntry.raw.readUInt8(2);

            if(this.heartbeats[deviceId] !== undefined) {
                /* Clear the timer - it will be re-initialized with the new
                 * interval on the next heartbeat message.
                 */
                this.heartbeats[deviceId].interval = heartbeatTime;
                clearTimeout(this.timers[deviceId]);
                this.timers[deviceId] = null;
            }
            else {
                this.heartbeats[deviceId] = {
                    state:      null,
                    interval:   heartbeatTime,
                }
            }
        }
    }

    /**
     * Called when 0x1017 (Producer heartbeat time) is updated.
     *
     * @param {DataObject} entry - updated DataObject.
     * @private
     */
    _parse1017(entry) {
        if(!this.started)
            return;

        // Clear old timer
        this.stop();

        // Start heartbeat timer with new interval
        const producerTime = entry.value;
        if(producerTime > 0) {
            this.timers[this.device.id] = setInterval(() => {
                this._sendHeartbeat();
            }, producerTime);
        }
    }
}

module.exports=exports={ NmtState, Nmt };
