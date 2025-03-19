const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, AccessType, DataType } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

const shortTypes = [
    ['BOOLEAN', true],
    ['INTEGER8', -0x12],
    ['INTEGER16', -0x1234],
    ['INTEGER24', -0x123456],
    ['INTEGER32', -0x12345678],
    ['UNSIGNED8', 0x12],
    ['UNSIGNED16', 0x1234],
    ['UNSIGNED24', 0x123456],
    ['UNSIGNED32', 0x12345678],
    ['VISIBLE_STRING', 'test'],
    ['OCTET_STRING', Buffer.from([1, 2, 3, 4])],
    ['UNICODE_STRING', '\u03b1'],
    ['REAL32', 1.0],
];

const longTypes = [
    ['INTEGER40', -0x1234567890],
    ['INTEGER48', -0x1234567890AB],
    ['INTEGER64', -1n],
    ['UNSIGNED40', 0x1234567890],
    ['UNSIGNED48', 0x1234567890AB],
    ['UNSIGNED64', 1n],
    ['VISIBLE_STRING', 'long visible string'],
    ['OCTET_STRING', Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])],
    ['UNICODE_STRING', '\u03b1\u03b2\u03b3\u03b4\u03b5\u03b6'],
    ['REAL64', Math.PI],
    ['TIME_OF_DAY', new Date()],
    ['TIME_DIFFERENCE', new Date()],
];

