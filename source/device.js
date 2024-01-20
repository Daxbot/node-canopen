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
const SdoClient = require('./protocol/sdo_client');
const SdoServer = require('./protocol/sdo_server');
const { Sync } = require('./protocol/sync');
const { Time } = require('./protocol/time');
const { Eds, EdsError } = require('./eds');
const { DataType } = require('./types');

/**
 * A CANopen device.
 *
 * This class represents a single addressable device (or node) on the bus and
 * provides methods for manipulating the object dictionary.
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
            this.eds = Eds.load(args.eds);
        else
            this.eds = args.eds || new Eds();

        if(!Eds.isEds(this.eds))
            throw new EdsError('bad Eds');

        this.protocol = {
            emcy: new Emcy(this.eds),
            nmt: new Nmt(this.eds),
            pdo: new Pdo(this.eds),
            sdoClient: new SdoClient(this.eds),
            sdoServer: new SdoServer(this.eds),
            sync: new Sync(this.eds),
            time: new Time(this.eds),
        };

        for(const obj of Object.values(this.protocol))
            obj.on('message', (m) => this.emit('message', m));

        if(args.id !== undefined)
            this.id = args.id;

        if (args.loopback) {
            this.on('message', (m) => {
                /* We use setImmediate here to allow the method that called
                 * send() to run to completion before receive() is processed.
                 */
                setImmediate(() => this.receive(m));
            });
        }

        if(args.enableLss === undefined)
            args.enableLss = this.eds.lssSupported;

        if(args.enableLss) {
            this.protocol.lss = new Lss(this.eds);
            this.lss.on('message', (m) => this.emit('message', m));
            this.lss.on('lssChangeDeviceId', (id) => this.id = id);
            this.lss.start();
        }

        this.nmt.on('nmtReset', (event) => this.nmtReset(event));
        this.nmt.on('nmtChangeState', (event) => this.nmtChangeState(event));
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
        if (value < 1 || value > 0x7F)
            throw RangeError('id must be in range [1-127]');

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
     * Call with each incoming CAN message.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @param {number} message.len - CAN message length in bytes.
     */
    receive(message) {
        if(message.id == 0x0) {
            // Reserve COB-ID 0x0 for NMT
            this.nmt.receive(message);
        }
        else {
            for(const obj of Object.values(this.protocol))
                obj.receive(message);
        }
    }

    /**
     * Initialize the device and audit the object dictionary.
     */
    start() {
        if(!this.id)
            throw new Error('id must be set');

        this.nmt.start();
    }

    /**
     * Cleanup timers and shutdown the device.
     */
    stop() {
        for(const obj of Object.values(this.protocol))
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
     * @param {object} options - optional arguments.
     * @param {Eds | string} options.eds - the server's EDS.
     * @param {number} options.deviceId - the remote node's CAN identifier.
     * @param {number} [options.dataStart] - start index for SDO entries.
     * @param {boolean} [options.skipEmcy] - Skip EMCY producer -> consumer.
     * @param {boolean} [options.skipNmt] - Skip NMT producer -> consumer.
     * @param {boolean} [options.skipPdo] - Skip PDO transmit -> receive.
     * @param {boolean} [options.skipSdo] - Skip SDO server -> client.
     */
    mapRemoteNode(options={}) {
        let eds = options.eds;
        if (typeof eds === 'string')
            eds = Eds.load(eds);

        if (!options.skipEmcy) {
            // Map EMCY producer -> consumer
            const cobId = eds.getEmcyCobId();
            if (cobId)
                this.eds.addEmcyConsumer(cobId);
        }

        if (!options.skipNmt) {
            // Map heartbeat producer -> consumer
            const producerTime = eds.getHeartbeatProducerTime();
            if (producerTime) {
                if (!options.deviceId)
                    throw new ReferenceError('deviceId not defined');

                this.eds.addHeartbeatConsumer({
                    deviceId: options.deviceId,
                    timeout: producerTime * 2
                });
            }
        }

        if (!options.skipSdo) {
            for(const parameter of eds.getSdoServerParameters()) {
                this.eds.addSdoClientParameter({
                    deviceId: parameter.deviceId,
                    cobIdTx: parameter.cobIdRx, // client -> server
                    cobIdRx: parameter.cobIdTx, // server -> client
                });
            }
        }

        if (!options.skipPdo) {
            let dataIndex = options.dataStart || 0x2000;
            if (dataIndex < 0x2000)
                throw new RangeError('dataStart must be >= 0x2000');

            const mapped = [];
            for(const pdo of Object.values(eds.getTransmitPdos())) {
                const dataObjects = [];
                for ( let obj of pdo.dataObjects) {
                    // Find the next open SDO index
                    while (this.eds.dataObjects[dataIndex] !== undefined) {
                        if (dataIndex >= 0xFFFF)
                            throw new RangeError('dataIndex must be <= 0xFFFF');

                        dataIndex += 1;
                    }

                    // If this is a subObject, then get the parent instead
                    const subIndex = obj.subIndex;
                    if(subIndex !== null)
                        obj = eds.getEntry(obj.index);

                    if(mapped.includes(obj.index))
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
     * Get "Device type" (0x1000).
     *
     * @param {number} [deviceId] - CAN identifier
     * @returns {Promise<string>} Device name string.
     */
    async getDeviceType(deviceId) {
        if (!deviceId || deviceId == this.id)
            return this.eds.getValue(0x1000);

        return this.sdo.upload({
            serverId: deviceId,
            index: 0x1000,
            dataType: DataType.UNSIGNED32,
        });
    }

    /**
     * Get "Manufacturer status register" (0x1002).
     *
     * @param {number} [deviceId] - CAN identifier
     * @returns {Promise<string>} Device name string.
     */
    async getStatusRegister(deviceId) {
        if (!deviceId || deviceId == this.id)
            return this.eds.getValue(0x1002);

        return this.sdo.upload({
            serverId: deviceId,
            index: 0x1002,
            dataType: DataType.UNSIGNED32,
        });
    }

    /**
     * Get "Manufacturer device name" (0x1008).
     *
     * @param {number} [deviceId] - CAN identifier
     * @returns {Promise<string>} Device name string.
     */
    async getDeviceName(deviceId) {
        if (!deviceId || deviceId == this.id)
            return this.eds.getValue(0x1008);

        return this.sdo.upload({
            serverId: deviceId,
            index: 0x1008,
            dataType: DataType.VISIBLE_STRING,
        });
    }

    /**
     * Get "Manufacturer hardware version" (0x1009).
     *
     * @param {number} [deviceId] - CAN identifier.
     * @returns {Promise<string>} Hardware version string.
     */
    async getHardwareVersion(deviceId) {
        if (!deviceId || deviceId == this.id)
            return this.eds.getValue(0x1009);

        return this.sdo.upload({
            serverId: deviceId,
            index: 0x1009,
            dataType: DataType.VISIBLE_STRING,
        });
    }

    /**
     * Get "Manufacturer software version" (0x100A).
     *
     * @param {number} [deviceId] - CAN identifier.
     * @returns {Promise<string>} Software version string.
     */
    async getSoftwareVersion(deviceId) {
        if (!deviceId || deviceId == this.id)
            return this.eds.getValue(0x100A);

        return this.sdo.upload({
            serverId: deviceId,
            index: 0x100A,
            dataType: DataType.VISIBLE_STRING,
        });
    }

    /**
     * Called on nmtReset.
     *
     * @param {boolean} resetApp - if true, then perform a full reset.
     * @private
     */
    nmtReset(resetApp) {
        if(resetApp)
            this.eds.reset();

        setImmediate(() => {
            // Stop all modules
            this.stop();

            // Re-start Nmt and transition to PRE_OPERATIONAL
            this.start();
        });
    }

    /**
     * Called on nmtChangeState
     *
     * @param {NmtState} newState - new nmt state.
     * @private
     */
    nmtChangeState({ deviceId, newState }) {
        if(deviceId === null || deviceId == this.id) {
            switch(newState) {
                case NmtState.PRE_OPERATIONAL:
                    // Start all...
                    this.protocol.emcy.start();
                    this.protocol.sdoClient.start();
                    this.protocol.sdoServer.start();
                    this.protocol.sync.start();
                    this.protocol.time.start();

                    // ... except Pdo
                    this.protocol.pdo.stop();
                    break;

                case NmtState.OPERATIONAL:
                    // Start all
                    this.protocol.emcy.start();
                    this.protocol.sdoClient.start();
                    this.protocol.sdoServer.start();
                    this.protocol.sync.start();
                    this.protocol.time.start();
                    this.protocol.pdo.start();
                    break;

                case NmtState.STOPPED:
                    // Stop all except Nmt
                    this.protocol.emcy.stop();
                    this.protocol.sdoClient.stop();
                    this.protocol.sdoServer.stop();
                    this.protocol.sync.stop();
                    this.protocol.time.stop();
                    this.protocol.pdo.stop();
                    break;
            }
        }
    }

    /**
     * Initialize the device and audit the object dictionary.
     *
     * @deprecated
     */
    init() {
        deprecate(() => this.start(),
            'init() is deprecated. Use start() instead.');
    }

    /**
     * Set the send function.
     *
     * This method has been deprecated. Add a listener for the 'message' event
     * instead.
     *
     * @param {Function} send - send function.
     * @deprecated
     */
    setTransmitFunction(send) {
        deprecate(() => this.on('message', (m) => send(m)),
            "setTransmitFunction is deprecated. Use on('message') instead");
    }

    /**
     * Get the value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @returns {number | bigint | string | Date} entry value.
     * @deprecated
     */
    getValue(index) {
        return deprecate(() => this.eds.getValue(index),
            'getValue() is deprecated. Use eds.getValue() instead.');
    }

    /**
     * Get the value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - sub-object index.
     * @returns {number | bigint | string | Date} entry value.
     * @deprecated
     */
    getValueArray(index, subIndex) {
        return deprecate(() => this.eds.getValueArray(index, subIndex),
            'getValueArray() is deprecated. Use eds.getValueArray() instead.');
    }

    /**
     * Get the raw value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @returns {Buffer} entry data.
     * @deprecated
     */
    getRaw(index) {
        return deprecate(() => this.eds.getRaw(index),
            'getRaw() is deprecated. Use eds.getRaw() instead.');
    }

    /**
     * Get the raw value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - sub-object index.
     * @returns {Buffer} entry data.
     * @deprecated
     */
    getRawArray(index, subIndex) {
        return deprecate(() => this.eds.getRawArray(index, subIndex),
            'getRawArray() is deprecated. Use eds.getRawArray() instead.');
    }

    /**
     * Set the value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number | bigint | string | Date} value - value to set.
     * @deprecated
     */
    setValue(index, value) {
        deprecate(() => this.eds.setValue(index, value),
            'setValue() is deprecated. Use eds.setValue() instead.');
    }

    /**
     * Set the value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - array sub-index to set;
     * @param {number | bigint | string | Date} value - value to set.
     * @deprecated
     */
    setValueArray(index, subIndex, value) {
        deprecate(() => this.eds.setValueArray(index, subIndex, value),
            'setValueArray() is deprecated. Use eds.setValueArray() instead.');
    }

    /**
     * Set the raw value of an EDS entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {Buffer} raw - raw Buffer to set.
     * @deprecated
     */
    setRaw(index, raw) {
        deprecate(() => this.eds.setRaw(index, raw),
            'setRaw() is deprecated. Use eds.setRaw() instead.');
    }

    /**
     * Set the raw value of an EDS sub-entry.
     *
     * @param {number | string} index - index or name of the entry.
     * @param {number} subIndex - sub-object index.
     * @param {Buffer} raw - raw Buffer to set.
     * @deprecated
     */
    setRawArray(index, subIndex, raw) {
        deprecate(() => this.eds.setRawArray(index, subIndex, raw),
            'setRawArray() is deprecated. Use eds.setRawArray() instead.');
    }
}

module.exports = exports = Device;
