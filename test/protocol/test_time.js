const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, DataType, EdsError, typeToRaw } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Time', function () {
    it('should emit start once', function (done) {
        const device = new Device({ id: 0xA});

        device.time.on('start', () => done());
        device.time.start();
        device.time.start();
    });

    it('should emit stop once', function (done) {
        const device = new Device({ id: 0xA});
        device.time.start();

        device.time.on('stop', () => done());
        device.time.stop();
        device.time.stop();
    });

    it('should reference time from January 1, 1984', function () {
        const date = new Date('1984-01-01');
        const raw = typeToRaw(date, DataType.TIME_OF_DAY);
        expect(raw.compare(Buffer.alloc(6))).to.be.equal(0);
    });

    it('should produce a time object', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setTimeCobId(0x100);
        device.eds.setTimeProducerEnable(true);
        device.eds.setTimeConsumerEnable(true);

        device.time.on('time', () => {
            device.time.stop();
            done();
        });

        device.time.start();
        device.time.write();
    });

    it('should throw if produce is false', function () {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setTimeCobId(0x100);
        device.time.start();

        expect(() => device.time.write()).to.throw(EdsError);
    });

    it('should listen to Eds#newEntry', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.time.start();

        device.time.on('time', () => {
            device.time.stop();
            done();
        });

        device.eds.setTimeCobId(0x100);
        device.eds.setTimeProducerEnable(true);
        device.eds.setTimeConsumerEnable(true);
        device.time.write();
    });

    it('should listen to Eds#removeEntry', function () {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setTimeCobId(0x100);
        device.eds.setTimeProducerEnable(true);
        device.time.start();

        device.eds.removeEntry(0x1012);
        expect(() => device.time.write()).to.throw(EdsError);
    });

    it('should listen to DataObject#update', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setTimeCobId(0x100);
        device.eds.setTimeProducerEnable(false);
        device.eds.setTimeConsumerEnable(false);
        device.time.start();

        device.time.on('time', () => {
            device.time.stop();
            done();
        });

        expect(() => device.time.write()).to.throw(EdsError);

        device.eds.setTimeProducerEnable(true);
        device.eds.setTimeConsumerEnable(true);
        device.time.write();
    });
});
