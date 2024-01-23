const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, EdsError } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Time', function () {
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
