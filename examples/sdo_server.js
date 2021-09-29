#!/usr/bin/env node

/**
 * SDO server example.
 *
 * This example shows how to create a CANopen device that serves values from its
 * Object Dictionary using the SDO protocol.
 */

/* eslint no-console: "off" */

const serverId = 0xb;

const { Device, ObjectType, AccessType, DataType } = require('../index.js');
const can = require('socketcan');

// Step 1: Create a new Device.
const device = new Device({ id: serverId });

// Step 2: Create a new socketcan RawChannel object.
const channel = can.createRawChannel('can0');

// Step 3: Configure the SDO server parameters.
device.sdoServer.cobIdRx = 0x600;
device.sdoServer.cobIdTx = 0x580;

// Step 4: Create an additional entry to be accessed by the SDO client.
device.eds.addEntry(0x2000, {
    parameterName:  'Test object',
    objectType:     ObjectType.VAR,
    dataType:       DataType.VISIBLE_STRING,
    accessType:     AccessType.READ_WRITE,
});

// Step 5: Register a callback to print changes to 0x2000.
const obj2000 = device.eds.getEntry(0x2000);
obj2000.addListener('update', (data) => console.log(data.value));

// Step 6: Initialize and start the node.
channel.addListener('onMessage', (message) => device.receive(message));
device.setTransmitFunction((message) => channel.send(message));

device.init();
channel.start();

console.log("Press Ctrl-C to quit");