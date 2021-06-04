#!/usr/bin/env node

/**
 * SDO server example.
 *
 * This example shows how to create a CANopen device that serves values from its
 * Object Dictionary using the SDO protocol.
 */

const serverId = 0xb;

const { Device, ObjectType, AccessType, DataType } = require('../index.js');
const can = require('socketcan');

/** Step 1: Create a new Device. */
const device = new Device({ id: serverId });

/** Step 2: Create a new socketcan RawChannel object. */
const channel = can.createRawChannel('can0');

/** Step 3: Configure the SDO server parameters. */
device.eds.addEntry(0x1200, {
    'ParameterName':    'SDO server parameter',
    'ObjectType':       ObjectType.RECORD,
    'SubNumber':        3,
});

device.eds.addSubEntry(0x1200, 1, {
    'ParameterName':    'COB-ID client to server',
    'DataType':         DataType.UNSIGNED32,
    'AccessType':       AccessType.READ_WRITE,
    'DefaultValue':     0x600,
});

device.eds.addSubEntry(0x1200, 2, {
    'ParameterName':    'COB-ID server to client',
    'DataType':         DataType.UNSIGNED32,
    'AccessType':       AccessType.READ_WRITE,
    'DefaultValue':     0x580,
});

/** Step 4: Create an additional entry to be accessed by the SDO client. */
device.eds.addEntry(0x2000, {
    'ParameterName':    'Test object',
    'ObjectType':       ObjectType.VAR,
    'DataType':         DataType.VISIBLE_STRING,
    'AccessType':       AccessType.READ_WRITE,
});

/** Step 5: Register a callback to print changes to 0x2000. */
const obj2000 = device.eds.getEntry(0x2000);
obj2000.addListener('update', (data) => { console.log(data.value); });

/** Step 6: Initialize and start the node. */
channel.addListener('onMessage', (message) => { device.receive(message); });
device.transmit((message) => { channel.send(message); });

device.init();
channel.start();

console.log("Press Ctrl-C to quit");