const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, ObjectType, AccessType, DataType } = require('../../index.js');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('SDO', function() {
    let device = null;

    beforeEach(function() {
        device = new Device({ id: 0xA, loopback: true });

        /* SDO server parameters. */
        device.eds.addEntry(0x1200, {
            'ParameterName':    'SDO server parameter',
            'ObjectType':       ObjectType.RECORD,
            'SubNumber':        3,
        });
        device.eds.addSubEntry(0x1200, 1, {
            'ParameterName':    'COB-ID client to server',
            'DataType':         DataType.UNSIGNED32,
            'AccessType':       AccessType.READ_WRITE,
            'DefaultValue':     0x600,
        });
        device.eds.addSubEntry(0x1200, 2, {
            'ParameterName':  'COB-ID server to client',
            'DataType':       DataType.UNSIGNED32,
            'AccessType':     AccessType.READ_WRITE,
            'DefaultValue':   0x580,
        });

        /* SDO client parameters. */
        device.eds.addEntry(0x1280, {
            'ParameterName':    'SDO client parameter',
            'ObjectType':       ObjectType.RECORD,
            'SubNumber':        4,
        });
        device.eds.addSubEntry(0x1280, 1, {
            'ParameterName':    'COB-ID client to server',
            'DataType':         DataType.UNSIGNED32,
            'AccessType':       AccessType.READ_WRITE,
            'DefaultValue':     0x600,
        });
        device.eds.addSubEntry(0x1280, 2, {
            'ParameterName':    'COB-ID server to client',
            'DataType':         DataType.UNSIGNED32,
            'AccessType':       AccessType.READ_WRITE,
            'DefaultValue':     0x580,
        });
        device.eds.addSubEntry(0x1280, 3, {
            'ParameterName':    'Node-ID of the SDO server',
            'DataType':         DataType.UNSIGNED8,
            'AccessType':       AccessType.READ_WRITE,
            'DefaultValue':     device.id,
        });
    });

    afterEach(function() {
        delete device;
    });

    describe('Expediated transfer', function() {
        const testValues = {
            BOOLEAN: true,
            INTEGER8: -0x12,
            INTEGER16: -0x1234,
            INTEGER24: -0x123456,
            INTEGER32: -0x12345678,
            UNSIGNED8: 0x12,
            UNSIGNED16: 0x1234,
            UNSIGNED24: 0x123456,
            UNSIGNED32: 0x12345678,
            VISIBLE_STRING: 'test',
            OCTET_STRING: Buffer.from([1, 2, 3, 4]),
            UNICODE_STRING: '\u03b1',
            REAL32: 1.0,
        };

        for(const key of Object.keys(testValues)) {
            it("should transfer " + key, function() {
                device.init();

                const index = DataType[key];
                return device.sdo.download({
                    serverId: device.id,
                    data: testValues[key],
                    dataType: key,
                    index: index
                })
                .then(() => {
                    return device.sdo.upload({
                        serverId: device.id,
                        index: index,
                        dataType: key
                    });
                })
                .then((value) => {
                    if(Buffer.isBuffer(value))
                        expect(Buffer.compare(value, testValues[key])).to.equal(0);
                    else
                        expect(value).to.equal(testValues[key]);
                });
            });
        }
    });

    describe('Segmented transfer', function() {
        const testValues = {
            INTEGER40: -0x1234567890,
            INTEGER48: -0x1234567890AB,
            INTEGER64: -1n,
            UNSIGNED40: 0x1234567890,
            UNSIGNED48: 0x1234567890AB,
            UNSIGNED64: 1n,
            VISIBLE_STRING: 'long visible string',
            OCTET_STRING: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]),
            UNICODE_STRING: '\u03b1\u03b2\u03b3\u03b4\u03b5\u03b6',
            REAL64: Math.PI,
            TIME_OF_DAY: new Date(),
            TIME_DIFFERENCE: new Date(),
        };

        for(const key of Object.keys(testValues)) {
            it("should transfer " + key, function() {
                device.init();

                const index = DataType[key];
                return device.sdo.download({
                    serverId: device.id,
                    data: testValues[key],
                    dataType: key,
                    index: index
                })
                .then(() => {
                    return device.sdo.upload({
                        serverId: device.id,
                        index: index,
                        dataType: key
                    });
                })
                .then((value) => {
                    if(value instanceof Date)
                        expect(value.getTime()).to.equal(testValues[key].getTime());
                    else if(Buffer.isBuffer(value))
                        expect(Buffer.compare(value, testValues[key])).to.equal(0);
                    else if(typeof value == 'bigint')
                        expect(Number(value)).to.equal(Number(testValues[key]));
                    else
                        expect(value).to.equal(testValues[key]);
                });
            });
        }

        it('should be able to transfer with subindexes >= 1', async function() {
            const testString = 'I am a quite a long string that will take multiple messages to transfer'
            device.init();
            device.eds.addEntry(0x1234, {
                'ParameterName':    'Test entry',
                'ObjectType':       6,
                'SubNumber':        1
            });
            device.eds.addSubEntry(0x1234, 0, {
                'ParameterName':    'A long name',
                'DataType':         DataType.VISIBLE_STRING,
                'AccessType':       AccessType.READ_WRITE,
                'DefaultValue':     testString,
            })

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
            })
        })
    });

    describe('Error handling', function() {
        it('should abort if timeout is exceeded', function() {
            // Set server to non-existant COB-ID
            device.setValueArray(0x1280, 3, 0x1);
            device.init();

            return expect(device.sdo.upload({
                serverId: 0x1,
                index: 0x1000,
                subIndex: 1
            })).to.be.rejectedWith("SDO protocol timed out");
        });
    });
});
