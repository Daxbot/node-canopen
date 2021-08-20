/**
 * CANopen LSS modes.
 * @enum {number}
 * @see CiA305 "Switch Mode Global" (§3.9.1)
 * @memberof Lss
 */
const LssMode = {
    OPERATION: 0,
    CONFIGURATION: 1,
}

/**
 * Represents an LSS error.
 * @param {string} message - error message.
 * @param {number} code - error code.
 * @param {number} info - error info code.
 * @memberof Lss
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
 * @param {Device} device - parent device.
 *
 * @see CiA305 "Layer Settings Services and Protocol (LSS)"
 */
class Lss {
    constructor(device) {
        this.device = device;
        this.mode = LssMode.OPERATION;
        this.pending = {};
    }

    set vendorId(value) {
        this.device.setValueArray(0x1018, 1, value);
    }

    get vendorId() {
        return this.device.getValueArray(0x1018, 1);
    }

    set productCode(value) {
        this.device.setValueArray(0x1018, 2, value);
    }

    get productCode() {
        return this.device.getValueArray(0x1018, 2);
    }

    set revisionNumber(value) {
        this.device.setValueArray(0x1018, 3, value);
    }

    get revisionNumber() {
        return this.device.getValueArray(0x1018, 3);
    }

    set serialNumber(value) {
        this.device.setValueArray(0x1018, 4, value);
    }

    get serialNumber() {
        return this.device.getValueArray(0x1018, 4);
    }

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
     * @returns {Promise<null>} - if no devices found.
     * @returns {Promise<Object>} - if a device was found.
     *
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

            this._sendLssRequest(81, Buffer.from([0, 0, 0, 0, 0x80]));
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
                    this._sendLssRequest(81, data);

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
            this._sendLssRequest(81, data);

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
                    this._sendLssRequest(81, data);

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
            this._sendLssRequest(81, data);

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
                    this._sendLssRequest(81, data);

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
            this._sendLssRequest(81, data);

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
                    this._sendLssRequest(81, data);

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
            this._sendLssRequest(81, data);

            this.pending[0x4f] = {resolve, timer};
        });

        return { vendorId, productCode, revisionNumber, serialNumber };
    }

    /**
     * Service: switch mode global.
     * @param {LssMode} mode - LSS mode to switch to.
     *
     * @see CiA305 "Switch Mode Global" (§3.9.1)
     */
    switchModeGlobal(mode) {
        if(mode === undefined)
            throw ReferenceError("Parameter 'mode' undefined");

        this._sendLssRequest(4, Buffer.from([mode]));
    }

    /**
     * Service: switch mode selective.
     * @param {number} vendorId - LSS slave vendor-id.
     * @param {number} productCode - LSS slave product-code.
     * @param {number} revisionNumber - LSS slave revision-number.
     * @param {number} serialNumber - LSS slave serial-number.
     * @param {number} timeout - time until promise is rejected.
     * @return {Promise<LssMode>} - the actual mode of the LSS slave.
     *
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
            this._sendLssRequest(64, data);

            // Send product-code
            data.writeUInt32LE(productCode);
            this._sendLssRequest(65, data);

            // Send revision-number
            data.writeUInt32LE(revisionNumber);
            this._sendLssRequest(66, data);

            // Send serial-number
            data.writeUInt32LE(serialNumber);
            this._sendLssRequest(67, data);

            this.pending[68] = {resolve, timer};
        });
    }

    /**
     * Service: configure node-id.
     * @param {number} nodeId - new node-id
     * @param {number} timeout - time until promise is rejected.
     * @return {Promise}
     *
     * @see CiA305 "Configure Node-ID Protocol" (§3.10.1)
     */
    configureNodeId(nodeId, timeout=20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('LSS timeout'));
            }, timeout);
            this._sendLssRequest(17, Buffer.from([nodeId]));

            this.pending[17] = {resolve, timer};
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
     * @param {number} tableSelect - which bit timing parameters table to use.
     * @param {number} tableIndex - the entry in the selected table to use.
     * @param {number} timeout - time until promise is rejected.
     * @return {Promise}
     *
     * @see CiA305 "Configure Bit Timing Parameters Protocol" (§3.10.2)
     */
    configureBitTiming(tableSelect, tableIndex, timeout=20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('LSS timeout'));
            }, timeout);
            this._sendLssRequest(19, Buffer.from([tableSelect, tableIndex]));

            this.pending[19] = {resolve, timer};
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
     * @param {number} delay - switch delay in ms.
     *
     * @see CiA305 "Activate Bit Timing Parameters Protocol" (§3.10.3)
     */
    activateBitTiming(delay) {
        const switchDelay = Buffer.alloc(2);
        switchDelay.writeUInt16LE(delay);
        this._sendLssRequest(21, switchDelay);
    }

    /**
     * Service: store configuration.
     * @param {number} timeout - time until promise is rejected.
     * @return {Promise}
     *
     * @see CiA305 "Store Configuration Protocol" (§3.10.4)
     */
    storeConfiguration(timeout=20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('LSS timeout'));
            }, timeout);
            this._sendLssRequest(23);

            this.pending[23] = {resolve, timer};
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
     * @param {number} timeout - time until promise is rejected.
     * @return {Promise<number>} - LSS slave vendor-id.
     *
     * @see CiA305 "Inquire Identity Vendor-ID Protocol" (§3.11.1.1)
     */
    inquireVendorId(timeout=20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('LSS timeout'));
            }, timeout);
            this._sendLssRequest(90);

            this.pending[90] = {resolve, timer};
        })
        .then((result) => {
            return result.readUInt32LE();
        });
    }

    /**
     * Service: inquire identity product-code.
     * @param {number} timeout - time until promise is rejected.
     * @return {Promise<number>} - LSS slave product-code.
     *
     * @see CiA305 "Inquire Identity Product-Code Protocol" (§3.11.1.2)
     */
    inquireProductCode(timeout=20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('LSS timeout'));
            }, timeout);
            this._sendLssRequest(91);

            this.pending[91] = {resolve, timer};
        })
        .then((result) => {
            return result.readUInt32LE();
        });
    }

    /**
     * Service: inquire identity revision-number.
     * @param {number} timeout - time until promise is rejected.
     * @return {Promise<number>} - LSS slave revision-number.
     *
     * @see CiA305 "Inquire Identity Revision-Number Protocol" (§3.11.1.3)
     */
    inquireRevisionNumber(timeout=20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('LSS timeout'));
            }, timeout);
            this._sendLssRequest(92);

            this.pending[92] = {resolve, timer};
        })
        .then((result) => {
            return result.readUInt32LE();
        });
    }

    /**
     * Service: inquire identity serial-number.
     * @param {number} timeout - time until promise is rejected.
     * @return {Promise<number>} - LSS slave serial-number.
     *
     * @see CiA305 "Inquire Identity Serial-Number Protocol" (§3.11.1.4)
     */
    inquireSerialNumber(timeout=20) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('LSS timeout'));
            }, timeout);
            this._sendLssRequest(93);

            this.pending[93] = {resolve, timer};
        })
        .then((result) => {
            return result.readUInt32LE();
        });
    }

    /**
     * Send an LSS request object.
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
     * @param {Object} message - CAN frame.
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
