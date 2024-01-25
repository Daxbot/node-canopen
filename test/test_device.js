const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, DataType } = require('../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Device', function () {
    it('should be constructable', function () {
        new Device({ id: 0xA, loopback: true });
    });

    it('should require id be in range 1-127', function () {
        expect(() => {
            new Device({ id: null, loopback: true });
        }).to.throw(RangeError);
        expect(() => {
            new Device({ id: 0, loopback: true });
        }).to.throw(RangeError);
        expect(() => {
            new Device({ id: 128, loopback: true });
        }).to.throw(RangeError);
        expect(() => {
            new Device({ id: 0xFFFF, loopback: true });
        }).to.throw(RangeError);
    });

    describe('mapRemoteNode', function() {
        it('should map Emcy', function() {
            const remote = new Device({ id: 0xA });
            remote.eds.setEmcyCobId(0x8B);

            const local = new Device({ id: 0xB });
            local.mapRemoteNode(remote);

            expect(local.emcy.consumers).to.be.an('array');
            expect(local.emcy.consumers[0]).to.equal(0x8B);
        });

        it('should map Nmt', function() {
            const remote = new Device({ id: 0xA });
            remote.eds.setHeartbeatProducerTime(500);

            const local = new Device({ id: 0xB });
            local.mapRemoteNode(remote);

            expect(local.nmt.consumers).to.be.an('array');
            expect(local.nmt.consumers[0]).to.exist;
            expect(local.nmt.consumers[0].deviceId).to.equal(0xA);
            expect(local.nmt.consumers[0].heartbeatTime).to.equal(1000);
        });

        it('should map Sdo', function() {
            const remote = new Device({ id: 0xA });
            remote.eds.addSdoServerParameter(0xB);

            const local = new Device({ id: 0xB });
            local.mapRemoteNode(remote);

            expect(local.sdo.servers).to.be.an('array');
            expect(local.sdo.servers[0]).to.exist;
            expect(local.sdo.servers[0].deviceId).to.equal(0xA);
        });

        it('should map Pdo', function() {
            const remote = new Device({ id: 0xA });

            const obj2000 = remote.eds.addEntry(0x2000, {
                parameterName: 'Test object',
                dataType: DataType.UNSIGNED8,
            });

            remote.eds.addTransmitPdo({
                cobId: 0x180,
                dataObjects: [ obj2000 ]
            });

            const local = new Device({ id: 0xB });
            local.mapRemoteNode(remote);

            expect(local.eds.getEntry(0x2000)).to.exist;
            expect(local.pdo.rpdo).to.be.an('array');
            expect(local.pdo.rpdo[0]).to.exist;
            expect(local.pdo.rpdo[0].cobId).to.equal(0x180);
        });
    });
});
