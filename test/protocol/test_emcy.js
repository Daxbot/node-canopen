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

        device.emcy.write(code);
    });

    it('should track error history', function(done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.eds.setEmcyCobId(0x8A);
        device.eds.setEmcyHistoryLength(1);
        device.emcy.write(0x1000);
        expect(device.emcy.history[0]).to.equal(0x1000);
        done();
    });
});
