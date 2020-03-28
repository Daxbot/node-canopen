const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const chaiBytes = require('chai-bytes');
const {EDS, Device, SDOError} = require('../../index.js');

const expect = chai.expect;
chai.use(chaiAsPromised);
chai.use(chaiBytes);

describe('SDO', function() {
    let node = null;

    beforeEach(function() {
        node = new Device({ id: 0xA, loopback: true });

        /* SDO server parameters. */
        node.EDS.addEntry(0x1200, {
            ParameterName:      'SDO server parameter',
            ObjectType:         EDS.objectTypes.RECORD,
            SubNumber:          2,
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
            SubNumber:          3,
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
            BOOLEAN: Buffer.from([1]),
            INTEGER8: Buffer.from([0x1]),
            INTEGER16: Buffer.from([0x1, 0x2]),
            INTEGER24: Buffer.from([0x1, 0x2, 0x3]),
            INTEGER32: Buffer.from([0x1, 0x2, 0x3, 0x4]),
            UNSIGNED8: Buffer.from([0x1]),
            UNSIGNED16: Buffer.from([0x1, 0x2]),
            UNSIGNED24: Buffer.from([0x1, 0x2, 0x3]),
            UNSIGNED32: Buffer.from([0x1, 0x2, 0x3, 0x4]),
            VISIBLE_STRING: Buffer.from('test'),
            OCTET_STRING: Buffer.from('1234'),
            UNICODE_STRING: Buffer.from('\u03b1'),
            REAL32: Buffer.alloc(4),
        };

        testValues["REAL32"].writeFloatLE(Math.PI);

        for(const key of Object.keys(testValues)) {
            it("should transfer " + key, function() {
                node.init();

                const index = EDS.dataTypes[key];
                return node.SDO.download(node.id, testValues[key], index)
                    .then(() => {
                        return node.SDO.upload(node.id, index);
                    })
                    .then((value) => {
                        expect(value).to.equalBytes(testValues[key]);
                    });
            });
        }
    });

    describe('Segmented transfer', function() {
        const testValues = {
            INTEGER40: Buffer.from([0x1, 0x2, 0x3, 0x4, 0x5]),
            INTEGER48: Buffer.from([0x1, 0x2, 0x3, 0x4, 0x5, 0x6]),
            INTEGER56: Buffer.from([0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x7]),
            INTEGER64: Buffer.from([0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x7, 0x8]),
            UNSIGNED40: Buffer.from([0x1, 0x2, 0x3, 0x4, 0x5]),
            UNSIGNED48: Buffer.from([0x1, 0x2, 0x3, 0x4, 0x5, 0x6]),
            UNSIGNED56: Buffer.from([0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x7]),
            UNSIGNED64: Buffer.from([0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x7, 0x8]),
            VISIBLE_STRING: Buffer.from('long visible string'),
            OCTET_STRING: Buffer.from('12345678'),
            UNICODE_STRING: Buffer.from('\u03b1\u03b2\u03b3\u03b4\u03b5\u03b6'),
            REAL64: Buffer.alloc(8),
            TIME_OF_DAY: null,
            TIME_DIFFERENCE: null,
        };

        testValues["REAL64"].writeDoubleLE(Math.PI);

        testValues["TIME_OF_DAY"] = EDS.typeToRaw(
            Date.now(), EDS.dataTypes.TIME_OF_DAY);

        testValues["TIME_DIFFERENCE"] = EDS.typeToRaw(
            Date.now(), EDS.dataTypes.TIME_DIFFERENCE);

        for(const key of Object.keys(testValues)) {
            it("should transfer " + key, function() {
                node.init();

                const index = EDS.dataTypes[key];
                return node.SDO.download(node.id, testValues[key], index)
                    .then(() => {
                        return node.SDO.upload(node.id, index);
                    })
                    .then((value) => {
                        expect(value).to.equalBytes(testValues[key]);
                    });
            });
        }
    });

    describe('Error handling', function() {
        it('should abort if timeout is exceeded', function() {
            // Set server to non-existant COB-ID
            node.setValueArray(0x1280, 3, 0x1);
            node.init();

            return expect(node.SDO.upload(0x1, 0x1000, 1)).to.be.rejectedWith(SDOError);
        });
    });
});
