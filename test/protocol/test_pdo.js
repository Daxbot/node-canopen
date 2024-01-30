const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, EdsError } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Pdo', function () {
    it('should produce a PDO object', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        const obj0005 = device.eds.getEntry(0x5);

        device.eds.addTransmitPdo({
            cobId: 0x18A,
            transmissionType: 254,
            dataObjects: [obj0005],
        });

        device.pdo.start();
        device.pdo.addListener('message', () => done());
        device.pdo.write(0x18A);
    });

    it('should emit on consuming a PDO object', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        const obj0002 = device.eds.getEntry(0x2); // INT8
        const obj0005 = device.eds.getEntry(0x5); // UINT8

        device.eds.addTransmitPdo({
            cobId: 0x18A,
            transmissionType: 254,
            dataObjects: [obj0002],
        });

        device.eds.addReceivePdo({
            cobId: 0x18A,
            dataObjects: [obj0005],
        });

        device.pdo.start();
        device.nmt.startNode();

        device.pdo.addListener('pdo', ({ dataObjects }) => {
            const pdo = dataObjects[0];
            expect(pdo.index).to.equal(0x5);
            expect(pdo.value).to.equal(1);
            done();
        });

        device.setValue(0x02, 1);
    });

    it('should listen to Eds#newTpdo', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.pdo.start();
        device.nmt.startNode();

        const obj0002 = device.eds.getEntry(0x2); // INT8
        const obj0005 = device.eds.getEntry(0x5); // UINT8

        device.eds.addTransmitPdo({
            cobId: 0x18A,
            transmissionType: 254,
            dataObjects: [obj0002],
        });

        device.eds.addReceivePdo({
            cobId: 0x18A,
            dataObjects: [obj0005],
        });

        device.pdo.addListener('pdo', ({ dataObjects }) => {
            const pdo = dataObjects[0];
            expect(pdo.index).to.equal(0x5);
            expect(pdo.value).to.equal(1);
            done();
        });

        device.setValue(0x02, 1);
    });

    it('should listen to Eds#removeTpdo', function () {
        const device = new Device({ id: 0xA, loopback: true });
        const obj0005 = device.eds.getEntry(0x5);
        device.pdo.start();

        device.eds.addTransmitPdo({
            cobId: 0x18A,
            transmissionType: 254,
            dataObjects: [obj0005],
        });

        device.eds.removeTransmitPdo(0x18A);
        expect(() => device.pdo.write(0x18A)).to.throw(EdsError);
    });
});
