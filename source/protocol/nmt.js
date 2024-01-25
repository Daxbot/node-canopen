/**
 * @file Implements the CANopen Network Managements (NMT) protocol.
 * @author Wilkins White
 * @copyright 2024 Daxbot
 */

const Protocol = require('./protocol');
const { DataObject, Eds, EdsError } = require('../eds');
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
        this.heartbeatMap = {};
        this.heartbeatTimers = {};
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
     * Producer heartbeat time in ms (Object 0x1017).
     *
     * @type {number}
     */
    get producerTime() {
        if (this._producerTime !== undefined)
            return this._producerTime;

        const obj1017 = this.eds.getEntry(0x1017);
        if (obj1017)
            return obj1017.value;

        return null;
    }

    set producerTime(value) {
        this._producerTime = value;
    }

    /**
     * Consumer heartbeat time (Object 0x1016).
     *
     * [{ deviceId, heartbeatTime } ... ]
     *
     * @type {Array<object>}
     * @since 6.0.0
     */
    get consumers() {
        const consumers = [];

        const obj1016 = this.eds.getEntry(0x1016);
        if (obj1016) {
            const maxSubIndex = obj1016[0].value;
            for (let i = 1; i <= maxSubIndex; ++i) {
                const subObj = obj1016.at(i);
                if(!subObj)
                    continue;

                const heartbeatTime = subObj.raw.readUInt16LE(0);
                const deviceId = subObj.raw.readUInt8(2);

                if (deviceId > 0 && deviceId <= 127)
                    consumers.push({ deviceId, heartbeatTime });
            }
        }

        return consumers;
    }

    /**
     * Begin heartbeat generation.
     *
     * @fires Protocol#start
     */
    start() {
        if (this.state !== NmtState.INITIALIZING)
            return;

        this.heartbeatMap = {};
        for (const { deviceId, heartbeatTime } of this.consumers) {
            this.heartbeatMap[deviceId] = {
                state: null,
                interval: heartbeatTime,
            };
        }

        const producerTime = this.producerTime;
        if (producerTime !== null) {
            if (producerTime === 0)
                throw new EdsError('producerTime may not be 0');

            // Start heartbeat timer
            this.heartbeatTimers[0] = setInterval(() => {
                if (this.deviceId)
                    this._sendHeartbeat(this.deviceId);
            }, producerTime);
        }

        this.state = NmtState.PRE_OPERATIONAL;
        super.start();
    }

    /**
     * Stop heartbeat generation.
     *
     * @fires Protocol#stop
     */
    stop() {
        for (const timer of Object.values(this.heartbeatTimers))
            clearTimeout(timer);

        this.state = NmtState.INITIALIZING;
        this.heartbeatTimers = {};
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
     * @since 6.0.0
     */
    getConsumerTime(deviceId) {
        const subObj = this.eds.getHeartbeatConsumer(deviceId);
        if (subObj)
            return subObj.raw.readUInt16LE(0);

        return null;
    }

    /**
     * Get a device's NMT state.
     *
     * @param {object} args - arguments.
     * @param {number} args.deviceId - CAN identifier (defaults to this device).
     * @param {boolean} args.fresh - if true, then wait for a fresh heartbeat.
     * @param {number} args.timeout - How long to wait for a new heartbeat (ms).
     * @returns {Promise<NmtState | null>} The node NMT state or null.
     * @since 6.0.0
     */
    async getNodeState({ deviceId, fresh, timeout }) {
        if (!deviceId || deviceId === this.deviceId)
            return this.state;

        if (!fresh && this.heartbeatMap[deviceId])
            return this.heartbeatMap[deviceId].state;

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
                const heartbeat = this.heartbeatMap[deviceId];
                if (heartbeat && heartbeat.last > start)
                    resolve(heartbeat.state);
                else
                    resolve(null);

                clearInterval(intervalTimer);
            }, timeout);

            intervalTimer = setInterval(() => {
                const heartbeat = this.heartbeatMap[deviceId];
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
            if (deviceId in this.heartbeatMap) {
                this.heartbeatMap[deviceId].last = Date.now();

                const newState = data[0];
                const oldState = this.heartbeatMap[deviceId].state;
                if (newState !== oldState)
                    this.heartbeatMap[deviceId].state = newState;

                if (!this.heartbeatTimers[deviceId]) {
                    // First heartbeat - start timer.
                    const interval = this.heartbeatMap[deviceId].interval;
                    this.heartbeatTimers[deviceId] = setTimeout(() => {
                        /**
                         * A consumer heartbeat timed out.
                         *
                         * @event Nmt#timeout
                         * @type {number}
                         */
                        this.emit('timeout', deviceId);
                        this.heartbeatMap[deviceId].state = null;
                        this.heartbeatTimers[deviceId] = null;
                    }, interval);

                    /**
                     * A consumer heartbeat was detected.
                     *
                     * @event Nmt#heartbeat
                     * @type {number}
                     */
                    this.emit('heartbeat', deviceId);
                }
                else {
                    this.heartbeatTimers[deviceId].refresh();
                }
            }
        }
    }

    /////////////////////////////// Private ////////////////////////////////

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
     * @param {number} deviceId - device identifier [1-127].
     * @fires Protocol#message
     * @private
     */
    _sendHeartbeat(deviceId) {
        this.send(0x700 + deviceId, Buffer.from([this.state]));
    }

    /**
     * Parse an NMT command.
     *
     * @param {NmtCommand} command - NMT command to handle.
     * @fires Nmt#reset
     * @private
     */
    _handleNmt(command) {
        switch (command) {
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
                this._emitReset(true);
                this.state = NmtState.INITIALIZING;
                break;
            case NmtCommand.RESET_COMMUNICATION:
                this._emitReset(true);
                this.state = NmtState.INITIALIZING;
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

    ////////////////////////////// Deprecated //////////////////////////////

    /**
     * Initialize the device and audit the object dictionary.
     *
     * @deprecated since 6.0.0
     */
    init() {
        deprecate(() => this.start(),
            'init() is deprecated. Use start() instead.');
    }

    /**
     * Get an entry from 0x1016 (Consumer heartbeat time).
     *
     * @param {number} deviceId - device COB-ID of the entry to get.
     * @returns {DataObject | null} the matching entry or null.
     * @deprecated since 6.0.0
     */
    getConsumer(deviceId) {
        return deprecate(() => {
            const obj1016 = this.getEntry(0x1016);
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
        }, 'getConsumer() is deprecated. Use getConsumerTime instead.');
    }

    /**
     * Add an entry to 0x1016 (Consumer heartbeat time).
     *
     * @param {number} deviceId - device COB-ID to add.
     * @param {number} timeout - milliseconds before a timeout is reported.
     * @param {number} [subIndex] - sub-index to store the entry, optional.
     * @deprecated since 6.0.0
     */
    addConsumer(deviceId, timeout, subIndex) {
        const opt = { subIndex };
        deprecate(() => this.eds.addHeartbeatConsumer(deviceId, timeout, opt),
            'addConsumer() is deprecated. Use Eds method instead.');

    }

    /**
     * Remove an entry from 0x1016 (Consumer heartbeat time).
     *
     * @param {number} deviceId - device COB-ID of the entry to remove.
     * @deprecated since 6.0.0
     */
    removeConsumer(deviceId) {
        deprecate(() => this.eds.removeHeartbeatConsumer(deviceId),
            'removeConsumer() is deprecated. Use Eds method isntead.');
    }
}

module.exports = exports = { NmtState, Nmt };
