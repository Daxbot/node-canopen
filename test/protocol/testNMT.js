const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const {EDS, Device} = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('NMT', function() {
    let node = null;

    beforeEach(function() {
        node = new Device({ id: 0xA, loopback: true });
    });

    afterEach(function() {
        delete node;
    });

    describe('Object dictionary updates', function() {
        beforeEach(function() {
            node.NMT.producerTime = 100;
            node.init();
        });

        it('should listen for updates to 0x1017', function(done) {
            const obj1017 = node.EDS.getEntry(0x1017);
            obj1017.addListener('update', () => {
                setImmediate(() => {
                    expect(node.NMT.producerTime).to.equal(200);
                    done();
                });
            });

            obj1017.value = 200;
        });
    });

    describe('Producer', function() {
        it('should throw if producer time is 0', function() {
            node.NMT.producerTime = 0;
            node.init();

            return expect(() => { node.NMT.start(); }).to.throw(TypeError);
        });

        it('should produce a heartbeat object', function(done) {
            node.NMT.producerTime = 10;
            node.init();

            node.addListener('message', () => { done(); });
            node.NMT._sendHeartbeat();
        });
    });

    describe('Consumer', function() {
        beforeEach(function() {
            /* Consumer heartbeat time. */
            node.EDS.addEntry(0x1016, {
                ParameterName:      'Consumer heartbeat time',
                ObjectType:         EDS.objectTypes.ARRAY,
                SubNumber:          2,
            });
            node.EDS.addSubEntry(0x1016, 1, {
                ParameterName:      'Consumer 1',
                ObjectType:         EDS.objectTypes.VAR,
                DataType:           EDS.dataTypes.UNSIGNED32,
                AccessType:         EDS.accessTypes.READ_WRITE,
                DefaultValue:       (node.id << 16) | 10,
            });

            node.init();
        });

        it('should emit on heartbeat timeout', function(done) {
            node.on('nmtTimeout', () => { done(); });
            node.NMT._sendHeartbeat();
        });

        it('should emit on NMT state change', function(done) {
            node.on("nmtChangeState", () => { done(); });
            node.NMT.startNode(node.id);
        });
    });
});
