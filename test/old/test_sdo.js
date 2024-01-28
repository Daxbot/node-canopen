const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, AccessType, DataType } = require('../../index.js');

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

describe('Sdo', function() {
    let device = null;

    beforeEach(function() {
        device = new Device({ id: 0xA, loopback: true });
        device.sdo.addServer(device.id);
        device.sdoServer.addClient(device.id);
    });

    describe('Expediated transfer', function() {
        for(let [type, value] of shortTypes) {
            it("should transfer " + type, function() {
                device.init();

                const index = DataType[type];
                return device.sdo.download({
                    serverId: device.id,
                    data: value,
                    dataType: type,
                    index: index,
                })
                .then(() => {
                    return device.sdo.upload({
                        serverId: device.id,
                        index: index,
                        dataType: type,
                    });
                })
                .then((result) => {
                    if(Buffer.isBuffer(result))
                        expect(Buffer.compare(result, value)).to.equal(0);
                    else
                        expect(result).to.equal(value);
                });
            });
        }
    });

    describe('Segmented transfer', function() {
        for(let [type, value] of longTypes) {
            it("should transfer " + type, function() {
                device.init();

                const index = DataType[type];
                return device.sdo.download({
                    serverId: device.id,
                    data: value,
                    dataType: type,
                    index: index,
                })
                .then(() => {
                    return device.sdo.upload({
                        serverId: device.id,
                        index: index,
                        dataType: type,
                    });
                })
                .then((result) => {
                    if(result instanceof Date)
                        expect(result.getTime()).to.equal(value.getTime());
                    else if(Buffer.isBuffer(result))
                        expect(Buffer.compare(result, value)).to.equal(0);
                    else if(typeof result == 'bigint')
                        expect(Number(result)).to.equal(Number(value));
                    else
                        expect(result).to.equal(value);
                });
            });
        }

        it('should transfer subindexes >= 1', async function() {
            const testString = 'I am a long string that will take multiple messages to transfer'
            device.init();
            device.eds.addEntry(0x1234, {
                parameterName:  'Test entry',
                objectType:     6,
                subNumber:      1
            });
            device.eds.addSubEntry(0x1234, 0, {
                parameterName:  'A long name',
                dataType:       DataType.VISIBLE_STRING,
                accessType:     AccessType.READ_WRITE,
                defaultValue:   testString,
            });

            const result = await device.sdo.upload({
                serverId: device.id,
                index: 0x1234,
                subIndex: 0,
                dataType: DataType.VISIBLE_STRING
            });

            expect(result).to.equal(testString)

            return device.sdo.download({
                serverId: device.id,
                data: result,
                dataType: DataType.VISIBLE_STRING,
                index: 0x1234,
                subIndex: 0
            });
        });
    });

    describe('Block transfer', function() {
        for(let [type, value] of shortTypes) {
            it("should transfer " + type, function() {
                device.init();

                const index = DataType[type];
                return device.sdo.download({
                    serverId: device.id,
                    data: value,
                    dataType: type,
                    index: index,
                    blockTransfer: true,
                })
                .then(() => {
                    return device.sdo.upload({
                        serverId: device.id,
                        index: index,
                        dataType: type,
                        blockTransfer: true,
                    });
                })
                .then((result) => {
                    if(Buffer.isBuffer(result))
                        expect(Buffer.compare(result, value)).to.equal(0);
                    else
                        expect(result).to.equal(value);
                });
            });
        }

        for(let [type, value] of longTypes) {
            it("should transfer " + type, function() {
                device.init();

                const index = DataType[type];
                return device.sdo.download({
                    serverId: device.id,
                    data: value,
                    dataType: type,
                    index: index,
                    blockTransfer: true,
                })
                .then(() => {
                    return device.sdo.upload({
                        serverId: device.id,
                        index: index,
                        dataType: type,
                        blockTransfer: true,
                    });
                })
                .then((result) => {
                    if(result instanceof Date)
                        expect(result.getTime()).to.equal(value.getTime());
                    else if(Buffer.isBuffer(result))
                        expect(Buffer.compare(result, value)).to.equal(0);
                    else if(typeof result == 'bigint')
                        expect(Number(result)).to.equal(Number(value));
                    else
                        expect(result).to.equal(value);
                });
            });
        }

        it('should use multiple blocks', function() {
            const data = Buffer.alloc(1024);
            for(let i = 0; i < 1024; ++i)
                data[i] = Math.floor(Math.random() * 0xff);

            device.init();
            device.sdo.blockSize = 1;
            device.sdoServer.blockSize = 1;

            device.eds.addEntry(0x1234, {
                parameterName:  'A long buffer',
                dataType:       DataType.DOMAIN,
                accessType:     AccessType.READ_WRITE,
            });

            return device.sdo.download({
                serverId: device.id,
                data: data,
                dataType: DataType.DOMAIN,
                index: 0x1234,
                blockTransfer: true,
            })
            .then(() => {
                return device.sdo.upload({
                    serverId: device.id,
                    dataType: DataType.DOMAIN,
                    index: 0x1234,
                    blockTransfer: true,
                });
            })
            .then((result) => {
                expect(Buffer.compare(data, result)).to.equal(0);
            });
        });
    });
});
