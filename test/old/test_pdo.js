const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device } = require('../../index');
const { EdsError } = require('../../source/eds');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Pdo', function() {
    let device = null;

    beforeEach(function() {
        device = new Device({ id: 0xA, loopback: true });
    });

    it('should produce a PDO object', function(done) {
        const entry = device.eds.getEntry(0x05);

        // Map 0x05 to TPDO 0x18A.
        device.pdo.addTransmit(0x18A, [entry]);

        device.init();
        device.addListener('message', () => done());

        device.pdo.write(0x18A);
    });

    it('should throw on repeated RPDO', function(done) {
        const entry = device.eds.getEntry(0x05);

        device.init();

        device.pdo.addReceive(0x200, [entry]);
        expect(() => {
            device.pdo.addReceive(0x200, [entry])
        }).to.throw(EdsError);
        done();
    });


    it('should throw on repeated TPDO', function(done) {
        const entry = device.eds.getEntry(0x05);

        device.init();

        device.pdo.addTransmit(0x180, [entry]);
        expect(() => {
            device.pdo.addTransmit(0x180, [entry])
        }).to.throw(EdsError);
        done();
    });
});
