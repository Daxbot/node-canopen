#!/usr/bin/env node

/**
 * LSS consumer example.
 *
 * This example shows how create an LSS consumer.
 */

/* eslint no-console: "off", "no-constant-condition": "off" */

const { Device } = require('../index.js');
const can = require('socketcan');

// Step 1: Create a new Device.
const device = new Device();

// Step 2: Create a new socketcan RawChannel object.
const channel = can.createRawChannel('can0');

// Step 3: Enable LSS support in the EDS file.
device.eds.lssSupported = true;

// Step 4: Set the LSS id.
device.lss.vendorId = Math.floor(Math.random() * 0xffffffff);
device.lss.productCode = Math.floor(Math.random() * 0xffffffff);
device.lss.revisionNumber = Math.floor(Math.random() * 0xffffffff);
device.lss.serialNumber = Math.floor(Math.random() * 0xffffffff);

// Step 5: Initialize and start the node.
channel.addListener('onMessage', (message) => device.receive(message));
device.setTransmitFunction((message) => channel.send(message));

device.init();
channel.start();

device.on('lssChangeMode', (newMode) => {
    console.log('Changed LSS mode to', newMode);
});

device.on('lssChangeDeviceId', (newId) => {
    console.log('Changed device id to', newId);
});