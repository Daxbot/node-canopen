#!/usr/bin/env node

/**
 * SDO server example.
 *
 * This example shows how to create a CANopen device that serves values from its
 * Object Dictionary using the SDO protocol.
 */

/* eslint no-console: "off" */

const clientId = 0xa;
const serverId = 0xb;

const { Device, ObjectType, AccessType, DataType } = require('../index.js');
const can = require('socketcan');

// Step 1: Create a new Device.
const device = new Device({ id: serverId });

// Step 2: Create a new socketcan RawChannel object.
const channel = can.createRawChannel('can0');

// Step 3: Initialize and start the node.
channel.addListener('onMessage', (message) => device.receive(message));
device.setTransmitFunction((message) => channel.send(message));

device.init();
channel.start();

// Step 4: Configure the SDO server parameters.
device.sdoServer.addClient(clientId);

// Step 5: Create an additional entry to be accessed by the SDO client.
device.eds.addEntry(0x2000, {
    parameterName: 'Test string',
    objectType: ObjectType.VAR,
    dataType: DataType.VISIBLE_STRING,
    accessType: AccessType.READ_WRITE,
});

// Step 6: Register a callback to print changes to 0x2000.
const obj2000 = device.eds.getEntry(0x2000);
obj2000.addListener('update', (data) => console.log(data.value));

console.log("Press Ctrl-C to quit");