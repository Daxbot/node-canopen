const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, DataType, EdsError, typeToRaw } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Time', function () {
    it('should reference time from January 1, 1984', function () {
        const date = new Date('1984-01-01');
        const raw = typeToRaw(date, DataType.TIME_OF_DAY);
        expect(raw.compare(Buffer.alloc(6))).to.be.equal(0);
    });

    it('should configure 0x1012', function () {
        const device = new Device({ id: 0xA });
        expect(device.time.cobId).to.be.null;
        expect(device.time.produce).to.be.false;
        expect(device.time.consume).to.be.false;

        device.eds.setTimeCobId(0x100, true, true);
        expect(device.time.cobId).to.equal(0x100);
        expect(device.time.produce).to.be.true;
        expect(device.time.consume).to.be.true;
    });

    it('should produce a time object', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setTimeCobId(0x100, true, true);

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
