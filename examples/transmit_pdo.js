#!/usr/bin/env node

/**
 * TPDO example.
 *
 * This example shows how to map data objects to be transmitted via PDO.
 */

const { Device, ObjectType, AccessType, DataType } = require('../index.js');
const can = require('socketcan');

// Step 1: Create a new Device.
const device = new Device({ id: 0xa });

// Step 2: Create a new socketcan RawChannel object.
const channel = can.createRawChannel('can0');

// Step 3: Configure the TPDO communication and mapping parameters.
device.eds.addEntry(0x1800, {
    parameterName:  'TPDO communication parameter',
    objectType:     ObjectType.RECORD,
    subNumber:      7,
});
device.eds.addSubEntry(0x1800, 1, {
    parameterName:  'COB-ID TPDO',
    dataType:       DataType.UNSIGNED32,
    accessType:     AccessType.READ_WRITE,
});
device.eds.addSubEntry(0x1800, 2, {
    parameterName:  'transmission type',
    dataType:       DataType.UNSIGNED8,
    accessType:     AccessType.READ_WRITE,
});
device.eds.addSubEntry(0x1800, 3, {
    parameterName:  'inhibit time',
    dataType:       DataType.UNSIGNED16,
    accessType:     AccessType.READ_WRITE,
});
device.eds.addSubEntry(0x1800, 5, {
    parameterName:  'event timer',
    dataType:       DataType.UNSIGNED16,
    accessType:     AccessType.READ_WRITE,
});
device.eds.addSubEntry(0x1800, 6, {
    parameterName:  'SYNC start value',
    dataType:       DataType.UNSIGNED8,
    accessType:     AccessType.READ_WRITE,
});

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

// Step 4: Create an additional entry to be mapped.
device.eds.addEntry(0x2000, {
    parameterName:  'Test object',
    objectType:     ObjectType.VAR,
    dataType:       DataType.UNSIGNED32,
    accessType:     AccessType.READ_WRITE,
    defaultValue:   0x12345678,
});

// Step 5: Map entry 0x2000 to TPDO (0x180 + node.id).
device.setValueArray(0x1800, 1, 0x180);
device.setValueArray(0x1A00, 1, (0x2000 << 16) | 32);
device.setValueArray(0x1A00, 0, 1);

// Step 6: Initialize and start the node.
channel.addListener('onMessage', (message) => device.receive(message));
device.setTransmitFunction((message) => channel.send(message));

device.init();
device.pdo.start();
channel.start();

// Step 7: Trigger the TPDO.
device.pdo.write(0x180 + device.id);

setTimeout(() => {
    device.pdo.stop();
    channel.stop();
}, 1000);
