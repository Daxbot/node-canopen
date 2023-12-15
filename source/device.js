/**
 * @file Implements a CANopen device
 * @author Wilkins White
 * @copyright 2021 Daxbot
 */

const EventEmitter = require('events');
const { Emcy } = require('./protocol/emcy');
const { Lss } = require('./protocol/lss');
const { Nmt } = require('./protocol/nmt');
const { Pdo } = require('./protocol/pdo');
const SdoClient = require('./protocol/sdo_client');
const SdoServer = require('./protocol/sdo_server');
const { Sync } = require('./protocol/sync');
const { Time } = require('./protocol/time');
const { Eds, EdsError, DataObject } = require('./eds');
const { DataType } = require('./types');

/**
 * A CANopen device.
 *
 * This class represents a single addressable device (or node) on the bus and
 * provides methods for manipulating the object dictionary.
 *
 * @param {object} args - arguments.
 * @param {number} args.id - device identifier [1-127].
 * @param {Eds} args.eds - the device's electronic data sheet.
 * @param {boolean} args.loopback - enable loopback mode.
 * @fires 'message' on receiving a CAN message.
 * @fires 'emergency' on consuming an emergency object.
 * @fires 'lssChangeMode' on change of LSS mode.
 * @fires 'lssChangeDeviceId' on change of device id.
 * @fires 'nmtTimeout' on missing a tracked heartbeat.
 * @fires 'nmtChangeState' on change of NMT state.
 * @fires 'nmtResetNode' on NMT reset node.
 * @fires 'nmtResetCommunication' on NMT reset communication.
 * @fires 'sync' on consuming a synchronization object.
 * @fires 'time' on consuming a time stamp object.
 * @fires 'pdo' on updating a mapped pdo object.
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
 */
class Device extends EventEmitter {
    constructor(args = {}) {
        super();

        this._id = null;
        if (args.id !== undefined)
            this.id = args.id;

        this._send = null;

        if (args.loopback) {
            this.setTransmitFunction((message) => {
                /* We use setImmediate here to allow the method that called
                 * send() to run to completion before receive() is processed.
                 */
                setImmediate(() => this.receive(message));
            });
        }

        if (typeof args.eds === 'string')
            this.eds = new Eds(args.eds);
        else
            this.eds = args.eds || new Eds();

        this.emcy = new Emcy(this);
        this.lss = new Lss(this);
        this.nmt = new Nmt(this);
        this.pdo = new Pdo(this);
        this.sdo = new SdoClient(this);
        this.sdoServer = new SdoServer(this);
        this.sync = new Sync(this);
        this.time = new Time(this);
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
            throw RangeError("id must be in range [1-127]");

        this._id = value;
    }

    /**
     * The device's DataObjects.
     *
     * @type {Array<DataObject>}
     */
    get dataObjects() {
        return this.eds.dataObjects;
    }

    /**
     * Set the send function.
     *
     * @param {Function} send - send function.
     */
    setTransmitFunction(send) {
        this._send = send;
    }

    /** Initialize the device and audit the object dictionary. */
    init() {
        this.emcy.init();
        this.lss.init();
        this.nmt.init();
        this.pdo.init();
        this.sdo.init();
        this.sdoServer.init();
        this.sync.init();
        this.time.init();
    }

    /**
     * Called with each outgoing CAN message. This method should not be called
     * directly - use the protocol objects instead.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @param {number} message.len - CAN message length in bytes.
     * @returns {number} number of bytes sent or -1 for error
     * @protected
     */
    send(message) {
        if (this._send === null)
            throw ReferenceError("call setTransmitFunction() first");

        return this._send(message);
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
        if (message)
            this.emit('message', message);
    }

