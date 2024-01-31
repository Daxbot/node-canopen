const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, EdsError } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Sync', function () {
    it('should emit start once', function (done) {
        const device = new Device({ id: 0xA});

        device.sync.on('start', () => done());
        device.sync.start();
        device.sync.start();
    });

    it('should emit stop once', function (done) {
        const device = new Device({ id: 0xA});
        device.sync.start();

        device.sync.on('stop', () => done());
        device.sync.stop();
        device.sync.stop();
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

    it('should listen to Eds#newEntry', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.sync.start();

        device.sync.once('sync', () => {
            device.sync.stop();
            done();
        });

        device.eds.setSyncCobId(0x80);
        device.eds.setSyncGenerationEnable(true);
        device.eds.setSyncCyclePeriod(1);
    });

    it('should listen to Eds#removeEntry', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setSyncCobId(0x80);
        device.eds.setSyncGenerationEnable(true);
        device.eds.setSyncCyclePeriod(1);
        device.sync.start();

        const timer = setTimeout(() => {
            device.sync.stop();
            done();
        }, 20);

        device.sync.on('sync', () => {
            device.eds.removeEntry(0x1006);
            timer.refresh();
        });
    });

    it('should listen to DataObject#update', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setSyncCobId(0x80);
        device.eds.setSyncGenerationEnable(true);
        device.eds.setSyncCyclePeriod(1);
        device.sync.start();

        const timer = setTimeout(() => {
            device.sync.stop();
            done();
        }, 20);

        device.sync.on('sync', () => {
            device.eds.setSyncGenerationEnable(false);
            timer.refresh();
        });
    });
});
