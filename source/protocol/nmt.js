/**
 * @file Implements the CANopen Network Managements (NMT) protocol.
 * @author Wilkins White
 * @copyright 2024 Daxbot
 */

const Protocol = require('./protocol');
const { DataObject, Eds } = require('../eds');
const { deprecate } = require('util');

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
 * @param {Eds} eds - Eds object.
 * @see CiA301 "Network management" (§7.2.8)
 */
class Nmt extends Protocol {
    constructor(eds) {
        super();

        if (!Eds.isEds(eds))
            throw new TypeError('not an Eds');

        this.eds = eds;
        this.deviceId = null;
        this.consumers = {};
        this.timers = {};
        this._state = NmtState.INITIALIZING;
    }

    /**
     * Device NMT state.
     *
     * @type {NmtState}
     */
    get state() {
        return this._state;
    }

    set state(value) {
        this.setState(value);
    }

    /**
     * Get object 0x1017 - Producer heartbeat time.
     *
     * @returns {number} heartbeat time in ms.
     * @deprecated Use {@link Eds#getHeartbeatProducerTime} instead.
     */
    get producerTime() {
        return this.getHeartbeatProducerTime();
    }

    /**
     * Set object 0x1017 - Producer heartbeat time.
     *
     * @param {number} value - Producer heartbeat time in ms.
     * @deprecated Use {@link Eds#setHeartbeatProducerTime} instead.
     */
    set producerTime(value) {
        this.eds.setHeartbeatProducerTime(value);
    }

    /**
     * Begin heartbeat generation.
     *
     * @fires Protocol#start
     */
    start() {
        if (this.state !== NmtState.INITIALIZING)
            return;

        const obj1016 = this.eds.getEntry(0x1016);
        if(obj1016) {
            obj1016.on('update', (obj) => {
                if(obj.subIndex > 0) {
                    const heartbeatTime = obj.raw.readUInt16LE();
                    const deviceId = obj.raw.readUInt8(2);
                    this._startConsumer(deviceId, heartbeatTime);
                }
            });
        }

        const obj1017 = this.eds.getEntry(0x1017);
        if(obj1017) {
            obj1017.on('update', (obj) => this._startHeartbeat(obj.value));
            this._startHeartbeat(obj1017.value);
        }

        const consumers = this.eds.getHeartbeatConsumers();

        this.consumers = {};
        for (const { deviceId, heartbeatTime } of consumers)
            this._startConsumer(deviceId, heartbeatTime);

        this.state = NmtState.PRE_OPERATIONAL;
        super.start();
    }

    /**
     * Stop heartbeat generation.
     *
     * @fires Protocol#stop
     */
    stop() {
        for (const timer of Object.values(this.timers))
            clearTimeout(timer);

        this.state = NmtState.INITIALIZING;
        this.timers = {};
        super.stop();
    }

    /**
     * Set the Nmt state.
     *
     * @param {NmtState} state - new state.
     * @fires Nmt#changeState
     */
    setState(state) {
        if (state !== this._state) {
            this._state = state;

            /**
             * The Nmt state changed.
             *
             * @event Nmt#changeState
             * @type {NmtState}
             */
            this.emit('changeState', state);
        }
    }

    /**
     * Get the consumer heartbeat time for a device.
     *
     * @param {number} deviceId - device COB-ID to get.
     * @returns {number | null} the consumer heartbeat time or null.
     * @since 5.1.0
     */
    getConsumerTime(deviceId) {
        const obj1016 = this.eds.getEntry(0x1016);
        if (obj1016) {
            const maxSubIndex = obj1016[0].value;
            for (let i = 1; i <= maxSubIndex; ++i) {
                const subObj = obj1016.at(i);
                if (!subObj)
                    continue;

                if(deviceId === subObj.raw.readUInt8(2))
                    return subObj.raw.readUInt16LE(0);
            }
        }

        return null;
    }

