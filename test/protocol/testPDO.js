const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const {EDS, Device} = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('PDO', function() {
    let node = null;

    beforeEach(function() {
        node = new Device({ id: 0xA, loopback: true });

        /* RPDO communication parameter. */
        node.EDS.addEntry(0x1400, {
            ParameterName:      'RPDO communication parameter',
            ObjectType:         EDS.objectTypes.RECORD,
            SubNumber:          6,
        });
        node.EDS.addSubEntry(0x1400, 1, {
            ParameterName:      'COB-ID RPDO',
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
        });
        node.EDS.addSubEntry(0x1400, 2, {
            ParameterName:      'transmission type',
            DataType:           EDS.dataTypes.UNSIGNED8,
            AccessType:         EDS.accessTypes.READ_WRITE,
        });
        node.EDS.addSubEntry(0x1400, 3, {
            ParameterName:      'inhibit time',
            DataType:           EDS.dataTypes.UNSIGNED16,
            AccessType:         EDS.accessTypes.READ_WRITE,
        });
        node.EDS.addSubEntry(0x1400, 5, {
            ParameterName:      'event timer',
            DataType:           EDS.dataTypes.UNSIGNED16,
            AccessType:         EDS.accessTypes.READ_WRITE,
        });
        node.EDS.addSubEntry(0x1400, 6, {
            ParameterName:      'SYNC start value',
            DataType:           EDS.dataTypes.UNSIGNED8,
            AccessType:         EDS.accessTypes.READ_WRITE,
        });

        /* RPDO mapping parameter. */
        node.EDS.addEntry(0x1600, {
            ParameterName:      'RPDO mapping parameter',
            ObjectType:         EDS.objectTypes.RECORD,
            SubNumber:          1,
        });
        node.EDS.addSubEntry(0x1600, 1, {
            ParameterName:      'RPDO mapped object 1',
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
        });

        /* TPDO communication parameter. */
        node.EDS.addEntry(0x1800, {
            ParameterName:      'TPDO communication parameter',
            ObjectType:         EDS.objectTypes.RECORD,
            SubNumber:          6,
        });
        node.EDS.addSubEntry(0x1800, 1, {
            ParameterName:      'COB-ID TPDO',
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
        });
        node.EDS.addSubEntry(0x1800, 2, {
            ParameterName:      'transmission type',
            DataType:           EDS.dataTypes.UNSIGNED8,
            AccessType:         EDS.accessTypes.READ_WRITE,
        });
        node.EDS.addSubEntry(0x1800, 3, {
            ParameterName:      'inhibit time',
            DataType:           EDS.dataTypes.UNSIGNED16,
            AccessType:         EDS.accessTypes.READ_WRITE,
        });
        node.EDS.addSubEntry(0x1800, 5, {
            ParameterName:      'event timer',
            DataType:           EDS.dataTypes.UNSIGNED16,
            AccessType:         EDS.accessTypes.READ_WRITE,
        });
        node.EDS.addSubEntry(0x1800, 6, {
            ParameterName:      'SYNC start value',
            DataType:           EDS.dataTypes.UNSIGNED8,
            AccessType:         EDS.accessTypes.READ_WRITE,
        });

        /* TPDO mapping parameter. */
        node.EDS.addEntry(0x1A00, {
            ParameterName:      'TPDO mapping parameter',
            ObjectType:         EDS.objectTypes.RECORD,
            SubNumber:          1,
        });
        node.EDS.addSubEntry(0x1A00, 1, {
            ParameterName:      'TPDO mapped object 1',
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
        });
    });

    afterEach(function() {
        delete node;
    });

    it('should produce a PDO object', function(done) {
        /* Map 0x05 to TPDO 0x18A. */
        node.setValueArray(0x1800, 1, 0x180);
        node.setValueArray(0x1A00, 1, (0x05 << 16) | 8);
        node.setValueArray(0x1A00, 0, 1);

        node.init();
        node.channel.addListener('onMessage', () => { done(); });
        node.PDO.write(0x18A);
    });

    it('should emit on consuming a PDO object', function(done) {
        /* Map 0x05 to TPDO 0x20A. */
        node.setValueArray(0x1800, 1, 0x200);
        node.setValueArray(0x1A00, 1, (0x05 << 16) | 8);
        node.setValueArray(0x1A00, 0, 1);

        /* Map 0x05 to RPDO 0x20A. */
        node.setValueArray(0x1400, 1, 0x200);
        node.setValueArray(0x1600, 1, (0x05 << 16) | 8);
        node.setValueArray(0x1600, 0, 1);

        /* Change the value of 0x05. */
        node.setValue(0x05, 1);

        node.init();
        node.on('pdo', ([pdo]) => {
            /* Expect the new value. */
            expect(pdo.value).to.equal(1);
            done();
        });
        node.PDO.write(0x20A);
    });
});
