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
            parameterName:  'RPDO communication parameter',
            objectType:     ObjectType.RECORD,
            subNumber:      6,
        });
        device.eds.addSubEntry(0x1400, 1, {
            parameterName:  'COB-ID RPDO',
            dataType:       DataType.UNSIGNED32,
            accessType:     AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1400, 2, {
            parameterName:  'transmission type',
            dataType:       DataType.UNSIGNED8,
            accessType:     AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1400, 3, {
            parameterName:  'inhibit time',
            dataType:       DataType.UNSIGNED16,
            accessType:     AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1400, 5, {
            parameterName:  'event timer',
            dataType:       DataType.UNSIGNED16,
            accessType:     AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1400, 6, {
            parameterName:  'SYNC start value',
            dataType:       DataType.UNSIGNED8,
            accessType:     AccessType.READ_WRITE,
        });

        /* RPDO mapping parameter. */
        device.eds.addEntry(0x1600, {
            parameterName:  'RPDO mapping parameter',
            objectType:     ObjectType.RECORD,
            subNumber:      1,
        });
        device.eds.addSubEntry(0x1600, 1, {
            parameterName:  'RPDO mapped object 1',
            dataType:       DataType.UNSIGNED32,
            accessType:     AccessType.READ_WRITE,
        });

        /* TPDO communication parameter. */
        device.eds.addEntry(0x1800, {
            parameterName:  'TPDO communication parameter',
            objectType:     ObjectType.RECORD,
            subNumber:      6,
        });
        device.eds.addSubEntry(0x1800, 1, {
            parameterName:  'COB-ID TPDO',
            dataType:       DataType.UNSIGNED32,
            accessType:     AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1800, 2, {
            parameterName:  'Transmission type',
            dataType:       DataType.UNSIGNED8,
            accessType:     AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1800, 3, {
            parameterName:  'Inhibit time',
            dataType:       DataType.UNSIGNED16,
            accessType:     AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1800, 5, {
            parameterName:  'Event timer',
            dataType:       DataType.UNSIGNED16,
            accessType:     AccessType.READ_WRITE,
        });
        device.eds.addSubEntry(0x1800, 6, {
            parameterName:  'SYNC start value',
            dataType:       DataType.UNSIGNED8,
            accessType:     AccessType.READ_WRITE,
        });

        /* TPDO mapping parameter. */
        device.eds.addEntry(0x1A00, {
            parameterName:  'TPDO mapping parameter',
            objectType:     ObjectType.RECORD,
            subNumber:      1,
        });
        device.eds.addSubEntry(0x1A00, 1, {
            parameterName:  'TPDO mapped object 1',
            dataType:       DataType.UNSIGNED32,
            accessType:     AccessType.READ_WRITE,
        });
    });

    it('should produce a PDO object', function(done) {
        /* Map 0x05 to TPDO 0x18A. */
        device.setValueArray(0x1800, 1, 0x180);
        device.setValueArray(0x1A00, 1, (0x05 << 16) | 8);
        device.setValueArray(0x1A00, 0, 1);

        device.init();
        device.addListener('message', () => {
            done();
        });
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
