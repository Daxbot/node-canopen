#!/usr/bin/env node

/**
 * EMCY message example.
 *
 * This example shows how to broadcast CANopen emergency objects.
 */

const { Device } = require('../index.js');
const can = require('socketcan');

// Step 1: Create a new Device.
const device = new Device({ id: 0xa });

// Step 2: Create a new socketcan RawChannel object.
const channel = can.createRawChannel('can0');

// Step 3: Configure the COB-ID.
device.emcy.cobId = 0x80;

// Step 4: Initialize and start the device.
channel.addListener('onMessage', (message) => device.receive(message));
device.setTransmitFunction((message) => channel.send(message));

device.init();
channel.start();

// Step 5: Produce an EMCY object.
device.emcy.write(0x1000);

setTimeout(() => channel.stop(), 1000);