    /**
     * Get a device's NMT state.
     *
     * @param {object} args - arguments.
     * @param {number} args.deviceId - CAN identifier (defaults to this device).
     * @param {number} args.timeout - How long to wait for a new heartbeat (ms).
     * @returns {Promise<NmtState | null>} The node NMT state or null.
     * @since 6.0.0
     */
    async getNodeState(...args) {
        let deviceId, timeout;
        if(typeof args[0] === 'object') {
            deviceId = args.deviceId;
            timeout = args.timeout;
        }
        else {
            deviceId = args[0];
            timeout = args[1];
        }

        if (!deviceId || deviceId === this.deviceId)
            return this.state;

        if (!timeout && this.consumers[deviceId])
            return this.consumers[deviceId].state;

        let interval = this.getConsumerTime(deviceId);
        if (interval === null)
            throw new ReferenceError(`NMT consumer ${deviceId} does not exist`);

        if (!timeout)
            timeout = (interval * 2);

        return new Promise((resolve) => {
            const start = Date.now();

            let timeoutTimer = null;
            let intervalTimer = null;

            timeoutTimer = setTimeout(() => {
                const heartbeat = this.consumers[deviceId];
                if (heartbeat && heartbeat.last > start)
                    resolve(heartbeat.state);
                else
                    resolve(null);

                clearInterval(intervalTimer);
            }, timeout);

            intervalTimer = setInterval(() => {
                const heartbeat = this.consumers[deviceId];
                if (heartbeat && heartbeat.last > start) {
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
     * @fires Protocol#message
     * @fires Nmt#changeState
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
     * @fires Protocol#message
     * @fires Nmt#changeState
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
     * @fires Protocol#message
     * @fires Nmt#changeState
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
     * @fires Protocol#message
     * @fires Nmt#reset
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
     * @fires Protocol#message
     * @fires Nmt#reset
     * @see CiA301 "Service reset communication" (§7.2.8.2.1.6)
     */
    resetCommunication(nodeId) {
        this._sendNmt(nodeId, NmtCommand.RESET_COMMUNICATION);
    }

    /**
     * Call when a new CAN message is received.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @fires Nmt#changeState
     * @fires Nmt#heartbeat
     * @fires Nmt#timeout
     */
    receive({ id, data }) {
        if ((id & 0x7FF) == 0x0) {
            const nodeId = data[1];
            if (nodeId == 0 || nodeId == this.deviceId)
                this._handleNmt(data[0]);
        }
        else if ((id & 0x700) == 0x700) {
            const deviceId = id & 0x7F;
            if (deviceId in this.consumers) {
                this.consumers[deviceId].last = Date.now();

                const state = data[0];
                const oldState = this.consumers[deviceId].state;
                if (state !== oldState) {
                    this.consumers[deviceId].state = state;

                    /**
                     * A consumer NMT state changed.
                     *
                     * @event Nmt#heartbeat
                     * @type {object}
                     * @property {number} deviceId - device identifier.
                     * @property {NmtState} state - new device NMT state.
                     */
                    this.emit('heartbeat', { deviceId, state });
                }

                if (!this.timers[deviceId]) {
                    // First heartbeat - start timer.
                    const interval = this.consumers[deviceId].interval;
                    this.timers[deviceId] = setTimeout(() => {
                        /**
                         * A consumer heartbeat timed out.
                         *
                         * @event Nmt#timeout
                         * @type {number}
                         */
                        this.emit('timeout', deviceId);
                        this.consumers[deviceId].state = null;
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
     * Serve an NMT command object.
     *
     * @param {number} nodeId - id of node or 0 for broadcast.
     * @param {NmtCommand} command - NMT command to serve.
     * @fires Protocol#message
     * @private
     */
    _sendNmt(nodeId, command) {
        if (nodeId === undefined) {
            // Handle internally and return
            this._handleNmt(command);
            return;
        }

        if (!nodeId) {
            // Broadcast
            this._handleNmt(command);
        }

        this.send(0x0, Buffer.from([command, nodeId]));
    }

    /**
     * Serve a Heartbeat object.
     *
     * @fires Protocol#message
     * @private
     */
    _sendHeartbeat() {
        if (this.deviceId && this.deviceId < 0x80)
            this.send(0x700 + this.deviceId, Buffer.from([this.state]));
    }

    /**
     * Parse an NMT command.
     *
     * @param {NmtCommand} command - NMT command to handle.
     * @fires Nmt#changeState
     * @fires Nmt#reset
     * @private
     */
    _handleNmt(command) {
        switch (command) {
            case NmtCommand.ENTER_OPERATIONAL:
                this.setState(NmtState.OPERATIONAL);
                break;
            case NmtCommand.ENTER_STOPPED:
                this.setState(NmtState.STOPPED);
                break;
            case NmtCommand.ENTER_PRE_OPERATIONAL:
                this.setState(NmtState.PRE_OPERATIONAL);
                break;
            case NmtCommand.RESET_NODE:
                this.setState(NmtState.INITIALIZING);
                this._emitReset(true);
                break;
            case NmtCommand.RESET_COMMUNICATION:
                this.setState(NmtState.INITIALIZING);
                this._emitReset(true);
                break;
        }
    }

    /**
     * Emit the reset event.
     *
     * @param {boolean} resetNode - true if a full reset was requested.
     * @fires Nmt#reset
     * @private
     */
    _emitReset(resetNode) {
        /**
         * A reset was requested.
         *
         * @event Nmt#reset
         * @type {boolean}
         */
        this.emit('reset', resetNode);
    }

    /**
     * Start producing the heartbeat message.
     *
     * @param {number} producerTime - producer heartbeat time in ms.
     * @private
     */
    _startHeartbeat(producerTime) {
        if(this.timers[0]) {
            clearInterval(this.timers[0]);
            delete this.timers[0];
        }

        if (producerTime > 0) {
            // Start heartbeat timer
            this.timers[0] = setInterval(
                () => this._sendHeartbeat(), producerTime);
        }
    }

    /**
     * Initialize a heartbeat consumer.
     *
     * @param {number} deviceId - device identifier.
     * @param {number} heartbeatTime - consumer heartbeat time in ms.
     */
    _startConsumer(deviceId, heartbeatTime) {
        if(this.timers[deviceId]) {
            clearInterval(this.timers[deviceId]);
            delete this.timers[deviceId];
        }

        this.consumers[deviceId] = {
            state: null,
            interval: heartbeatTime,
        };
    }
}

////////////////////////////////// Deprecated //////////////////////////////////

/**
 * Initialize the device and audit the object dictionary.
 *
 * @deprecated Use {@link Nmt#start} instead.
 * @function
 */
Nmt.prototype.init = deprecate(
    function () {
        const { ObjectType, DataType } = require('../types');

        let obj1016 = this.eds.getEntry(0x1016);
        if(obj1016 === undefined) {
            obj1016 = this.eds.addEntry(0x1016, {
                parameterName:  'Consumer heartbeat time',
                objectType:     ObjectType.ARRAY,
            });
        }

        let obj1017 = this.eds.getEntry(0x1017);
        if(obj1017 === undefined) {
            obj1017 = this.eds.addEntry(0x1017, {
                parameterName:  'Producer heartbeat time',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
            });
        }

        this.start();
    }, 'Nmt.init() is deprecated. Use Nmt.start() instead.');

/**
 * Get an entry from 0x1016 (Consumer heartbeat time).
 *
 * @param {number} deviceId - device COB-ID of the entry to get.
 * @returns {DataObject | null} the matching entry or null.
 * @deprecated Use {@link Nmt#getConsumerTime} instead.
 * @function
 */
Nmt.prototype.getConsumer = deprecate(
    function (deviceId) {
        const obj1016 = this.eds.getEntry(0x1016);
        if (obj1016) {
            const maxSubIndex = obj1016[0].value;
            for (let i = 1; i <= maxSubIndex; ++i) {
                const subObj = obj1016.at(i);
                if (!subObj)
                    continue;

                if (subObj.raw.readUInt8(2) === deviceId)
                    return subObj;
            }
        }

        return null;
    }, 'Nmt.getConsumer() is deprecated. Use Nmt.getConsumerTime() instead.');

/**
 * Add an entry to 0x1016 (Consumer heartbeat time).
 *
 * @param {number} deviceId - device COB-ID to add.
 * @param {number} timeout - milliseconds before a timeout is reported.
 * @param {number} [subIndex] - sub-index to store the entry, optional.
 * @deprecated Use {@link Eds#addHeartbeatConsumer} instead.
 * @function
 */
Nmt.prototype.addConsumer = deprecate(
    function (deviceId, timeout, subIndex) {
        this.eds.addHeartbeatConsumer(deviceId, timeout, { subIndex });
    }, 'Nmt.addConsumer() is deprecated. Use Eds.addConsumer() instead.');

/**
 * Remove an entry from 0x1016 (Consumer heartbeat time).
 *
 * @param {number} deviceId - device COB-ID of the entry to remove.
 * @deprecated Use {@link Eds#removeHeartbeatConsumer} instead.
 * @function
 */
Nmt.prototype.removeConsumer = deprecate(
    function (deviceId) {
        this.eds.removeHeartbeatConsumer(deviceId);
    }, 'Nmt.removeConsumer() is deprecated. Use Eds.removeHeartbeatConsumer() instead.');

module.exports = exports = { NmtState, Nmt };
