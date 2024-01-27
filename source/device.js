/**
 * @file Implements a CANopen device
 * @author Wilkins White
 * @copyright 2024 Daxbot
 */

const EventEmitter = require('events');
const { deprecate } = require('util');

const { Emcy } = require('./protocol/emcy');
const { Lss } = require('./protocol/lss');
const { Nmt, NmtState } = require('./protocol/nmt');
const { Pdo } = require('./protocol/pdo');
const { SdoClient } = require('./protocol/sdo_client');
const { SdoServer } = require('./protocol/sdo_server');
const { Sync } = require('./protocol/sync');
const { Time } = require('./protocol/time');
const { Eds, EdsError } = require('./eds');

/**
 * A CANopen device.
 *
 * This class represents a single addressable device (or node) on the bus.
 *
 * @param {object} args - arguments.
 * @param {Eds} args.eds - the device's electronic data sheet.
 * @param {number} [args.id] - device identifier [1-127].
 * @param {boolean} [args.loopback] - enable loopback mode.
 * @param {boolean} [args.enableLss] - enable layer setting services.
 */
class Device extends EventEmitter {
    constructor(args = {}) {
        super();

        if (typeof args.eds === 'string')
            this.eds = Eds.fromFile(args.eds);
        else
            this.eds = args.eds || new Eds();

        if (!Eds.isEds(this.eds))
            throw new EdsError('bad Eds');

        this.protocol = {
            emcy: new Emcy(this.eds),
            lss: new Lss(this.eds),
            nmt: new Nmt(this.eds),
            pdo: new Pdo(this.eds),
            sdoClient: new SdoClient(this.eds),
            sdoServer: new SdoServer(this.eds),
            sync: new Sync(this.eds),
            time: new Time(this.eds),
        };

        for (const obj of Object.values(this.protocol))
            obj.on('message', (m) => this.emit('message', m));

        if (args.id !== undefined) {
            if (args.id < 1 || args.id > 0x7F)
                throw RangeError('id must be in range [1-127]');

            this.id = args.id;
        }

        if (args.loopback) {
            this.on('message', (m) => {
                /* We use setImmediate here to allow the method that called
                 * send() to run to completion before receive() is processed.
                 */
                setImmediate(() => this.receive(m));
            });
        }

        if (args.enableLss === undefined)
            args.enableLss = this.eds.lssSupported;

        if (args.enableLss) {
            this.lss.on('changeDeviceId', (id) => this.id = id);
            this.lss.start();
        }

        this.nmt.on('reset', (resetNode) => this._onReset(resetNode));
        this.nmt.on('changeState', (state) => this._onChangeState(state));
    }

    /**
     * The device id.
     *
     * @type {number}
     */
    get id() {
        return this._id;
    }

    set id(value) {
        this._id = value;
        this.nmt.deviceId = value;
    }

    /**
     * The Nmt state.
     *
     * @type {NmtState}
     */
    get state() {
        return this.nmt.state;
    }

    /**
     * The Emcy module.
     *
     * @type {Emcy}
     */
    get emcy() {
        return this.protocol.emcy;
    }

    /**
     * The Lss module.
     *
     * @type {Lss}
     */
    get lss() {
        return this.protocol.lss;
    }

    /**
     * The Nmt module.
     *
     * @type {Nmt}
     */
    get nmt() {
        return this.protocol.nmt;
    }

    /**
     * The Pdo module.
     *
     * @type {Pdo}
     */
    get pdo() {
        return this.protocol.pdo;
    }

    /**
     * The Sdo (client) module.
     *
     * @type {SdoClient}
     */
    get sdo() {
        return this.protocol.sdoClient;
    }

    /**
     * The Sdo (server) module.
     *
     * @type {SdoClient}
     */
    get sdoServer() {
        return this.protocol.sdoServer;
    }

    /**
     * The Sync module.
     *
     * @type {Sync}
     */
    get sync() {
        return this.protocol.sync;
    }

    /**
     * The Time module.
     *
     * @type {Time}
     */
    get time() {
        return this.protocol.time;
    }

    /**
     * Manufacturer hardware version (Object 0x)
     */

    /**
     * Call with each incoming CAN message.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @param {number} message.len - CAN message length in bytes.
     */
    receive(message) {
        if (message.id == 0x0) {
            // Reserve COB-ID 0x0 for NMT
            this.nmt.receive(message);
        }
        else {
            for (const obj of Object.values(this.protocol))
                obj.receive(message);
        }
    }

    /**
     * Initialize the device and audit the object dictionary.
     */
    start() {
        if (!this.id)
            throw new Error('id must be set');

        this.nmt.start();
    }

