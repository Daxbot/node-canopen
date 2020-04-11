const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const {EDS, Device, COError} = require('../../index.js');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('SDO', function() {
    let node = null;

    beforeEach(function() {
        node = new Device({ id: 0xA, loopback: true });

        /* SDO server parameters. */
        node.EDS.addEntry(0x1200, {
            ParameterName:      'SDO server parameter',
            ObjectType:         EDS.objectTypes.RECORD,
            SubNumber:          3,
        });
        node.EDS.addSubEntry(0x1200, 1, {
            ParameterName:      'COB-ID client to server',
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
            DefaultValue:       0x600,
        });
        node.EDS.addSubEntry(0x1200, 2, {
            ParameterName:      'COB-ID server to client',
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
            DefaultValue:       0x580,
        });

        /* SDO client parameters. */
        node.EDS.addEntry(0x1280, {
            ParameterName:      'SDO client parameter',
            ObjectType:         EDS.objectTypes.RECORD,
            SubNumber:          4,
        });
        node.EDS.addSubEntry(0x1280, 1, {
            ParameterName:      'COB-ID client to server',
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
            DefaultValue:       0x600,
        });
        node.EDS.addSubEntry(0x1280, 2, {
            ParameterName:      'COB-ID server to client',
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
            DefaultValue:       0x580,
        });
        node.EDS.addSubEntry(0x1280, 3, {
            ParameterName:      'Node-ID of the SDO server',
            DataType:           EDS.dataTypes.UNSIGNED8,
            AccessType:         EDS.accessTypes.READ_WRITE,
            DefaultValue:       node.id,
        });
    });

    afterEach(function() {
        delete node;
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
            OCTET_STRING: '1234',
            UNICODE_STRING: '\u03b1',
            REAL32: 1.0,
        };

        for(const key of Object.keys(testValues)) {
            it("should transfer " + key, function() {
                node.init();

                const index = EDS.dataTypes[key];
                return node.SDO.download({
                    serverId: node.id,
                    data: testValues[key],
                    dataType: key,
                    index: index
                })
                .then(() => {
                    return node.SDO.upload({
                        serverId: node.id,
                        index: index,
                        dataType: key
                    });
                })
                .then((value) => {
                    expect(value).to.equal(testValues[key]);
                });
            });
        }
    });

    describe('Segmented transfer', function() {
        const testValues = {
            INTEGER40: -0x1234567890,
            INTEGER48: -0x1234567890AB,
            UNSIGNED40: 0x1234567890,
            UNSIGNED48: 0x1234567890AB,
            VISIBLE_STRING: 'long visible string',
            OCTET_STRING: '12345678',
            UNICODE_STRING: '\u03b1\u03b2\u03b3\u03b4\u03b5\u03b6',
            REAL64: Math.PI,
            TIME_OF_DAY: new Date(),
            TIME_DIFFERENCE: new Date(),
        };

        for(const key of Object.keys(testValues)) {
            it("should transfer " + key, function() {
                node.init();

                const index = EDS.dataTypes[key];
                return node.SDO.download({
                    serverId: node.id,
                    data: testValues[key],
                    dataType: key,
                    index: index
                })
                .then(() => {
                    return node.SDO.upload({
                        serverId: node.id,
                        index: index,
                        dataType: key
                    });
                })
                .then((value) => {
                    if(value instanceof Date)
                        expect(value.getTime()).to.equal(testValues[key].getTime());
                    else
                        expect(value).to.equal(testValues[key]);
                });
            });
        }
    });

    describe('Error handling', function() {
        it('should abort if timeout is exceeded', function() {
            // Set server to non-existant COB-ID
            node.setValueArray(0x1280, 3, 0x1);
            node.init();

            return expect(node.SDO.upload({
                serverId: 0x1,
                index: 0x1000,
                subIndex: 1
            })).to.be.rejectedWith(COError);
        });
    });
});
