const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Nmt', function () {
    it('should configure 0x1016', function () {
        const device = new Device({ id: 0xA });

        device.eds.addHeartbeatConsumer(0xB, 100);
        expect(device.nmt.consumers[0].deviceId).to.equal(0xB);
        expect(device.nmt.consumers[0].heartbeatTime).to.equal(100);

        device.eds.removeHeartbeatConsumer(0xB);
        expect(device.nmt.consumers).to.be.an('array').that.is.empty;
    });

    it('should configure 0x1017', function () {
        const device = new Device({ id: 0xA });
        expect(device.nmt.producerTime).to.be.null;

        device.eds.setHeartbeatProducerTime(500);
        expect(device.nmt.producerTime).to.equal(500);
    });

    it('should emit on heartbeat timeout', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.addHeartbeatConsumer(device.id, 10);

        device.nmt.addListener('timeout', () => {
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
});