describe('Sdo', function () {
    it('should emit start once', function (done) {
        const device = new Device({ id: 0xA});

        device.sdo.on('start', () => done());
        device.sdo.start();
        device.sdo.start();
    });

    it('should emit stop once', function (done) {
        const device = new Device({ id: 0xA});
        device.sdo.start();

        device.sdo.on('stop', () => done());
        device.sdo.stop();
        device.sdo.stop();
    });

    it('should transfer using the deprecated API', async function() {
        const device = new Device({ id: 0xA, loopback: true });
        device.sdo.addServer(device.id);
        device.sdoServer.addClient(device.id);
        device.init();

        await device.sdo.download({
            serverId: device.id,
            data: 0xc0ffee,
            dataType: DataType.UNSIGNED32,
            index: 7,
        });

        const result = await device.sdo.upload({
            serverId: device.id,
            index: 7,
            dataType: DataType.UNSIGNED32,
        });

        expect(result).to.equal(0xc0ffee);
        device.stop();
    });

    describe('Expediated transfer', function () {
        for (let [type, value] of shortTypes) {
            it('should transfer ' + type, async function () {
                const device = new Device({ id: 0xA, loopback: true });
                device.eds.addSdoClientParameter(device.id);
                device.eds.addSdoServerParameter(device.id);
                device.start();

                const index = DataType[type];
                await device.sdo.download({
                    serverId: device.id,
                    data: value,
                    dataType: type,
                    index: index,
                });

                const result = await device.sdo.upload({
                    serverId: device.id,
                    index: index,
                    dataType: type,
                });

                if (Buffer.isBuffer(result))
                    expect(Buffer.compare(result, value)).to.equal(0);
                else
                    expect(result).to.equal(value);

                device.stop();
            });
        }

        it('should transfer to any valid node id [1 - 127]', async function () {
            let device;
            for(let id = 1; id < 0x7F; ++id) {
                device = new Device({ id, loopback: true });
                device.eds.addSdoClientParameter(device.id);
                device.eds.addSdoServerParameter(device.id);
                device.start();

                await device.sdo.download({
                    serverId: device.id,
                    data: 0xc0ffee,
                    dataType: DataType.UNSIGNED32,
                    index: 7,
                });

                const result = await device.sdo.upload({
                    serverId: device.id,
                    index: 7,
                    dataType: DataType.UNSIGNED32,
                });

                expect(result).to.equal(0xc0ffee);
                device.stop();
            }
        });
    });

    describe('Segmented transfer', function () {
        for (let [type, value] of longTypes) {
            it('should transfer ' + type, async function () {
                const device = new Device({ id: 0xA, loopback: true });
                device.eds.addSdoClientParameter(device.id);
                device.eds.addSdoServerParameter(device.id);
                device.start();

                const index = DataType[type];
                await device.sdo.download({
                    serverId: device.id,
                    data: value,
                    dataType: type,
                    index: index,
                });

                const result = await device.sdo.upload({
                    serverId: device.id,
                    index: index,
                    dataType: type,
                });

                if (result instanceof Date)
                    expect(result.getTime()).to.equal(value.getTime());
                else if (Buffer.isBuffer(result))
                    expect(Buffer.compare(result, value)).to.equal(0);
                else if (typeof result == 'bigint')
                    expect(Number(result)).to.equal(Number(value));
                else
                    expect(result).to.equal(value);

                device.stop();
            });
        }

        it('should transfer subindexes >= 1', async function () {
            const device = new Device({ id: 0xA, loopback: true });
            device.eds.addSdoClientParameter(device.id);
            device.eds.addSdoServerParameter(device.id);
            device.start();

            const testString = 'I am a long string that will take multiple messages to transfer';
            device.eds.addEntry(0x1234, {
                parameterName: 'Test entry',
                objectType: 6,
                subNumber: 1
            });
            device.eds.addSubEntry(0x1234, 0, {
                parameterName: 'A long name',
                dataType: DataType.VISIBLE_STRING,
                accessType: AccessType.READ_WRITE,
                defaultValue: testString,
            });

            const result = await device.sdo.upload({
                serverId: device.id,
                index: 0x1234,
                subIndex: 0,
                dataType: DataType.VISIBLE_STRING
            });

            expect(result).to.equal(testString);

            await device.sdo.download({
                serverId: device.id,
                data: result,
                dataType: DataType.VISIBLE_STRING,
                index: 0x1234,
                subIndex: 0
            });

            device.stop();
        });

        it('should transfer to any valid node id [1 - 127]', async function () {
            let device;
            for(let id = 1; id < 0x7F; ++id) {
                device = new Device({ id, loopback: true });
                device.eds.addSdoClientParameter(id);
                device.eds.addSdoServerParameter(id);
                device.start();

                await device.sdo.download({
                    serverId: device.id,
                    data: 'long visible string',
                    dataType: DataType.VISIBLE_STRING,
                    index: 9,
                });

                const result = await device.sdo.upload({
                    serverId: device.id,
                    index: 9,
                    dataType: DataType.VISIBLE_STRING,
                });

                expect(result).to.equal('long visible string');
                device.stop();
            }
        });

        it('should handle large transfers', async function () {
            const device = new Device({ id: 0xA, loopback: true });
            device.eds.addSdoClientParameter(device.id);
            device.eds.addSdoServerParameter(device.id);
            device.start();

            const data = Buffer.alloc(65*1024);
            for (let i = 0; i < data.length; ++i)
                data[i] = Math.floor(Math.random() * 0xff);

            device.eds.addEntry(0x1234, {
                parameterName: 'A long buffer',
                dataType: DataType.DOMAIN,
                accessType: AccessType.READ_WRITE,
            });

            await device.sdo.download({
                serverId: device.id,
                data: data,
                dataType: DataType.DOMAIN,
                index: 0x1234,
                blockTransfer: false,
            });

            const result = await device.sdo.upload({
                serverId: device.id,
                dataType: DataType.DOMAIN,
                index: 0x1234,
                blockTransfer: false,
            });

            expect(Buffer.compare(data, result)).to.equal(0);
            device.stop();
        });
    });

    describe('Block transfer', function () {
        for (let [type, value] of shortTypes) {
            it('should transfer ' + type, async function () {
                const device = new Device({ id: 0xA, loopback: true });
                device.eds.addSdoClientParameter(device.id);
                device.eds.addSdoServerParameter(device.id);
                device.start();

                const index = DataType[type];
                await device.sdo.download({
                    serverId: device.id,
                    data: value,
                    dataType: type,
                    index: index,
                    blockTransfer: true,
                });

                const result = await device.sdo.upload({
                    serverId: device.id,
                    index: index,
                    dataType: type,
                    blockTransfer: true,
                });

                if (Buffer.isBuffer(result))
                    expect(Buffer.compare(result, value)).to.equal(0);
                else
                    expect(result).to.equal(value);

                device.stop();
            });
        }

        for (let [type, value] of longTypes) {
            it('should transfer ' + type, async function () {
                const device = new Device({ id: 0xA, loopback: true });
                device.eds.addSdoClientParameter(device.id);
                device.eds.addSdoServerParameter(device.id);
                device.start();

                const index = DataType[type];
                await device.sdo.download({
                    serverId: device.id,
                    data: value,
                    dataType: type,
                    index: index,
                    blockTransfer: true,
                });

                const result = await device.sdo.upload({
                    serverId: device.id,
                    index: index,
                    dataType: type,
                    blockTransfer: true,
                });

                if (result instanceof Date)
                    expect(result.getTime()).to.equal(value.getTime());
                else if (Buffer.isBuffer(result))
                    expect(Buffer.compare(result, value)).to.equal(0);
                else if (typeof result == 'bigint')
                    expect(Number(result)).to.equal(Number(value));
                else
                    expect(result).to.equal(value);

                device.stop();
            });
        }

        it('should handle large transfers', async function () {
            const device = new Device({ id: 0xA, loopback: true });
            device.eds.addSdoClientParameter(device.id);
            device.eds.addSdoServerParameter(device.id);
            device.start();

            const data = Buffer.alloc(65*1024);
            for (let i = 0; i < data.length; ++i)
                data[i] = Math.floor(Math.random() * 0xff);

            device.sdo.setBlockSize(127);
            device.sdoServer.setBlockSize(127);
            device.sdoServer.setBlockInterval(0);

            device.eds.addEntry(0x1234, {
                parameterName: 'A long buffer',
                dataType: DataType.DOMAIN,
                accessType: AccessType.READ_WRITE,
            });

            await device.sdo.download({
                serverId: device.id,
                data: data,
                dataType: DataType.DOMAIN,
                index: 0x1234,
                blockTransfer: true,
                blockInterval: 0,
            });

            const result = await device.sdo.upload({
                serverId: device.id,
                dataType: DataType.DOMAIN,
                index: 0x1234,
                blockTransfer: true,
            });

            expect(Buffer.compare(data, result)).to.equal(0);
            device.stop();
        });
    });
});
