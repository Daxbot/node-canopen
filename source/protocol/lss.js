/**
 * @file Implements the CANopen Layer Setting Services (LSS) protocol.
 * @author Wilkins White
 * @copyright 2021 Nova Dynamics LLC
 */

const Device = require('../device');

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
    INQUIRE_MANUFACTURER_NAME: 90,
    INQUIRE_PRODUCT_NAME: 91,
    INQUIRE_REVISION_NUMBER: 92,
    INQUIRE_SERIAL_NUMBER: 93,
}

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
}

/**
 * Represents an LSS error.
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
 * CANopen LSS protocol handler.
 *
 * @param {Device} device - parent device.
 * @see CiA305 "Layer Settings Services and Protocol (LSS)"
 */
class Lss {
    constructor(device) {
        this.device = device;
        this.mode = LssMode.OPERATION;
        this.pending = {};
    }

    /**
     * Device identity vendor id (Object 0x1018.1).
     *
     * @type {number}
     */
    get vendorId() {
        return this.device.getValueArray(0x1018, 1);
    }

    set vendorId(value) {
        this.device.setValueArray(0x1018, 1, value);
    }

    /**
     * Device identity product code (Object 0x1018.2).
     *
     * @type {number}
     */
    get productCode() {
        return this.device.getValueArray(0x1018, 2);
    }

    set productCode(value) {
        this.device.setValueArray(0x1018, 2, value);
    }

    /**
     * Device identity revision number (Object 0x1018.3).
     *
     * @type {number}
     */
    get revisionNumber() {
        return this.device.getValueArray(0x1018, 3);
    }

    set revisionNumber(value) {
        this.device.setValueArray(0x1018, 3, value);
    }

    /**
     * Device identity serial number (Object 0x1018.4).
     *
     * @type {number}
     */
    get serialNumber() {
        return this.device.getValueArray(0x1018, 4);
    }

    set serialNumber(value) {
        this.device.setValueArray(0x1018, 4, value);
    }

    /** Begin listening for LSS command responses. */
    init() {
        if(!this.device.eds.lssSupported)
            return;

        this.device.addListener('message', this._onMessage.bind(this));
    }

