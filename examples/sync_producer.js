#!/usr/bin/env node

/**
 * Sync producer example.
 *
 * This example shows how to create a CANopen device that produces network
 * synchronization objects.
 */

const { Device } = require('../index.js');
const can = require('socketcan');

/** Step 1: Create a new Device. */
const device = new Device({ id: 0xa });

/** Step 2: Create a new socketcan RawChannel object. */
const channel = can.createRawChannel('can0');

/** Step 3: Configure the COB-ID and cycle period. */
device.sync.cobId = 0x80;
device.sync.cyclePeriod = 1e6; // 1 second
device.sync.overflow = 10;
device.sync.generate = true;

/** Step 4: Initialize and start the node. */
channel.addListener('onMessage', (message) => { device.receive(message); });
device.transmit((message) => { channel.send(message); });

device.init();
device.sync.start();
channel.start();

console.log("Press Ctrl-C to quit");