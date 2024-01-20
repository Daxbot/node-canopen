/**
 * @file Implements the CANopen Layer Setting Services (LSS) protocol.
 * @author Wilkins White
 * @copyright 2024 Daxbot
 */

const EventEmitter = require('events');
const { Eds } = require('../eds');

/**
 * CANopen LSS command specifiers.
 *
 * @enum {number}
 * @see CiA305 "LSS Protocol Descriptions" (§3.8.2)
 * @memberof Lss
 * @private
 */
const LssCommand = {
    SWITCH_MODE_GLOBAL: 4,
    CONFIGURE_NODE_ID: 17,
    CONFIGURE_BIT_TIMING: 19,
    ACTIVATE_BIT_TIMING: 21,
    STORE_CONFIGURATION: 23,
    SWITCH_MODE_VENDOR_ID: 64,
    SWITCH_MODE_PRODUCT_CODE: 65,
    SWITCH_MODE_REVISION_NUMBER: 66,
    SWITCH_MODE_SERIAL_NUMBER: 67,
    FASTSCAN: 81,
    INQUIRE_VENDOR_ID: 90,
    INQUIRE_PRODUCT_CODE: 91,
    INQUIRE_REVISION_NUMBER: 92,
    INQUIRE_SERIAL_NUMBER: 93,
};

/**
 * CANopen LSS modes.
 *
 * @enum {number}
 * @see CiA305 "Switch Mode Global" (§3.9.1)
 */
const LssMode = {
    /** Only the switch mode service is available. */
    OPERATION: 0,

    /** All LSS services are available. */
    CONFIGURATION: 1,
};

/**
 * Errors generated during LSS services.
 *
 * @param {string} message - error message.
 * @param {number} code - error code.
 * @param {number} info - error info code.
 */
class LssError extends Error {
    constructor(message, code, info) {
        super(message);
        this.code = code;
        this.info = info;

        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Errors generated from LSS service timeouts.
 *
 * @param {string} message - error message.
 */
class LssTimeout extends Error {
    constructor() {
        super('LSS timeout');

        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * CANopen LSS protocol handler.
 *
 * @param {Eds} eds - Eds object.
 * @see CiA305 "Layer Settings Services and Protocol (LSS)"
 * @fires 'message' on preparing a CAN message to send.
 * @fires 'lssChangeDeviceId' on change of device id.
 * @fires 'lssChangeMode' on change of LSS mode.
 */
class Lss extends EventEmitter {
    constructor(eds) {
        super();

        if(!Eds.isEds(eds))
            throw new TypeError('not an Eds');

        this.eds = eds;
        this.mode = LssMode.OPERATION;
        this.pending = {};
        this.select = [];
        this.scanState = 0;
    }

    /**
     * Vendor id.
     *
     * @type {number}
     */
    get vendorId() {
        return this.eds.getValueArray(0x1018, 1);
    }

    /**
     * Product code.
     *
     * @type {number}
     */
    get productCode() {
        return this.eds.getValueArray(0x1018, 2);
    }

    /**
     * Revision number.
     *
     * @type {number}
     */
    get revisionNumber() {
        return this.eds.getValueArray(0x1018, 3);
    }

    /**
     * Serial number.
     *
     * @type {number}
     */
    get serialNumber() {
        return this.eds.getValueArray(0x1018, 4);
    }

    /**
     * Start the module.
     */
    start() {
    }

    /**
     * Stop the module.
     */
    stop() {
    }

    /**
     * LSS Fastscan protocol.
     *
     * Identifies exactly one LSS consumer device and switches it to
     * configuration mode.
     *
     * @param {object} [identity] - device identity hint.
     * @param {number} [identity.vendorId] - vendor-id hint (optional).
     * @param {number} [identity.productCode] - product-code hint (optional).
     * @param {number} [identity.revisionNumber] - revision-number hint (optional).
     * @param {number} [identity.serialNumber] - serial-number hint (optional).
     * @param {number} [timeout] - how long to wait for nodes to respond.
     * @returns {Promise<null | object>} resolves to the discovered device's id (or null).
     * @see https://www.can-cia.org/fileadmin/resources/documents/proceedings/2008_pfeiffer.pdf
     */
    async fastscan(identity={}, timeout = 20) {
        let {
            vendorId,
            productCode,
            revisionNumber,
            serialNumber
        } = identity;

        // Initiate fastscan
        let timeoutFlag = false;
        await new Promise((resolve) => {
            const timer = setTimeout(() => {
                timeoutFlag = true;
                resolve();
            }, timeout);

            this._sendLssRequest(
                LssCommand.FASTSCAN, Buffer.from([0, 0, 0, 0, 0x80]));

            this.pending[0x4f] = { resolve, timer };
        });

        if (timeoutFlag)
            return null; // No devices

        // Find vendor-id
        if (vendorId === undefined) {
            vendorId = 0;
            for (let i = 31; i >= 0; --i) {
                await new Promise((resolve) => {
                    const timer = setTimeout(() => {
                        const bit = (1 << i) >>> 0;
                        vendorId = (vendorId | bit) >>> 0;
                        resolve();
                    }, timeout);

                    const data = Buffer.alloc(7);
                    data.writeUInt32LE(vendorId);
                    data[4] = i; // Bit checked
                    data[5] = 0; // LSS sub
                    data[6] = 0; // LSS next
                    this._sendLssRequest(LssCommand.FASTSCAN, data);

                    this.pending[0x4f] = { resolve, timer };
                });
            }
        }

        // Verify vendor-id
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new LssError('unverified vendorId', 255, 0));
            }, timeout);

            const data = Buffer.alloc(7);
            data.writeUInt32LE(vendorId);
            data[4] = 0; // Bit checked
            data[5] = 0; // LSS sub
            data[6] = 1; // LSS next
            this._sendLssRequest(LssCommand.FASTSCAN, data);

            this.pending[0x4f] = { resolve, timer };
        });

