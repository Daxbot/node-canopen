/** TPDO example.
 *
 * This example shows how to map data objects to be transmitted via PDO.
 */

const {EDS, Device} = require('../index.js');
const can = require('socketcan');

/** Step 1: Create a new socketcan RawChannel object. */
const channel = can.createRawChannel('vcan0');

/** Step 2: Create a new Device. */
node = new Device({ id: 0x9, channel: channel });

/** Step 3: Configure the TPDO communication and mapping parameters. */
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

/** Step 4: Create an additional entry to be mapped. */
node.EDS.addEntry(0x2000, {
    ParameterName:      'Test object',
    ObjectType:         EDS.objectTypes.VAR,
    DataType:           EDS.dataTypes.UNSIGNED32,
    AccessType:         EDS.accessTypes.READ_WRITE,
    DefaultValue:       0x12345678,
});

/** Step 5: Map entry 0x2000 to TPDO (0x180 + node.id). */
node.setValueArray(0x1800, 1, 0x180);
node.setValueArray(0x1A00, 1, (0x2000 << 16) | 32);

/** Step 6: Initialize the node. */
node.init();
channel.start();

/** Step 7: Trigger the TPDO. */
node.PDO.write(0x180 + node.id);

setTimeout(() => {
    process.exit();
}, 1000);
