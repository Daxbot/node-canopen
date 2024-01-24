const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, EdsError } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Emcy', function () {
    it('should configure 0x1001', function () {
        const device = new Device({ id: 0xA });

        device.eds.setErrorRegister({ generic: true });
        expect(device.emcy.register).to.equal(1);

        device.eds.setErrorRegister({ current: true });
        expect(device.emcy.register).to.equal(3);

        device.eds.setErrorRegister({ voltage: true });
        expect(device.emcy.register).to.equal(7);

        device.eds.setErrorRegister({ temperature: true });
        expect(device.emcy.register).to.equal(15);

        device.eds.setErrorRegister({ generic: false, communication: true });
        expect(device.emcy.register).to.equal(30);

        device.eds.setErrorRegister({ current: false, device: true });
        expect(device.emcy.register).to.equal(60);

        device.eds.setErrorRegister({ voltage: false, manufacturer: true });
        expect(device.emcy.register).to.equal(184);

        device.eds.setErrorRegister({ temperature: false });
        expect(device.emcy.register).to.equal(176);
    });

    it('should configure 0x1003', function () {
        const device = new Device({ id: 0xA });
        device.eds.setErrorHistoryLength(2);

        device.eds.pushErrorHistory(0x1000);
        expect(device.emcy.history[0].code).to.equal(0x1000);
        expect(device.emcy.history[0].info).to.equal(0);

        device.eds.pushErrorHistory(0x2000, 'CO');
        expect(device.emcy.history[0].code).to.equal(0x2000);
        expect(device.emcy.history[0].info).to.equal(0x4f43);

        expect(device.emcy.history[1].code).to.equal(0x1000);
        expect(device.emcy.history[1].info).to.equal(0);

        device.eds.pushErrorHistory(0x3000, 7);
        expect(device.emcy.history[0].code).to.equal(0x3000);
        expect(device.emcy.history[0].info).to.equal(7);

        expect(device.emcy.history[1].code).to.equal(0x2000);
        expect(device.emcy.history[1].info).to.equal(0x4f43);
    });

    it('should configure 0x1014', function () {
        const device = new Device({ id: 0xA });
        expect(device.emcy.cobId).to.be.null;
        expect(device.emcy.valid).to.be.false;

        device.eds.setEmcyCobId(0x8A);
        expect(device.emcy.cobId).to.equal(0x8A);
        expect(device.emcy.valid).to.be.true;
    });

    it('should configure 0x1015', function () {
        const device = new Device({ id: 0xA });
        expect(device.emcy.inhibitTime).to.be.null;

        device.eds.setEmcyInhibitTime(100);
        expect(device.emcy.inhibitTime).to.equal(100);
    });

    it('should configure 0x1028', function () {
        const device = new Device({ id: 0xA });

        device.eds.addEmcyConsumer(0x3);
        expect(device.emcy.consumers[0]).to.equal(0x3);

        device.eds.removeEmcyConsumer(0x3);
        expect(device.emcy.consumers).to.be.an('array').that.is.empty;
    });

    it('should produce an emergency object', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setEmcyCobId(0x8A);
        device.eds.addEmcyConsumer(0x8A);
        device.emcy.start();

        const code = 0x1000;
        device.emcy.addListener('emergency', ({ em }) => {
            expect(em.code).to.equal(code);
            device.emcy.stop();
            done();
        });

        device.emcy.write(code);
    });

    it('should throw if cobId is 0', function () {
        const device = new Device({ id: 0xA, loopback: true });
        device.emcy.start();

        expect(() => device.emcy.write(0x1000)).to.throw(EdsError);
    });
});
