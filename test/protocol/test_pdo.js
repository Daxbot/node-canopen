const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, ObjectType, AccessType, DataType } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('PDO', function() {
    let device = null;

    beforeEach(function() {
        device = new Device({ id: 0xA, loopback: true });

        /* RPDO communication parameter. */
        device.eds.addEntry(0x1400, {
            'ParameterName':    'RPDO communication parameter',
            'ObjectType':       ObjectType.RECORD,
            'SubNumber':        6,
        });
        device.eds.addSubEntry(0x1400, 1, {
            'ParameterName':    'COB-ID RPDO',
            'DataType':         DataType.UNSIGNED32,
            'AccessType':       AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1400, 2, {
            'ParameterName':    'transmission type',
            'DataType':         DataType.UNSIGNED8,
            'AccessType':       AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1400, 3, {
            'ParameterName':    'inhibit time',
            'DataType':         DataType.UNSIGNED16,
            'AccessType':       AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1400, 5, {
            'ParameterName':    'event timer',
            'DataType':         DataType.UNSIGNED16,
            'AccessType':       AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1400, 6, {
            'ParameterName':    'SYNC start value',
            'DataType':         DataType.UNSIGNED8,
            'AccessType':       AccessType.READ_WRITE,
        });

        /* RPDO mapping parameter. */
        device.eds.addEntry(0x1600, {
            'ParameterName':    'RPDO mapping parameter',
            'ObjectType':       ObjectType.RECORD,
            'SubNumber':        1,
        });
        device.eds.addSubEntry(0x1600, 1, {
            'ParameterName':    'RPDO mapped object 1',
            'DataType':         DataType.UNSIGNED32,
            'AccessType':       AccessType.READ_WRITE,
        });

        /* TPDO communication parameter. */
        device.eds.addEntry(0x1800, {
            'ParameterName':    'TPDO communication parameter',
            'ObjectType':       ObjectType.RECORD,
            'SubNumber':        6,
        });
        device.eds.addSubEntry(0x1800, 1, {
            'ParameterName':    'COB-ID TPDO',
            'DataType':         DataType.UNSIGNED32,
            'AccessType':       AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1800, 2, {
            'ParameterName':    'transmission type',
            'DataType':         DataType.UNSIGNED8,
            'AccessType':       AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1800, 3, {
            'ParameterName':    'inhibit time',
            'DataType':         DataType.UNSIGNED16,
            'AccessType':       AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1800, 5, {
            'ParameterName':    'event timer',
            'DataType':         DataType.UNSIGNED16,
            'AccessType':       AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1800, 6, {
            'ParameterName':    'SYNC start value',
            'DataType':         DataType.UNSIGNED8,
            'AccessType':       AccessType.READ_WRITE,
        });

        /* TPDO mapping parameter. */
        device.eds.addEntry(0x1A00, {
            'ParameterName':    'TPDO mapping parameter',
            'ObjectType':       ObjectType.RECORD,
            'SubNumber':        1,
        });
        device.eds.addSubEntry(0x1A00, 1, {
            'ParameterName':    'TPDO mapped object 1',
            'DataType':         DataType.UNSIGNED32,
            'AccessType':       AccessType.READ_WRITE,
        });
    });

    afterEach(function() {
        delete device;
    });

    it('should produce a PDO object', function(done) {
        /* Map 0x05 to TPDO 0x18A. */
        device.setValueArray(0x1800, 1, 0x180);
        device.setValueArray(0x1A00, 1, (0x05 << 16) | 8);
        device.setValueArray(0x1A00, 0, 1);

        device.init();
        device.addListener('message', () => { done(); });
        device.pdo.write(0x18A);
    });

    it('should emit on consuming a PDO object', function(done) {
        /* Map 0x05 to TPDO 0x20A. */
        device.setValueArray(0x1800, 1, 0x200);
        device.setValueArray(0x1A00, 1, (0x05 << 16) | 8);
        device.setValueArray(0x1A00, 0, 1);

        /* Map 0x05 to RPDO 0x20A. */
        device.setValueArray(0x1400, 1, 0x200);
        device.setValueArray(0x1600, 1, (0x05 << 16) | 8);
        device.setValueArray(0x1600, 0, 1);

        /* Change the value of 0x05. */
        device.setValue(0x05, 1);

        device.init();
        device.on('pdo', ([pdo]) => {
            /* Expect the new value. */
            expect(pdo.value).to.equal(1);
            done();
        });
        device.pdo.write(0x20A);
    });
});
