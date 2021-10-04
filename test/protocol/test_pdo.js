const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Pdo', function() {
    let device = null;

    beforeEach(function() {
        device = new Device({ id: 0xA, loopback: true });
    });

    it('should produce a PDO object', function(done) {
        const entry = device.eds.getEntry(0x05);

        device.init();
        device.addListener('message', () => done());

        // Map 0x05 to TPDO 0x18A.
        device.pdo.addTransmit(0x180, [entry]);
        device.pdo.write(0x18A);
    });

    it('should emit on consuming a PDO object', function(done) {
        const entry = device.eds.getEntry(0x05);
        device.init();

        // Map 0x05 to TPDO 0x20A.
        device.pdo.addTransmit(0x200, [entry]);

        // Map 0x05 to RPDO 0x20A.
        device.pdo.addReceive(0x200, [entry]);

        // Change the value of 0x05.
        device.setValue(0x05, 1);

        device.on('pdo', ([pdo]) => {
            // Expect the new value.
            expect(pdo.value).to.equal(1);
            done();
        });

        device.pdo.write(0x20A);
    });
});
