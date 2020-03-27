const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const {EDS, Device} = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('NMT', function() {
    let node = null;

    beforeEach(function() {
        node = new Device({ id: 0xA, loopback: true });
        /* Consumer heartbeat time. */
        node.EDS.addEntry(0x1016, {
            ParameterName:      'Consumer heartbeat time',
            ObjectType:         EDS.objectTypes.ARRAY,
            SubNumber:          1,
        });
        node.EDS.addSubEntry(0x1016, 1, {
            ParameterName:      'Consumer 1',
            ObjectType:         EDS.objectTypes.VAR,
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
            DefaultValue:       (node.id << 16) | 10,
        });

        /* Producer heartbeat time. */
        node.EDS.addEntry(0x1017, {
            ParameterName:      'Producer heartbeat time',
            ObjectType:         EDS.objectTypes.VAR,
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
            DefaultValue:       10,
        });
    });

    afterEach(function() {
        delete node;
    });

    it('should emit on NMT state change', function(done) {
        node.init();
        node.on("nmtChangeState", () => { done(); });
        node.NMT.startNode(node.id);
    });

    describe('Heartbeat', function() {
        it('should require 0x1017', function() {
            node.EDS.removeEntry(0x1017);
            expect(() => { node.NMT.start(); }).to.throw(ReferenceError);
        });

        it('should produce a heartbeat object', function(done) {
            node.init();
            node.channel.addListener('onMessage', () => { done(); });
            node.NMT._sendHeartbeat();
        });

        it('should emit on heartbeat timeout', function(done) {
            node.init();
            node.on('nmtTimeout', () => { done(); });
            node.NMT._sendHeartbeat();
        })
    });
});
