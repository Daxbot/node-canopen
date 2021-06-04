#!/usr/bin/env node

/**
 * NMT example.
 *
 * This example shows how configure the device heartbeat and send NMT commands.
 */

const { Device } = require('../index.js');
const can = require('socketcan');

/** Step 1: Create a new Device. */
const device = new Device({ id: 0xa });

/** Step 2: Create a new socketcan RawChannel object. */
const channel = can.createRawChannel('can0');

/** Step 3: Configure the producer heartbeat time. */
device.nmt.producerTime = 500;

/** Step 4: Initialize and start the node. */
channel.addListener('onMessage', (message) => { device.receive(message); });
device.transmit((message) => { channel.send(message); });

device.init();
device.nmt.start();
channel.start();

/** Step 5: Stop the node using NMT commands. */
setTimeout(() => {
    device.nmt.stopNode(device.id);
    setTimeout(() => {
        device.nmt.stop();
        channel.stop();
    }, 2000);
}, 2000);
