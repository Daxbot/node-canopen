const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Emcy', function () {
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

        device.emcy.write({ code });
    });

    it('should track error history', function(done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setEmcyCobId(0x8A);
        device.eds.setEmcyHistoryLength(2);

        device.eds.pushEmcyHistory(0x1000);
        expect(device.emcy.history[0].code).to.equal(0x1000);
        expect(device.emcy.history[0].info).to.equal(0);

        device.eds.pushEmcyHistory(0x2000, 'CO');
        expect(device.emcy.history[0].code).to.equal(0x2000);
        expect(device.emcy.history[0].info).to.equal(0x4f43);

        expect(device.emcy.history[1].code).to.equal(0x1000);
        expect(device.emcy.history[1].info).to.equal(0);

        device.eds.pushEmcyHistory(0x3000, 7);
        expect(device.emcy.history[0].code).to.equal(0x3000);
        expect(device.emcy.history[0].info).to.equal(7);

        expect(device.emcy.history[1].code).to.equal(0x2000);
        expect(device.emcy.history[1].info).to.equal(0x4f43);

        done();
    });
});
