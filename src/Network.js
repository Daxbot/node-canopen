const Device = require('./Device');
const EMCY = require('./protocol/EMCY');
const NMT = require('./protocol/NMT');
const Sync = require('./protocol/Sync');
const Time = require('./protocol/Time');

/** CANopen Network
 * @param {RawChannel} channel - socketcan RawChannel object.
 */
class Network {
    constructor(channel) {
        if(channel == undefined)
            throw ReferenceError("arg0 'channel' undefined");

        if(channel.send == undefined)
            throw ReferenceError("arg0 'channel' has no send method");

        if(channel.addListener == undefined)
            throw ReferenceError("arg0 'channel' has no addListener method");

        this.channel = channel;
        this.devices = [];

        this._EMCY = new EMCY();
        this._NMT = new NMT(channel);
        this._Sync = new Sync(channel);
        this._Time = new Time(channel);

        channel.addListener("onMessage", this._onMessage, this);
    }

    get Emergency() {
        return this._EMCY;
    }

    get NMT() {
        return this._NMT;
    }

    get Sync() {
        return this._Sync;
    }

    get Time() {
        return this._Time;
    }

    addDevice(deviceId, edsPath=null, heartbeat=false) {
        this.devices[deviceId] = new Device(this.channel, deviceId, edsPath, heartbeat);
        return this.devices[deviceId];
    }

    removeDevice(deviceId) {
        this.devices[deviceId] = undefined;
    }

    /** socketcan 'onMessage' listener.
     * @private
     * @param {Object} message - CAN frame.
     */
    _onMessage(message) {
        if(!message)
            return;
        
        if(message.id == 0x0) {
            const target = message.data[1];
            let state;

            switch(message.data[0]) {
                case NMT.commands.ENTER_OPERATIONAL:
                    state = this.NMT.states.OPERATIONAL;
                    break;
                case NMT.commands.ENTER_STOPPED:
                    state = this.NMT.states.STOPPED;
                    break;
                case NMT.commands.ENTER_PRE_OPERATIONAL:
                    state = this.NMT.states.PRE_OPERATIONAL;
                    break;
                case NMT.commands.RESET_NODE:
                case NMT.commands.RESET_COMMUNICATION:
                    state = this.NMT.states.INITIALIZING;
                    break;
            }

            if(target == 0) {
                for (const id in self.devices)
                    self.devices[id].state = state;
            }
            else {
                self.devices[target].state = state;
            }
        }
    }
}

module.exports=exports=Network;