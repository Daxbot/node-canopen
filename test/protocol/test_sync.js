const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, EdsError } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Sync', function () {
    it('should produce a sync object', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setSyncCobId({ cobId: 0x80, generate: true });
        device.eds.setSyncCyclePeriod(1);

        device.sync.addListener('sync', () => {
            device.sync.stop();
            done();
        });

        device.sync.start();
    });

    it('should increment the counter', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setSyncCobId({ cobId: 0x80, generate: true });
        device.eds.setSyncCyclePeriod(1);
        device.eds.setSyncOverflow(100);

        let lastCount = null;
        device.sync.addListener('sync', (count) => {
            if(lastCount && count > lastCount) {
                device.sync.stop();
                done();
            }
            lastCount = count;
        });

        device.sync.start();
    });

    it('should throw if generate is false', function () {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setSyncCobId({ cobId: 0x80, generate: false });
        device.sync.start();

        return expect(() => device.sync.write()).to.throw(EdsError);
    });
});
