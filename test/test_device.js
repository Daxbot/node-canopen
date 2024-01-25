const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, DataType } = require('../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Device', function () {
    it('should require id be in range [1-127]', function () {
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

    it('should get 0x1002', function () {
        const device = new Device();

        device.eds.setStatusRegister(100);
        expect(device.eds.getStatusRegister()).to.equal(100);

        const raw = Buffer.from('abcd');
        device.eds.setStatusRegister(raw);
        expect(device.eds.getStatusRegister()).to.equal(raw.readUInt32LE());
    });

    it('should get 0x1008', function () {
        const device = new Device();
        device.eds.setDeviceName('node-canopen');
        expect(device.eds.getDeviceName()).to.equal('node-canopen');
    });

    it('should get 0x1009', function () {
        const device = new Device();
        device.eds.setHardwareVersion('A');
        expect(device.eds.getHardwareVersion()).to.equal('A');
    });

    it('should get 0x100A', function () {
        const device = new Device();
        device.eds.setSoftwareVersion('1.0');
        expect(device.eds.getSoftwareVersion()).to.equal('1.0');
    });

    describe('mapRemoteNode', function() {
        it('should map Emcy', function() {
            const remote = new Device({ id: 0xA });
            remote.eds.setEmcyCobId(0x8B);

            const local = new Device({ id: 0xB });
            local.mapRemoteNode(remote);

            expect(local.eds.getEmcyConsumers()).to.be.an('array');
            expect(local.eds.getEmcyConsumers()[0]).to.equal(0x8B);
        });

        it('should map Nmt', function() {
            const remote = new Device({ id: 0xA });
            remote.eds.setHeartbeatProducerTime(500);

            const local = new Device({ id: 0xB });
            local.mapRemoteNode(remote);

            const consumers = local.eds.getHeartbeatConsumers();
            expect(consumers).to.be.an('array');
            expect(consumers[0]).to.exist;
            expect(consumers[0].deviceId).to.equal(0xA);
            expect(consumers[0].heartbeatTime).to.equal(1000);
        });

        it('should map Sdo', function() {
            const remote = new Device({ id: 0xA });
            remote.eds.addSdoServerParameter(0xB);

            const local = new Device({ id: 0xB });
            local.mapRemoteNode(remote);

            const servers = local.eds.getSdoClientParameters();
            expect(servers).to.be.an('array');
            expect(servers[0]).to.exist;
            expect(servers[0].deviceId).to.equal(0xA);
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

            const rpdo = local.eds.getReceivePdos();
            expect(rpdo).to.be.an('array');
            expect(rpdo[0]).to.exist;
            expect(rpdo[0].cobId).to.equal(0x180);
        });
    });
});
