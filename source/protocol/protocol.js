/**
 * @file Base class for protocol modules.
 * @author Wilkins White
 * @copyright 2024 Daxbot
 */

const EventEmitter = require('events');

/**
 * A base class extended by the protocol modules.
 */
class Protocol extends EventEmitter {
    constructor() {
        super();
        this.started = false;
    }

    /**
     * Start the module.
     *
     * @fires Protocol#start
     */
    start() {
        if(!this.started) {
            this.started = true;

            /**
             * The module has been started.
             *
             * @event Protocol#start
             * @since 6.0.0
             */
            this.emit('start');
        }
    }

    /**
     * Stop the module.
     *
     * @fires Protocol#stop
     */
    stop() {
        if(this.started) {
            this.started = false;

            /**
             * The module has been stopped.
             *
             * @event Protocol#stop
             * @since 6.0.0
             */
            this.emit('stop');
        }
    }

    /**
     * Emit a CAN message.
     *
     * @param {number} id - CAN message identifier.
     * @param {Buffer} data - CAN message data;
     * @fires Protocol#message
     */
    send(id, data) {
        if(data === undefined)
            data = Buffer.alloc(0);

        /**
         * A CAN message is ready to send.
         *
         * @event Protocol#message
         * @type {object}
         * @property {number} id - CAN message identifier.
         * @property {Buffer} data - CAN message data.
         * @since 6.0.0
         */
        this.emit('message', { id, data });
    }
}

module.exports = exports = Protocol;