    /**
     * Cleanup timers and shutdown the device.
     */
    stop() {
        for (const obj of Object.values(this.protocol))
            obj.stop();
    }

    /**
     * Map a remote node's EDS file on to this Device.
     *
     * This method provides an easy way to set up communication with another
     * device. Most EDS transmit/producer entries will be mapped to their local
     * receive/consumer analogues. Note that this method will heavily modify
     * the Device's internal EDS file.
     *
     * This may be called multiple times to map more than one EDS.
     *
     * @param {object} args - method arguments.
     * @param {number} args.deviceId - the remote node's CAN identifier.
     * @param {Eds | string} args.eds - the server's EDS.
     * @param {number} [args.dataStart] - start index for SDO entries.
     * @param {boolean} [args.skipEmcy] - Skip EMCY producer -> consumer.
     * @param {boolean} [args.skipNmt] - Skip NMT producer -> consumer.
     * @param {boolean} [args.skipPdo] - Skip PDO transmit -> receive.
     * @param {boolean} [args.skipSdo] - Skip SDO server -> client.
     * @since 6.0.0
     */
    mapRemoteNode(args = {}) {
        const deviceId = args.deviceId || args.id;

        let eds = args.eds;
        if (typeof eds === 'string')
            eds = Eds.fromFile(eds);

        if (!args.skipEmcy) {
            // Map EMCY producer -> consumer
            const cobId = eds.getEmcyCobId();
            if (cobId)
                this.eds.addEmcyConsumer(cobId);
        }

        if (!args.skipNmt) {
            // Map heartbeat producer -> consumer
            const ms = eds.getHeartbeatProducerTime();
            if (ms) {
                if (!args.id)
                    throw new ReferenceError('id not defined');

                this.eds.addHeartbeatConsumer(deviceId, ms * 2);
            }
        }

        if (!args.skipSdo) {
            for (const client of eds.getSdoServerParameters()) {

                const clientId = client.deviceId;
                if (clientId > 0 && clientId !== this.id)
                    continue;

                if (!deviceId)
                    throw new ReferenceError('deviceId not defined');

                const cobIdTx = client.cobIdRx; // client -> server
                const cobIdRx = client.cobIdTx; // server -> client

                this.eds.addSdoClientParameter(deviceId, cobIdTx, cobIdRx);
            }
        }

        if (!args.skipPdo) {
            let dataIndex = args.dataStart || 0x2000;
            if (dataIndex < 0x2000)
                throw new RangeError('dataStart must be >= 0x2000');

            const mapped = [];
            for (const pdo of eds.getTransmitPdos()) {

                const dataObjects = [];
                for (let obj of pdo.dataObjects) {
                    // Find the next open SDO index
                    while (this.eds.dataObjects[dataIndex] !== undefined) {
                        if (dataIndex >= 0xFFFF)
                            throw new RangeError('dataIndex must be <= 0xFFFF');

                        dataIndex += 1;
                    }

                    // If this is a subObject, then get the parent instead
                    const subIndex = obj.subIndex;
                    if (subIndex !== null)
                        obj = eds.getEntry(obj.index);

                    if (mapped.includes(obj.index))
                        continue; // Already mapped

                    mapped.push(obj.index);

                    // Add data object to device EDS
                    this.eds.addEntry(dataIndex, obj);
                    for (let j = 1; j < obj.subNumber; ++j)
                        this.eds.addSubEntry(dataIndex, j, obj[j]);

                    // Prepare to map the new data object
                    if (subIndex) {
                        dataObjects.push(
                            this.eds.getSubEntry(dataIndex, subIndex));
                    }
                    else {
                        dataObjects.push(
                            this.eds.getEntry(dataIndex));
                    }
                }

                pdo.dataObjects = dataObjects;
                this.eds.addReceivePdo(pdo);
            }
        }
    }

