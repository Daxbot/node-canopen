const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Nmt', function () {
    it('should emit start once', function (done) {
        const device = new Device({ id: 0xA});

        device.nmt.on('start', () => done());
        device.nmt.start();
        device.nmt.start();
    });

    it('should emit stop once', function (done) {
        const device = new Device({ id: 0xA});
        device.nmt.start();

        device.nmt.on('stop', () => done());
        device.nmt.stop();
        device.nmt.stop();
    });

    it('should emit on heartbeat detected', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setHeartbeatProducerTime(10);
        device.eds.addHeartbeatConsumer(device.id, 10);

        device.nmt.addListener('heartbeat', ({ deviceId }) => {
            expect(deviceId).to.equal(device.id);
            device.nmt.stop();
            done();
        });

        device.nmt.start();
    });

    it('should emit on heartbeat timeout', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.addHeartbeatConsumer(device.id, 10);

        device.nmt.addListener('timeout', (deviceId) => {
            expect(deviceId).to.equal(device.id);
            device.nmt.stop();
            done();
        });

        device.nmt.start();
        device.nmt._sendHeartbeat(device.id);
    });

    it('should emit on NMT state change', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setHeartbeatProducerTime(1);
        device.eds.addHeartbeatConsumer(device.id, 10);

        device.nmt.addListener('changeState', (state) => {
            if (state) {
                device.nmt.stop();
                done();
            }
        });

        device.nmt.start();
    });

    it('should listen to Eds#newEntry', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.nmt.start();

        expect(device.eds.getHeartbeatProducerTime()).to.be.null;
        expect(device.eds.getHeartbeatConsumers()).to.be.an('array').that.is.empty;

        device.nmt.once('heartbeat', () => {
            device.nmt.stop();
            done();
        });

        device.eds.setHeartbeatProducerTime(1);
        device.eds.addHeartbeatConsumer(device.id, 10);
    });

    it('should listen to Eds#removeEntry', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setHeartbeatProducerTime(1);
        device.eds.addHeartbeatConsumer(device.id, 10);

        device.nmt.once('heartbeat', () => {
            device.nmt.once('timeout', () => {
                done();
            });

            device.eds.removeEntry(0x1017); // Producer time
        });

        device.nmt.start();
    });

    it('should listen to DataObject#update', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setHeartbeatProducerTime(1);
        device.eds.addHeartbeatConsumer(0x7F, 10); // Not our device
        device.nmt.start();

        device.nmt.once('heartbeat', () => {
            device.nmt.stop();
            done();
        });

        device.eds.addHeartbeatConsumer(device.id, 10); // Our device
    });
});
