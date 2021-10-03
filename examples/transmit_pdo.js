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

// Step 3: Create an entry to be mapped.
const entry = device.eds.addEntry(0x2000, {
    parameterName:  'Test object',
    objectType:     ObjectType.VAR,
    dataType:       DataType.UNSIGNED32,
    accessType:     AccessType.READ_WRITE,
    defaultValue:   0x12345678,
});

// Step 4: Configure the TPDO communication and mapping parameters.
device.pdo.addTransmit(0x180, [entry]);

// Step 5: Initialize and start the node.
channel.addListener('onMessage', (message) => device.receive(message));
device.setTransmitFunction((message) => channel.send(message));

device.init();
device.pdo.start();
channel.start();

// Step 6: Trigger the TPDO.
device.pdo.write(0x180 + device.id);

setTimeout(() => {
    device.pdo.stop();
    channel.stop();
}, 1000);