    /**
     * Get the value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @returns {number | bigint | string | Date} entry value.
     */
    getValue(index) {
        const entry = this.eds.getEntry(index);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index} does not exist`);
        }

        return entry.value;
    }

    /**
     * Get the value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - sub-object index.
     * @returns {number | bigint | string | Date} entry value.
     */
    getValueArray(index, subIndex) {
        const entry = this.eds.getSubEntry(index, subIndex);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index}[${subIndex}] does not exist`);
        }

        return entry.value;
    }

    /**
     * Get the raw value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @returns {Buffer} entry data.
     */
    getRaw(index) {
        const entry = this.eds.getEntry(index);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index} does not exist`);
        }

        return entry.raw;
    }

    /**
     * Get the raw value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - sub-object index.
     * @returns {Buffer} entry data.
     */
    getRawArray(index, subIndex) {
        const entry = this.eds.getSubEntry(index, subIndex);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index}[${subIndex}] does not exist`);
        }

        return entry.raw;
    }

    /**
     * Get the scale factor of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @returns {number | bigint | string | Date} entry value.
     */
    getScale(index) {
        const entry = this.eds.getEntry(index);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index} does not exist`);
        }

        return entry.scaleFactor;
    }

    /**
     * Get the scale factor of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - sub-object index.
     * @returns {number | bigint | string | Date} entry value.
     */
    getScaleArray(index, subIndex) {
        const entry = this.eds.getSubEntry(index, subIndex);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index}[${subIndex}] does not exist`);
        }

        return entry.scaleFactor;
    }

    /**
     * Set the value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number | bigint | string | Date} value - value to set.
     */
    setValue(index, value) {
        const entry = this.eds.getEntry(index);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index} does not exist`);
        }

        entry.value = value;
    }

    /**
     * Set the value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - array sub-index to set;
     * @param {number | bigint | string | Date} value - value to set.
     */
    setValueArray(index, subIndex, value) {
        const entry = this.eds.getSubEntry(index, subIndex);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index}[${subIndex}] does not exist`);
        }

        entry.value = value;
    }

    /**
     * Set the raw value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {Buffer} raw - raw Buffer to set.
     */
    setRaw(index, raw) {
        const entry = this.eds.getEntry(index);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index} does not exist`);
        }

        entry.raw = raw;
    }

    /**
     * Set the raw value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - sub-object index.
     * @param {Buffer} raw - raw Buffer to set.
     */
    setRawArray(index, subIndex, raw) {
        const entry = this.eds.getSubEntry(index, subIndex);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index}[${subIndex}] does not exist`);
        }

        entry.raw = raw;
    }

    /**
     * Set the scale factor of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} scaleFactor - value to set.
     * @since 6.0.0
     */
    setScale(index, scaleFactor) {
        const entry = this.eds.getEntry(index);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index} does not exist`);
        }

        entry.scaleFactor = scaleFactor;
    }

    /**
     * Set the scale factor of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - array sub-index to set;
     * @param {number} scaleFactor - value to set.
     * @since 6.0.0
     */
    setScaleArray(index, subIndex, scaleFactor) {
        const entry = this.eds.getSubEntry(index, subIndex);
        if (!entry) {
            if (typeof index === 'number')
                index = '0x' + index.toString(16);

            throw new EdsError(`entry ${index}[${subIndex}] does not exist`);
        }

        entry.scaleFactor = scaleFactor;
    }

    /**
     * Called on Nmt#reset.
     *
     * @param {boolean} resetNode - if true, then perform a full reset.
     * @listens Nmt#reset
     * @private
     */
    _onReset(resetNode) {
        if (resetNode)
            this.eds.reset();

        setImmediate(() => {
            // Stop all modules
            this.stop();

            // Re-start Nmt and transition to PRE_OPERATIONAL
            this.start();
        });
    }

    /**
     * Called on Nmt#changeState
     *
     * @param {NmtState} state - new nmt state.
     * @listens Nmt#changeState
     * @private
     */
    _onChangeState(state) {
        switch (state) {
            case NmtState.PRE_OPERATIONAL:
                // Start all...
                this.emcy.start();
                this.sdo.start();
                this.sdoServer.start();
                this.sync.start();
                this.time.start();

                // ... except Pdo
                this.pdo.stop();
                break;

            case NmtState.OPERATIONAL:
                // Start all
                this.emcy.start();
                this.sdo.start();
                this.sdoServer.start();
                this.sync.start();
                this.time.start();
                this.pdo.start();
                break;

            case NmtState.STOPPED:
                // Stop all except Nmt
                this.emcy.stop();
                this.sdo.stop();
                this.sdoServer.stop();
                this.sync.stop();
                this.time.stop();
                this.pdo.stop();
                break;
        }
    }
}

////////////////////////////////// Deprecated //////////////////////////////////

/**
 * Initialize the device and audit the object dictionary. Additionally this
 * method will enable deprecated Device level events.
 *
 * @deprecated Use {@link Device#start} instead.
 * @function
 */
Device.prototype.init = deprecate(
    function () {
        this.emcy.on('emergency', ({ cobId, em }) => {
            /**
             * Emcy object consumed (deprecated).
             *
             * This event needs to be enabled by calling
             * {@link Device#init} before it will fire.
             *
             * @event Device#emergency
             * @deprecated Use {@link Emcy#event:emergency} instead.
             */
            this.emit('emergency', (cobId & 0xF), em);
        });

        this.nmt.on('reset', (resetNode) => {
            if (resetNode) {
                /**
                 * NMT reset node (deprecated).
                 *
                 * This event needs to be enabled by calling
                 * {@link Device#init} before it will fire.
                 *
                 * @event Device#nmtResetNode
                 * @deprecated Use {@link Nmt#event:reset} instead.
                 */
                this.emit('nmtResetNode');
            }
            else {
                /**
                 * NMT reset communication (deprecated).
                 *
                 * This event needs to be enabled by calling
                 * {@link Device#init} before it will fire.
                 *
                 * @event Device#nmtResetCommunication
                 * @deprecated Use {@link Nmt#event:reset} instead.
                 */
                this.emit('nmtResetCommunication');
            }

            this._onReset(resetNode);
        });

        this.nmt.on('changeState', (state) => {
            /**
             * NMT state changed (deprecated).
             *
             * This event needs to be enabled by calling
             * {@link Device#init} before it will fire.
             *
             * @event Device#nmtChangeState
             * @deprecated Use {@link Nmt#event:changeState} or {@link Nmt#event:heartbeat} instead.
             */
            this.emit('nmtChangeState', this.deviceId, state);
            this._onChangeState(state);
        });

        this.nmt.on('timeout', (deviceId) => {
            /**
             * NMT consumer timeout (deprecated).
             *
             * This event needs to be enabled by calling
             * {@link Device#init} before it will fire.
             *
             * @event Device#nmtChangeState
             * @deprecated Use {@link Nmt#event:timeout} instead.
             */
            this.emit('nmtTimeout', deviceId);
        });

        this.nmt.on('heartbeat', (deviceId) => {
            this.nmt.getNodeState({ deviceId }).then((state) => {
                this.emit('nmtChangeState', deviceId, state);
            });
        });

        this.pdo.on('pdo', (pdo) => {
            /**
             * PDO received (deprecated).
             *
             * This event needs to be enabled by calling
             * {@link Device#init} before it will fire.
             *
             * @event Device#pdo
             * @deprecated Use {@link Pdo#event:pdo} instead.
             */
            this.emit('pdo', pdo.dataObjects, pdo.cobId);
        });

        this.sync.on('sync', (count) => {
            /**
             * Sync object consumed (deprecated).
             *
             * This event needs to be enabled by calling
             * {@link Device#init} before it will fire.
             *
             * @event Device#sync
             * @deprecated Use {@link Sync#event:sync} instead.
             */
            this.emit('sync', count);
        });

        this.time.on('time', (date) => {
            /**
             * Time object consumed (deprecated).
             *
             * This event needs to be enabled by calling
             * {@link Device#init} before it will fire.
             *
             * @event Device#time
             * @deprecated Use {@link Time#event:time} instead.
             */
            this.emit('time', date);
        });

        if(this.lss) {
            this.lss.on('changeMode', (mode) => {
                /**
                 * Change of LSS mode (deprecated).
                 *
                 * This event needs to be enabled by calling
                 * {@link Device#init} before it will fire.
                 *
                 * @event Device#lssChangeMode
                 * @deprecated Use {@link Lss#event:changeMode} instead.
                 */
                this.emit('lssChangeMode', mode);
            });

            this.lss.on('changeDeviceId', (id) => {
                /**
                 * Change of device id (deprecated).
                 *
                 * This event needs to be enabled by calling
                 * {@link Device#init} before it will fire.
                 *
                 * @event Device#lssChangeDeviceId
                 * @deprecated Use {@link Lss#event:changeDeviceId} instead.
                 */
                this.emit('lssChangeDeviceId', id);
            });
        }

        // Call start on the next loop to allow the channel to start.
        setImmediate(() => {
            this.start();
            this.nmt.startNode();
        });

    }, 'Device.init() is deprecated. Use Device.start() instead.');

/**
 * Set the send function.
 *
 * This method has been deprecated. Add a listener for the 'message' event
 * instead.
 *
 * @param {Function} send - send function.
 * @deprecated Use {@link https://nodejs.org/api/events.html#emitteroneventname-listener|Device.on('message')} instead.
 * @function
 */
Device.prototype.setTransmitFunction = deprecate(
    function (send) {
        this.on('message', send);
    }, "Device.setTransmitFunction() is deprecated. Use Device.on('message') instead.");

module.exports = exports = Device;
