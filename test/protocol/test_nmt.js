const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Nmt', function() {
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

            device.addListener('message', () => done());
            device.nmt._sendHeartbeat();
        });
    });

    describe('Consumer', function() {
        beforeEach(function() {
            device.nmt.addConsumer(device.id, 10);
            device.init();
        });

        it('should emit on heartbeat timeout', function(done) {
            device.on('nmtTimeout', () => done());
            device.nmt._sendHeartbeat();
        });

        it('should emit on NMT state change', function(done) {
            device.on("nmtChangeState", () => done());
            device.nmt.startNode(device.id);
        });
    });
});