    /**
     * LSS Fastscan protocol.
     *
     * Identifies exactly one LSS slave device and switches it to configuration
     * mode.
     *
     * @param {number} vendorId - vendor-id hint (optional).
     * @param {number} productCode - product-code hint (optional).
     * @param {number} revisionNumber - revision-number hint (optional).
     * @param {number} serialNumber - serial-number hint (optional).
     * @param {number} timeout - how long to wait for nodes to respond.
     * @returns {Promise<null | object>} resolves to the discovered device's id (or null).
     * @see https://www.can-cia.org/fileadmin/resources/documents/proceedings/2008_pfeiffer.pdf
     */
    async fastscan(
        vendorId=null,
        productCode=null,
        revisionNumber=null,
        serialNumber=null,
        timeout=20
    ) {
        let timeoutFlag = false;

        // Initiate fastscan
        await new Promise((resolve) => {
            const timer = setTimeout(() => {
                timeoutFlag = true;
                resolve();
            }, timeout);

            this._sendLssRequest(
                LssCommand.FASTSCAN, Buffer.from([0, 0, 0, 0, 0x80]));

            this.pending[0x4f] = {resolve, timer};
        });

        if(timeoutFlag)
            return null; // No devices

        // Find vendor-id
        if(vendorId === null) {
            vendorId = 0;
            for(let i = 31; i >= 0; --i) {
                await new Promise((resolve) => {
                    const timer = setTimeout(() => {
                        vendorId |= 1 << i;
                        resolve();
                    }, timeout);

                    const data = Buffer.alloc(7);
                    data.writeUInt32LE(vendorId >>> 0);
                    data[4] = i; // Bit checked
                    data[5] = 0; // LSS sub
                    data[6] = 0; // LSS next
                    this._sendLssRequest(LssCommand.FASTSCAN, data);

                    this.pending[0x4f] = {resolve, timer};
                });
            }
        }

        // Verify vendor-id
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Failed to verify vendorId'));
            }, timeout);

            const data = Buffer.alloc(7);
            data.writeUInt32LE(vendorId >>> 0);
            data[4] = 0; // Bit checked
            data[5] = 0; // LSS sub
            data[6] = 1; // LSS next
            this._sendLssRequest(LssCommand.FASTSCAN, data);

            this.pending[0x4f] = {resolve, timer};
        });

        // Find product-code
        if(productCode === null) {
            productCode = 0;
            for(let i = 31; i >= 0; --i) {
                await new Promise((resolve) => {
                    const timer = setTimeout(() => {
                        productCode |= (1 << i);
                        resolve();
                    }, timeout);

                    const data = Buffer.alloc(7);
                    data.writeUInt32LE(productCode >>> 0);
                    data[4] = i; // Bit checked
                    data[5] = 1; // LSS sub
                    data[6] = 1; // LSS next
                    this._sendLssRequest(LssCommand.FASTSCAN, data);

                    this.pending[0x4f] = {resolve, timer};
                });
            }
        }

        // Verify product-code
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Failed to verify productCode'));
            }, timeout);

            const data = Buffer.alloc(7);
            data.writeUInt32LE(productCode >>> 0);
            data[4] = 0; // Bit checked
            data[5] = 1; // LSS sub
            data[6] = 2; // LSS next
            this._sendLssRequest(LssCommand.FASTSCAN, data);

            this.pending[0x4f] = {resolve, timer};
        });

        // Find revision-number
        if(revisionNumber === null) {
            revisionNumber = 0;
            for(let i = 31; i >= 0; --i) {
                await new Promise((resolve) => {
                    const timer = setTimeout(() => {
                        revisionNumber |= 1 << i;
                        resolve();
                    }, timeout);

                    const data = Buffer.alloc(7);
                    data.writeUInt32LE(revisionNumber >>> 0);
                    data[4] = i; // Bit checked
                    data[5] = 2; // LSS sub
                    data[6] = 2; // LSS next
                    this._sendLssRequest(LssCommand.FASTSCAN, data);

                    this.pending[0x4f] = {resolve, timer};
                });
            }
        }

        // Verify revision-number
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Failed to verify revisionNumber'));
            }, timeout);

            const data = Buffer.alloc(7);
            data.writeUInt32LE(revisionNumber >>> 0);
            data[4] = 0; // Bit checked
            data[5] = 2; // LSS sub
            data[6] = 3; // LSS next
            this._sendLssRequest(LssCommand.FASTSCAN, data);

            this.pending[0x4f] = {resolve, timer};
        });

        // Find serial-number
        if(serialNumber === null) {
            serialNumber = 0;
            for(let i = 31; i >= 0; --i) {
                await new Promise((resolve) => {
                    const timer = setTimeout(() => {
                        serialNumber |= 1 << i;
                        resolve();
                    }, timeout);

                    const data = Buffer.alloc(7);
                    data.writeUInt32LE(serialNumber >>> 0);
                    data[4] = i; // Bit checked
                    data[5] = 3; // LSS sub
                    data[6] = 3; // LSS next
                    this._sendLssRequest(LssCommand.FASTSCAN, data);

                    this.pending[0x4f] = {resolve, timer};
                });
            }
        }

        // Verify serial-number
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Failed to verify serialNumber'));
            }, timeout);

            const data = Buffer.alloc(7);
            data.writeUInt32LE(serialNumber >>> 0);
            data[4] = 0; // Bit checked
            data[5] = 3; // LSS sub
            data[6] = 0; // LSS next
            this._sendLssRequest(LssCommand.FASTSCAN, data);

            this.pending[0x4f] = {resolve, timer};
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
        if(mode === undefined)
            throw ReferenceError("Parameter 'mode' undefined");

        this._sendLssRequest(
            LssCommand.SWITCH_MODE_GLOBAL, Buffer.from([mode]));
    }

    /**
     * Service: switch mode selective.
     *
     * @param {number} vendorId - LSS slave vendor-id.
     * @param {number} productCode - LSS slave product-code.
     * @param {number} revisionNumber - LSS slave revision-number.
     * @param {number} serialNumber - LSS slave serial-number.
     * @param {number} timeout - time until promise is rejected.
     * @returns {Promise<LssMode>} - the actual mode of the LSS slave.
     * @see CiA305 "Switch Mode Selective" (§3.9.2)
     */
    switchModeSelective(
        vendorId, productCode, revisionNumber, serialNumber, timeout=20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('LSS timeout'));
            }, timeout);
            const data = Buffer.alloc(4);

            // Send vendor-id
            data.writeUInt32LE(vendorId);
            this._sendLssRequest(LssCommand.SWITCH_MODE_VENDOR_ID, data);

            // Send product-code
            data.writeUInt32LE(productCode);
            this._sendLssRequest(LssCommand.SWITCH_MODE_PRODUCT_CODE, data);

            // Send revision-number
            data.writeUInt32LE(revisionNumber);
            this._sendLssRequest(LssCommand.SWITCH_MODE_REVISION_NUMBER, data);

            // Send serial-number
            data.writeUInt32LE(serialNumber);
            this._sendLssRequest(LssCommand.SWITCH_MODE_SERIAL_NUMBER, data);

            this.pending[68] = {resolve, timer};
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
    configureNodeId(nodeId, timeout=20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('LSS timeout'));
            }, timeout);

            this._sendLssRequest(
                LssCommand.CONFIGURE_NODE_ID, Buffer.from([nodeId]));

            this.pending[LssCommand.CONFIGURE_NODE_ID] = {
                resolve,
                timer
            };
        })
        .then((result) => {
            const code = result[0];
            if(code == 0)
                return; // Success

            let message = '';
            switch(code) {
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
        });
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
    configureBitTiming(tableSelect, tableIndex, timeout=20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('LSS timeout'));
            }, timeout);

            this._sendLssRequest(
                LssCommand.CONFIGURE_BIT_TIMING, Buffer.from([tableSelect, tableIndex]));

            this.pending[LssCommand.CONFIGURE_BIT_TIMING] = {
                resolve,
                timer
            };
        })
        .then((result) => {
            const code = result[0];
            if(code == 0)
                return; // Success

            let message = '';
            switch(code) {
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
    storeConfiguration(timeout=20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('LSS timeout'));
            }, timeout);

            this._sendLssRequest(LssCommand.STORE_CONFIGURATION);

            this.pending[LssCommand.STORE_CONFIGURATION] = {
                resolve,
                timer
            };
        })
        .then((result) => {
            const code = result[0];
            if(code == 0)
                return; // Success

            let message = '';
            switch(code) {
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
     * @returns {Promise<number>} - LSS slave vendor-id.
     * @see CiA305 "Inquire Identity Vendor-ID Protocol" (§3.11.1.1)
     */
    inquireVendorId(timeout=20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('LSS timeout'));
            }, timeout);

            this._sendLssRequest(LssCommand.INQUIRE_MANUFACTURER_NAME);

            this.pending[LssCommand.INQUIRE_MANUFACTURER_NAME] = {
                resolve,
                timer
            };
        })
        .then((result) => {
            return result.readUInt32LE();
        });
    }

    /**
     * Service: inquire identity product-code.
     *
     * @param {number} timeout - time until promise is rejected.
     * @returns {Promise<number>} - LSS slave product-code.
     * @see CiA305 "Inquire Identity Product-Code Protocol" (§3.11.1.2)
     */
    inquireProductCode(timeout=20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('LSS timeout'));
            }, timeout);

            this._sendLssRequest(LssCommand.INQUIRE_PRODUCT_NAME);

            this.pending[LssCommand.INQUIRE_PRODUCT_NAME] = {
                resolve,
                timer
            };
        })
        .then((result) => {
            return result.readUInt32LE();
        });
    }

    /**
     * Service: inquire identity revision-number.
     *
     * @param {number} timeout - time until promise is rejected.
     * @returns {Promise<number>} - LSS slave revision-number.
     * @see CiA305 "Inquire Identity Revision-Number Protocol" (§3.11.1.3)
     */
    inquireRevisionNumber(timeout=20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('LSS timeout'));
            }, timeout);

            this._sendLssRequest(LssCommand.INQUIRE_REVISION_NUMBER);

            this.pending[LssCommand.INQUIRE_REVISION_NUMBER] = {
                resolve,
                timer
            };
        })
        .then((result) => {
            return result.readUInt32LE();
        });
    }

    /**
     * Service: inquire identity serial-number.
     *
     * @param {number} timeout - time until promise is rejected.
     * @returns {Promise<number>} - LSS slave serial-number.
     * @see CiA305 "Inquire Identity Serial-Number Protocol" (§3.11.1.4)
     */
    inquireSerialNumber(timeout=20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('LSS timeout'));
            }, timeout);

            this._sendLssRequest(LssCommand.INQUIRE_SERIAL_NUMBER);

            this.pending[LssCommand.INQUIRE_SERIAL_NUMBER] = {
                resolve,
                timer
            };
        })
        .then((result) => {
            return result.readUInt32LE();
        });
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

        if(data !== undefined)
            data.copy(sendBuffer, 1);

        this.device.send({
            id:     0x7e5,
            data:   sendBuffer,
        });
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
        if(message.id != 0x7e4)
            return;

        const cs = message.data[0];
        if(this.pending[cs] !== undefined) {
            clearTimeout(this.pending[cs].timer);
            this.pending[cs].resolve(message.data.slice(1));
        }
    }
}

module.exports=exports={ LssMode, LssError, Lss };
