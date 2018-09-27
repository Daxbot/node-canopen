const can = require('socketcan');
const Device = require('./device.js');

const NMTStates = {
    INITIALIZING : 0,
    PRE_OPERATIONAL : 127,
    OPERATIONAL : 5,
    STOPPED : 4,
};

const NMTCommands = {
    ENTER_OPERATIONAL : 1,
    ENTER_STOPPED : 2,
    ENTER_PRE_OPERATIONAL : 128,
    RESET_NODE : 129,
    RESET_COMMUNICATION : 130,
}

class Network
{
    constructor(channel, guardTime=0, syncTime=0, masterId=3)
    {
        this.guardTime = guardTime;
        this.syncTime = syncTime;
        this.syncCount = 0;

        this.channel = can.createRawChannel(channel, true);
        this.db = null;
        this.heartbeat = null;
        this.sync = null;

        this.nodes = {};
        this.bus = {
            'messages' : [
                {
                    name: 'heartbeat',
                    id: 0x700 + masterId,
                    length: 1,
                    signals: [
                        {
                            name: 'state',
                            bitLength: 8,
                            bitOffset: 0,
                            endianness: 'little',
                        },
                    ],
                },
                {
                    name: 'sync',
                    id: 0x80,
                    length: 1,
                    signals: [
                        {
                            name: 'count',
                            bitLength: 8,
                            bitOffset: 0,
                            endianness: 'little',
                        },
                    ],
                },
                {
                    name: 'nmt',
                    id: 0x0,
                    length: 2,
                    signals: [
                        {
                            name: 'state',
                            bitLength: 8,
                            bitOffset: 0,
                            endianness: 'little',
                        },
                        {
                            name: 'target',
                            bitLength: 8,
                            bitOffset: 8,
                            endianness: 'little',
                        },
                    ]
                },
            ]
        };
    }

    _sendHeartbeat()
    {
        this.db.send('heartbeat');
    }

    _sendSync()
    {
        this.syncCount += 1;
        this.db.messages['sync'].signals['count'].update(this.syncCount);
        this.db.send('sync');
    }

    start()
    {
        this.db = new can.DatabaseService(this.channel, this.bus);
        this.channel.start();

        if(this.guardTime)
        {
            console.log('Guard interval set to ' + this.guardTime.toString());
            this.heartbeat = setInterval(()=>{ this._sendHeartbeat() }, this.guardTime);
        }

        if(this.syncTime)
        {
            console.log('Sync interval set to ' + this.syncTime.toString());
            this.sync = setInterval(()=>{ this._sendSync() }, this.syncTime);
        }

        this.updateNMTState(NMTStates.OPERATIONAL);
    }

    stop()
    {
        this.channel.stop();
        this.db = null;
    }

    addDevice(deviceId, edsPath)
    {
        let node = new Device(deviceId, edsPath);
        this.nodes[node.NodeId()] = node;
        this.bus['messages'].concat(node.messages());
    }

    updateNMTState(state)
    {
        this.db.messages['heartbeat'].signals['state'].update(state);
    }
}

module.exports=exports=Network;