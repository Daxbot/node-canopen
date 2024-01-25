const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, EdsError } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Sync', function () {
    it('should get 0x1005', function () {
        const device = new Device({ id: 0xA });
        expect(device.eds.getSyncCobId()).to.be.null;
        expect(device.eds.getSyncGenerationEnable()).to.be.false;

        device.eds.setSyncCobId(0x80);
        device.eds.setSyncGenerationEnable(true);

        expect(device.eds.getSyncCobId()).to.equal(0x80);
        expect(device.eds.getSyncGenerationEnable()).to.be.true;
    });

    it('should get 0x1006', function () {
        const device = new Device({ id: 0xA });
        expect(device.eds.getSyncCyclePeriod()).to.be.null;

        device.eds.setSyncCyclePeriod(333);
        expect(device.eds.getSyncCyclePeriod()).to.equal(333);
    });

    it('should get 0x1019', function () {
        const device = new Device({ id: 0xA });
        expect(device.eds.getSyncOverflow()).to.be.null;

        device.eds.setSyncOverflow(10);
        expect(device.eds.getSyncOverflow()).to.equal(10);
    });

    it('should produce a sync object', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setSyncCobId(0x80);
        device.eds.setSyncGenerationEnable(true);
        device.eds.setSyncCyclePeriod(1);

        device.sync.addListener('sync', () => {
            device.sync.stop();
            done();
        });

        device.sync.start();
    });

    it('should increment the counter', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setSyncCobId(0x80);
        device.eds.setSyncGenerationEnable(true);
        device.eds.setSyncCyclePeriod(1);
        device.eds.setSyncOverflow(100);

        let lastCount = null;
        device.sync.addListener('sync', (count) => {
            if (lastCount && count > lastCount) {
                device.sync.stop();
                done();
            }
            lastCount = count;
        });

        device.sync.start();
    });

    it('should throw if generate is false', function () {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setSyncCobId(0x80);
        device.sync.start();

        return expect(() => device.sync.write()).to.throw(EdsError);
    });
});
