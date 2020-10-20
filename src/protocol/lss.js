/**
 * CANopen LSS modes.
 * @enum {number}
 * @see CiA305 "Switch Mode Global" (§3.9.1)
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
 */
class LssError extends Error {
    constructor(message, code, info=undefined) {
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
 * @memberof Device
 */
class Lss {
    constructor(device) {
        this.device = device;
        this.mode = LssMode.OPERATION;
        this.nodes = [];
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
        vendorId, productCode, revisionNumber, serialNumber, timeout=30) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject('LSS timeout'), timeout);
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
        })
        .finally(() => {
            clearTimeout(this.pending[68].timer);
            this.pending[68] = undefined;
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
    configureNodeId(nodeId, timeout=30) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject('LSS timeout'), timeout);
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
        })
        .finally(() => {
            clearTimeout(this.pending[17].timer);
            this.pending[17] = undefined;
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
    configureBitTiming(tableSelect, tableIndex, timeout=30) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject('LSS timeout'), timeout);
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
        })
        .finally(() => {
            clearTimeout(this.pending[19].timer);
            this.pending[19] = undefined;
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
    storeConfiguration(timeout=30) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject('LSS timeout'), timeout);
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
        })
        .finally(() => {
            clearTimeout(this.pending[23].timer);
            this.pending[23] = undefined;
        });
    }

    /**
     * Service: inquire identity vendor-id.
     * @param {number} timeout - time until promise is rejected.
     * @return {Promise<number>} - LSS slave vendor-id.
     *
     * @see CiA305 "Inquire Identity Vendor-ID Protocol" (§3.11.1.1)
     */
    inquireVendorId(timeout=30) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject('LSS timeout'), timeout);
            this._sendLssRequest(90);

            this.pending[90] = {resolve, timer};
        })
        .then((result) => {
            return result.readUInt32LE();
        })
        .finally(() => {
            clearTimeout(this.pending[90].timer);
            this.pending[90] = undefined;
        });
    }

    /**
     * Service: inquire identity product-code.
     * @param {number} timeout - time until promise is rejected.
     * @return {Promise<number>} - LSS slave product-code.
     *
     * @see CiA305 "Inquire Identity Product-Code Protocol" (§3.11.1.2)
     */
    inquireProductCode(timeout=30) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject('LSS timeout'), timeout);
            this._sendLssRequest(91);

            this.pending[91] = {resolve, timer};
        })
        .then((result) => {
            return result.readUInt32LE();
        })
        .finally(() => {
            clearTimeout(this.pending[91].timer);
            this.pending[91] = undefined;
        });
    }

    /**
     * Service: inquire identity revision-number.
     * @param {number} timeout - time until promise is rejected.
     * @return {Promise<number>} - LSS slave revision-number.
     *
     * @see CiA305 "Inquire Identity Revision-Number Protocol" (§3.11.1.3)
     */
    inquireRevisionNumber(timeout=30) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject('LSS timeout'), timeout);
            this._sendLssRequest(92);

            this.pending[92] = {resolve, timer};
        })
        .then((result) => {
            return result.readUInt32LE();
        })
        .finally(() => {
            clearTimeout(this.pending[92].timer);
            this.pending[92] = undefined;
        });
    }

    /**
     * Service: inquire identity serial-number.
     * @param {number} timeout - time until promise is rejected.
     * @return {Promise<number>} - LSS slave serial-number.
     *
     * @see CiA305 "Inquire Identity Serial-Number Protocol" (§3.11.1.4)
     */
    inquireSerialNumber(timeout=30) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject('LSS timeout'), timeout);
            this._sendLssRequest(93);

            this.pending[93] = {resolve, timer};
        })
        .then((result) => {
            return result.readUInt32LE();
        })
        .finally(() => {
            clearTimeout(this.pending[93].timer);
            this.pending[93] = undefined;
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
        if(this.pending[cs]) {
            this.pending[cs].resolve(message.data.slice(1));
        }
    }
}

module.exports=exports={ LssMode, Lss };
