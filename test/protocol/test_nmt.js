const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device } = require('../../index');

chai.use(chaiAsPromised);

describe('Nmt', function () {
    it('should emit on heartbeat timeout', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.addHeartbeatConsumer({
            deviceId: device.id,
            timeout: 10
        });

        device.nmt.addListener('nmtTimeout', () => {
            device.nmt.stop();
            done();
        });

        device.nmt.start();
        device.nmt._sendHeartbeat(device.id);
    });

    it('should emit on NMT state change', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setHeartbeatProducerTime(1);
        device.eds.addHeartbeatConsumer({
            deviceId: device.id,
            timeout: 10
        });

        device.nmt.addListener('nmtChangeState', ({ newState }) => {
            if(newState) {
                device.nmt.stop();
                done();
            }
        });

        device.nmt.start();
    });
});