    /*
     * Map another node's EDS file on to this Device.
     *
     * This method provides an easy way to set up communication with a remote
     * node. Most EDS transmit/producer entries will be mapped to their local
     * receive/consumer analogues. Note that this method will heavily modify
     * the Device's internal EDS file.
     *
     * This may be called multiple times to map more than one EDS.
     *
     * @param {object} obj - function arguments.
     * @param {Eds | string} obj.eds - the server's EDS.
     * @param {number} [obj.serverId] - the server's CAN identifier.
     * @param {number} [obj.dataStart] - start index for created SDO entries.
     * @param {boolean} [obj.mapNmt] - Map EMCY producer -> consumer.
     * @param {boolean} [obj.mapNmt] - Map NMT producer -> consumer.
     * @param {boolean} [obj.mapPdo] - Map PDO transmit -> receive.
     * @param {boolean} [obj.mapSdo] - Map SDO server -> client.
     */
    mapEds({
        eds,
        serverId,
        dataStart,
        mapEmcy = true,
        mapNmt = true,
        mapPdo = true,
        mapSdo = true,
    }) {

        if (!eds)
            throw new ReferenceError('eds not defined');

        if (typeof eds === 'string')
            eds = new Eds(eds);

        let dataIndex = dataStart || 0x2000;
        if (dataIndex < 0x2000)
            throw new RangeError('dataStart must be >= 0x2000');

        if (mapEmcy) {
            // Map EMCY producer -> consumer
            const obj1014 = eds.getEntry(0x1014);
            if (obj1014 !== undefined)
                this.emcy.addConsumer(obj1014.value);
        }

        if (mapNmt) {
            // Map heartbeat producer -> consumer
            const obj1017 = eds.getEntry(0x1017);
            if (obj1017 !== undefined) {
                if (!serverId)
                    throw new Error('serverId not defined');

                this.nmt.addConsumer(serverId, obj1017.value * 10);
            }
        }

        for (let [index, entry] of Object.entries(eds.dataObjects)) {
            index = parseInt(index);
            if ((index & 0xFF80) == 0x1200) {
                if (!mapSdo)
                    continue;

                // Parse SDO servers [0x1200, 0x127F]
                const cobIdTx = entry[1].value;
                const cobIdRx = entry[2].value;

                if (!cobIdTx || !cobIdRx)
                    throw new Error('invalid SDO server parameter');

                if (!serverId)
                    throw new Error('serverId not defined');

                this.sdo.addServer(serverId, cobIdTx, cobIdRx);
            }
            else if ((index & 0xFF00) == 0x1800 || (index & 0xFF00) == 0x1900) {
                if (!mapPdo)
                    continue;

                // Parse TPDO communication parameters [0x1800, 0x19FF]
                const cobId = entry[1].value;
                const entries = [];

                const map = eds.getEntry(index + 0x200);
                for (let i = 1; i <= map[0].value; ++i) {
                    if (!map[i].value)
                        continue; // Empty entry

                    // Parse TPDO mapping parameters [0x1A00, 0x1BFFF]
                    const value = map[i].value;
                    const index = (value >> 16) & 0xFFFF;
                    const subIndex = (value >> 8) & 0xFF;

                    // Get data object from input EDS
                    const mapped = eds.getEntry(index);

                    // Find the next open index
                    while (this.eds.dataObjects[dataIndex] !== undefined) {
                        if (dataIndex >= 0xFFFF)
                            throw new RangeError('dataIndex must be <= 0xFFFF');

                        dataIndex += 1;
                    }

                    // Add data object to device EDS
                    this.eds.addEntry(dataIndex, mapped);
                    for (let j = 1; j < mapped.subNumber; ++j)
                        this.eds.addSubEntry(dataIndex, j, mapped[j]);

                    // Prepare to map the new data object
                    if (subIndex)
                        entries.push(this.eds.getSubEntry(dataIndex, subIndex));
                    else
                        entries.push(this.eds.getEntry(dataIndex));
                }

                this.pdo.addReceive(cobId, entries, {
                    type: entry[2].value,
                    inhibitTime: entry[3].value,
                    eventTime: entry[5].value,
                    syncStart: entry[6].value,
                });
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
            return this.getValue(0x1000);

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
            return this.getValue(0x1002);

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
            return this.getValue(0x1008);

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
            return this.getValue(0x1009);

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
            return this.getValue(0x100A);

        return this.sdo.upload({
            serverId: deviceId,
            index: 0x100A,
            dataType: DataType.VISIBLE_STRING,
        });
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
}

module.exports = exports = Device;
