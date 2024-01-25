const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, DataType, EdsError, typeToRaw } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Time', function () {
    it('should get 0x1012', function () {
        const device = new Device({ id: 0xA });
        expect(device.eds.getTimeCobId()).to.be.null;
        expect(device.eds.getTimeProducerEnable()).to.be.false;
        expect(device.eds.getTimeConsumerEnable()).to.be.false;

        device.eds.setTimeCobId(0x100);
        expect(device.eds.getTimeCobId()).to.equal(0x100);

        device.eds.setTimeProducerEnable(true);
        expect(device.eds.getTimeProducerEnable()).to.be.true;
        expect(device.eds.getTimeConsumerEnable()).to.be.false;
        device.eds.setTimeProducerEnable(false);

        device.eds.setTimeConsumerEnable(true);
        expect(device.eds.getTimeProducerEnable()).to.be.false;
        expect(device.eds.getTimeConsumerEnable()).to.be.true;
        device.eds.setTimeConsumerEnable(false);

        expect(device.eds.getTimeProducerEnable()).to.be.false;
        expect(device.eds.getTimeConsumerEnable()).to.be.false;
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

        return expect(() => device.time.write()).to.throw(EdsError);
    });
});
