/**
 * TPDO example.
 *
 * This example shows how to map data objects to be transmitted via PDO.
 */

const { Device, ObjectType, AccessType, DataType } = require('../index.js');
const can = require('socketcan');

/** Step 1: Create a new Device. */
const device = new Device({ id: 0xa });

/** Step 2: Create a new socketcan RawChannel object. */
const channel = can.createRawChannel('can0');

/** Step 3: Configure the TPDO communication and mapping parameters. */
device.eds.addEntry(0x1800, {
    'ParameterName':    'TPDO communication parameter',
    'ObjectType':       ObjectType.RECORD,
    'SubNumber':        7,
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

/** Step 4: Create an additional entry to be mapped. */
device.eds.addEntry(0x2000, {
    'ParameterName':    'Test object',
    'ObjectType':       ObjectType.VAR,
    'DataType':         DataType.UNSIGNED32,
    'AccessType':       AccessType.READ_WRITE,
    'DefaultValue':     0x12345678,
});

/** Step 5: Map entry 0x2000 to TPDO (0x180 + node.id). */
device.setValueArray(0x1800, 1, 0x180);
device.setValueArray(0x1A00, 1, (0x2000 << 16) | 32);
device.setValueArray(0x1A00, 0, 1);

/** Step 6: Initialize and start the node. */
channel.addListener('onMessage', (message) => { device.receive(message); });
device.transmit((message) => { channel.send(message); });

device.init();
device.pdo.start();
channel.start();

/** Step 7: Trigger the TPDO. */
device.pdo.write(0x180 + device.id);

setTimeout(() => {
    process.exit();
}, 1000);