        // Find product-code
        if (productCode === undefined) {
            productCode = 0;
            for (let i = 31; i >= 0; --i) {
                await new Promise((resolve) => {
                    const timer = setTimeout(() => {
                        const bit = (1 << i) >>> 0;
                        productCode = (productCode | bit) >>> 0;
                        resolve();
                    }, timeout);

                    const data = Buffer.alloc(7);
                    data.writeUInt32LE(productCode);
                    data[4] = i; // Bit checked
                    data[5] = 1; // LSS sub
                    data[6] = 1; // LSS next
                    this._sendLssRequest(LssCommand.FASTSCAN, data);

                    this.pending[0x4f] = { resolve, timer };
                });
            }
        }

        // Verify product-code
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new LssError('unverified productCode', 255, 0));
            }, timeout);

            const data = Buffer.alloc(7);
            data.writeUInt32LE(productCode);
            data[4] = 0; // Bit checked
            data[5] = 1; // LSS sub
            data[6] = 2; // LSS next
            this._sendLssRequest(LssCommand.FASTSCAN, data);

            this.pending[0x4f] = { resolve, timer };
        });

        // Find revision-number
        if (revisionNumber === undefined) {
            revisionNumber = 0;
            for (let i = 31; i >= 0; --i) {
                await new Promise((resolve) => {
                    const timer = setTimeout(() => {
                        const bit = (1 << i) >>> 0;
                        revisionNumber = (revisionNumber | bit) >>> 0;
                        resolve();
                    }, timeout);

                    const data = Buffer.alloc(7);
                    data.writeUInt32LE(revisionNumber);
                    data[4] = i; // Bit checked
                    data[5] = 2; // LSS sub
                    data[6] = 2; // LSS next
                    this._sendLssRequest(LssCommand.FASTSCAN, data);

                    this.pending[0x4f] = { resolve, timer };
                });
            }
        }

        // Verify revision-number
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new LssError('unverified revisionNumber', 255, 0));
            }, timeout);

            const data = Buffer.alloc(7);
            data.writeUInt32LE(revisionNumber);
            data[4] = 0; // Bit checked
            data[5] = 2; // LSS sub
            data[6] = 3; // LSS next
            this._sendLssRequest(LssCommand.FASTSCAN, data);

            this.pending[0x4f] = { resolve, timer };
        });

        // Find serial-number
        if (serialNumber === undefined) {
            serialNumber = 0;
            for (let i = 31; i >= 0; --i) {
                await new Promise((resolve) => {
                    const timer = setTimeout(() => {
                        const bit = (1 << i) >>> 0;
                        serialNumber = (serialNumber | bit) >>> 0;
                        resolve();
                    }, timeout);

                    const data = Buffer.alloc(7);
                    data.writeUInt32LE(serialNumber);
                    data[4] = i; // Bit checked
                    data[5] = 3; // LSS sub
                    data[6] = 3; // LSS next
                    this._sendLssRequest(LssCommand.FASTSCAN, data);

                    this.pending[0x4f] = { resolve, timer };
                });
            }
        }

        // Verify serial-number
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new LssError('unverified serialNumber', 255, 0));
            }, timeout);

            const data = Buffer.alloc(7);
            data.writeUInt32LE(serialNumber);
            data[4] = 0; // Bit checked
            data[5] = 3; // LSS sub
            data[6] = 0; // LSS next
            this._sendLssRequest(LssCommand.FASTSCAN, data);

            this.pending[0x4f] = { resolve, timer };
        });

        return { vendorId, productCode, revisionNumber, serialNumber };
    }

    /**
     * Service: switch mode global.
     *
     * @param {LssMode} mode - LSS mode to switch to.
     * @see CiA305 "Switch Mode Global" (§3.9.1)
     */
    switchModeGlobal(mode) {
        if (mode === undefined)
            throw ReferenceError('mode not defined');

        this._sendLssRequest(
            LssCommand.SWITCH_MODE_GLOBAL, Buffer.from([mode]));
    }

    /**
     * Service: switch mode selective.
     *
     * @param {object} identity - target device identity.
     * @param {number} identity.vendorId - LSS consumer vendor-id.
     * @param {number} identity.productCode - LSS consumer product-code.
     * @param {number} identity.revisionNumber - LSS consumer revision-number.
     * @param {number} identity.serialNumber - LSS consumer serial-number.
     * @param {number} [timeout] - time until promise is rejected.
     * @returns {Promise<LssMode>} - the actual mode of the LSS consumer.
     * @see CiA305 "Switch Mode Selective" (§3.9.2)
     */
    switchModeSelective(identity, timeout = 20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new LssTimeout());
            }, timeout);

            const data = Buffer.alloc(4);

            // Send vendor-id
            data.writeUInt32LE(identity.vendorId);
            this._sendLssRequest(LssCommand.SWITCH_MODE_VENDOR_ID, data);

            // Send product-code
            data.writeUInt32LE(identity.productCode);
            this._sendLssRequest(LssCommand.SWITCH_MODE_PRODUCT_CODE, data);

            // Send revision-number
            data.writeUInt32LE(identity.revisionNumber);
            this._sendLssRequest(LssCommand.SWITCH_MODE_REVISION_NUMBER, data);

            // Send serial-number
            data.writeUInt32LE(identity.serialNumber);
            this._sendLssRequest(LssCommand.SWITCH_MODE_SERIAL_NUMBER, data);

            this.pending[68] = { resolve, timer };
        });
    }

    /**
     * Service: configure node-id.
     *
     * @param {number} nodeId - new node-id
     * @param {number} timeout - time until promise is rejected.
     * @returns {Promise} resolves when the service is finished.
     * @see CiA305 "Configure Node-ID Protocol" (§3.10.1)
     */
    async configureNodeId(nodeId, timeout = 20) {
        const result = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new LssTimeout());
            }, timeout);

            this._sendLssRequest(
                LssCommand.CONFIGURE_NODE_ID, Buffer.from([nodeId]));

            this.pending[LssCommand.CONFIGURE_NODE_ID] = {
                resolve,
                timer
            };
        });

        const code = result[0];
        if (code == 0)
            return; // Success

        let message = '';
        switch (code) {
            case 1:
                message = 'Node-ID out of range';
                break;
            case 255:
                message = 'Implementation specific error';
                break;
            default:
                message = 'Unsupported error code';
                break;
        }

        throw new LssError(message, code, result[1]);
    }

    /**
     * Service: configure bit timing parameters.
     *
     * @param {number} tableSelect - which bit timing parameters table to use.
     * @param {number} tableIndex - the entry in the selected table to use.
     * @param {number} timeout - time until promise is rejected.
     * @returns {Promise} resolves when the service is finished.
     * @see CiA305 "Configure Bit Timing Parameters Protocol" (§3.10.2)
     */
    configureBitTiming(tableSelect, tableIndex, timeout = 20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new LssTimeout());
            }, timeout);

            this._sendLssRequest(
                LssCommand.CONFIGURE_BIT_TIMING,
                Buffer.from([tableSelect, tableIndex]));

            this.pending[LssCommand.CONFIGURE_BIT_TIMING] = {
                resolve,
                timer
            };
        })
            .then((result) => {
                const code = result[0];
                if (code == 0)
                    return; // Success

                let message = '';
                switch (code) {
                    case 1:
                        message = 'Bit timing not supported';
                        break;
                    case 255:
                        message = 'Implementation specific error';
                        break;
                    default:
                        message = 'Unsupported error code';
                        break;
                }

                throw new LssError(message, code, result[1]);
            });
    }

    /**
     * Service: activate bit timing parameters.
     *
     * @param {number} delay - switch delay in ms.
     * @see CiA305 "Activate Bit Timing Parameters Protocol" (§3.10.3)
     */
    activateBitTiming(delay) {
        const switchDelay = Buffer.alloc(2);
        switchDelay.writeUInt16LE(delay);
        this._sendLssRequest(LssCommand.ACTIVATE_BIT_TIMING, switchDelay);
    }

    /**
     * Service: store configuration.
     *
     * @param {number} timeout - time until promise is rejected.
     * @returns {Promise} resolves when the service is finished.
     * @see CiA305 "Store Configuration Protocol" (§3.10.4)
     */
    storeConfiguration(timeout = 20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new LssTimeout());
            }, timeout);

            this._sendLssRequest(LssCommand.STORE_CONFIGURATION);

            this.pending[LssCommand.STORE_CONFIGURATION] = {
                resolve,
                timer
            };
        })
            .then((result) => {
                const code = result[0];
                if (code == 0)
                    return; // Success

                let message = '';
                switch (code) {
                    case 1:
                        message = 'Store configuration not supported';
                        break;
                    case 2:
                        message = 'Storage media access error';
                        break;
                    case 255:
                        message = 'Implementation specific error';
                        break;
                    default:
                        message = 'Unsupported error code';
                        break;
                }

                throw new LssError(message, code, result[1]);
            });
    }

    /**
     * Service: inquire identity vendor-id.
     *
     * @param {number} timeout - time until promise is rejected.
     * @returns {Promise<number>} - LSS consumer vendor-id.
     * @see CiA305 "Inquire Identity Vendor-ID Protocol" (§3.11.1.1)
     */
    async inquireVendorId(timeout = 20) {
        const result = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new LssTimeout()), timeout);
            this._sendLssRequest(LssCommand.INQUIRE_VENDOR_ID);

            this.pending[LssCommand.INQUIRE_VENDOR_ID] = {
                resolve,
                timer
            };
        });

        return result.readUInt32LE();
    }

    /**
     * Service: inquire identity product-code.
     *
     * @param {number} timeout - time until promise is rejected.
     * @returns {Promise<number>} - LSS consumer product-code.
     * @see CiA305 "Inquire Identity Product-Code Protocol" (§3.11.1.2)
     */
    async inquireProductCode(timeout = 20) {
        const result = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new LssTimeout()), timeout);
            this._sendLssRequest(LssCommand.INQUIRE_PRODUCT_CODE);

            this.pending[LssCommand.INQUIRE_PRODUCT_CODE] = {
                resolve,
                timer
            };
        });

        return result.readUInt32LE();
    }

    /**
     * Service: inquire identity revision-number.
     *
     * @param {number} timeout - time until promise is rejected.
     * @returns {Promise<number>} - LSS consumer revision-number.
     * @see CiA305 "Inquire Identity Revision-Number Protocol" (§3.11.1.3)
     */
    async inquireRevisionNumber(timeout = 20) {
        const result = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new LssTimeout()), timeout);
            this._sendLssRequest(LssCommand.INQUIRE_REVISION_NUMBER);

            this.pending[LssCommand.INQUIRE_REVISION_NUMBER] = {
                resolve,
                timer
            };
        });

        return result.readUInt32LE();
    }

    /**
     * Service: inquire identity serial-number.
     *
     * @param {number} timeout - time until promise is rejected.
     * @returns {Promise<number>} - LSS consumer serial-number.
     * @see CiA305 "Inquire Identity Serial-Number Protocol" (§3.11.1.4)
     */
    async inquireSerialNumber(timeout = 20) {
        const result = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new LssTimeout()), timeout);
            this._sendLssRequest(LssCommand.INQUIRE_SERIAL_NUMBER);

            this.pending[LssCommand.INQUIRE_SERIAL_NUMBER] = {
                resolve,
                timer
            };
        });

        return result.readUInt32LE();
    }

    /**
     * Send an LSS request object.
     *
     * @param {LssCommand} command - LSS command specifier.
     * @param {Buffer} data - command data.
     * @private
     */
    _sendLssRequest(command, data) {
        const sendBuffer = Buffer.alloc(8);
        sendBuffer[0] = command;

        if (data !== undefined)
            data.copy(sendBuffer, 1);

        this.emit('message', {
            id: 0x7e5,
            data: sendBuffer,
        });
    }

    /**
     * Send an LSS response object.
     *
     * @param {LssCommand} command - LSS command specifier.
     * @param {number} code - response code.
     * @param {number} info - response info.
     * @private
     */
    _sendLssResponse(command, code, info = 0) {
        const sendBuffer = Buffer.alloc(8);
        sendBuffer[0] = command;
        sendBuffer[1] = code;
        sendBuffer[2] = info;

        this.emit('message', {
            id: 0x7e4,
            data: sendBuffer,
        });
    }

    /**
     * Check an Lss address against the device address.
     *
     * @param {Array} address - Lss address.
     * @param {number} address.0 - device vendor id.
     * @param {number} address.1 - device product code.
     * @param {number} address.2 - device revision number.
     * @param {number} address.3 - device serial number.
     * @returns {boolean} true if the address matches.
     * @private
     */
    _checkLssAddress(address) {
        return address[0] === this.vendorId
            && address[1] === this.productCode
            && address[2] === this.revisionNumber
            && address[3] === this.serialNumber;
    }

    /**
     * Mask and compare two unsigned integers.
     *
     * @param {number} a - first number.
     * @param {number} b - second number.
     * @param {number} mask - bit mask.
     * @returns {boolean} true if the masked values are equal.
     */
    _maskCompare(a, b, mask) {
        a = (a & mask) >>> 0;
        b = (b & mask) >>> 0;

        return a === b;
    }

    /**
     * Call when a new CAN message is received.
     *
     * @param {object} message - CAN frame.
     * @param {number} message.id - CAN message identifier.
     * @param {Buffer} message.data - CAN message data;
     * @param {number} message.len - CAN message length in bytes.
     */
    receive(message) {
        if (message.id === 0x7e4) {
            const cs = message.data[0];
            if (this.pending[cs] !== undefined) {
                clearTimeout(this.pending[cs].timer);
                this.pending[cs].resolve(message.data.slice(1));
            }
        }
        else if (message.id === 0x7e5) {
            const cs = message.data[0];

            if (cs === LssCommand.FASTSCAN) {
                // Fastscan is only available for unconfigured nodes.
                const bitCheck = message.data[5];
                const lssSub = message.data[6];
                const lssNext = message.data[7];

                if (bitCheck === 0x80) {
                    // Reset state
                    this.scanState = 0;
                    this._sendLssResponse(0x4f);
                }
                else if (this.scanState === lssSub) {
                    if (bitCheck > 0x1f || lssSub > 3 || lssNext > 3)
                        return; // Invalid request

                    const data = message.data.readUInt32LE(1);
                    const mask = (0xffffffff << bitCheck) >>> 0;
                    let match = false;

                    switch (lssSub) {
                        case 0:
                            // Test vendor id
                            match = this._maskCompare(
                                this.vendorId, data, mask);
                            break;

                        case 1:
                            // Test product code
                            match = this._maskCompare(
                                this.productCode, data, mask);
                            break;

                        case 2:
                            // Test revision number
                            match = this._maskCompare(
                                this.revisionNumber, data, mask);
                            break;

                        case 3:
                            match = this._maskCompare(
                                this.serialNumber, data, mask);
                            break;
                    }

                    if (match) {
                        this.scanState = lssNext;
                        if (bitCheck === 0 && lssNext < lssSub) {
                            this.mode = LssMode.CONFIGURATION;
                            this.emit('lssChangeMode', this.mode);
                        }

                        this._sendLssResponse(0x4f);
                    }
                }
                return;
            }

            // Switch mode commands
            switch (cs) {
                case LssCommand.SWITCH_MODE_GLOBAL:
                    this.mode = message.data[1];
                    this.select = [];
                    this.emit('lssChangeMode', this.mode);
                    return;

                case LssCommand.SWITCH_MODE_VENDOR_ID:
                    this.select[0] = message.data.readUInt32LE(1);
                    return;

                case LssCommand.SWITCH_MODE_PRODUCT_CODE:
                    this.select[1] = message.data.readUInt32LE(1);
                    return;

                case LssCommand.SWITCH_MODE_REVISION_NUMBER:
                    this.select[2] = message.data.readUInt32LE(1);
                    return;

                case LssCommand.SWITCH_MODE_SERIAL_NUMBER:
                    this.select[3] = message.data.readUInt32LE(1);
                    if (this._checkLssAddress(this.select)) {
                        this.mode = LssMode.CONFIGURATION;
                        this.emit('lssChangeMode', this.mode);
                    }
                    return;
            }

            // Configuration commands
            if (this.mode !== LssMode.CONFIGURATION)
                return;

            switch (cs) {
                case LssCommand.CONFIGURE_NODE_ID:
                    try {
                        this._sendLssResponse(cs, 0);
                        this.emit('lssChangeDeviceId', message.data[1]);
                    }
                    catch {
                        // Error: Node-ID out of range
                        this._sendLssResponse(cs, 1);
                    }
                    return;

                case LssCommand.CONFIGURE_BIT_TIMING:
                    // Error: Bit timing not supported
                    this._sendLssResponse(cs, 1);
                    return;

                case LssCommand.STORE_CONFIGURATION:
                    // Error: Store configuration not supported
                    this._sendLssResponse(cs, 1);
                    return;

                case LssCommand.INQUIRE_VENDOR_ID:
                    this._sendLssResponse(cs, this.vendorId);
                    return;

                case LssCommand.INQUIRE_PRODUCT_CODE:
                    this._sendLssResponse(cs, this.productCode);
                    return;

                case LssCommand.INQUIRE_REVISION_NUMBER:
                    this._sendLssResponse(cs, this.revisionNumber);
                    return;

                case LssCommand.INQUIRE_SERIAL_NUMBER:
                    this._sendLssResponse(cs, this.serialNumber);
                    return;
            }
        }
    }
}

module.exports = exports = { LssMode, LssError, LssTimeout, Lss };
