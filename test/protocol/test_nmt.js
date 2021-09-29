const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, ObjectType, AccessType, DataType } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('NMT', function() {
    let device = null;

    beforeEach(function() {
        device = new Device({ id: 0xA, loopback: true });
    });

    describe('Object dictionary updates', function() {
        it('should listen for updates to 0x1017', function(done) {
            device.nmt.producerTime = 100;
            device.init();

            const obj1017 = device.eds.getEntry(0x1017);
            obj1017.addListener('update', () => {
                setImmediate(() => {
                    expect(device.nmt.producerTime).to.equal(200);
                    done();
                });
            });

            obj1017.value = 200;
        });
    });

    describe('Producer', function() {
        it('should throw if producer time is 0', function() {
            device.nmt.producerTime = 0;
            device.init();

            return expect(() => {
                device.nmt.start();
            }).to.throw(TypeError);
        });

        it('should produce a heartbeat object', function(done) {
            device.nmt.producerTime = 10;
            device.init();

            device.addListener('message', () => {
                done();
            });
            device.nmt._sendHeartbeat();
        });
    });

    describe('Consumer', function() {
        beforeEach(function() {
            /* Consumer heartbeat time. */
            device.eds.addEntry(0x1016, {
                parameterName:  'Consumer heartbeat time',
                objectType:     ObjectType.ARRAY,
                subNumber:      2,
            });
            device.eds.addSubEntry(0x1016, 1, {
                parameterName:  'Consumer 1',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED32,
                accessType:     AccessType.READ_WRITE,
                defaultValue:   (device.id << 16) | 10,
            });

            device.init();
        });

        it('should emit on heartbeat timeout', function(done) {
            device.on('nmtTimeout', () => {
                done();
            });
            device.nmt._sendHeartbeat();
        });

        it('should emit on NMT state change', function(done) {
            device.on("nmtChangeState", () => {
                done();
            });
            device.nmt.startNode(device.id);
        });
    });
});
