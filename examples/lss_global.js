#!/usr/bin/env node

/**
 * LSS global example.
 *
 * This example shows how configure a network containing a single LSS slave
 * using LSS switch mode global.
 */

/* eslint no-console: "off" */

const { Device, LssMode } = require('../index.js');
const can = require('socketcan');

// Step 1: Create a new Device.
const device = new Device({ id: 0xa });

// Step 2: Create a new socketcan RawChannel object.
const channel = can.createRawChannel('can0');

// Step 3: Enable LSS support in the EDS file.
device.eds.lssSupported = true;

// Step 4: Initialize and start the node.
channel.addListener('onMessage', (message) => device.receive(message));
device.setTransmitFunction((message) => channel.send(message));

device.init();
channel.start();

// Step 5: Switch LSS slave into configuration mode.
device.lss.switchModeGlobal(LssMode.CONFIGURATION);

// Step 6:  Set the new node id.
device.lss.configureNodeId(0x7f)
    .then(() => {
        // Step 7: Switch LSS slave into operation mode.
        device.lss.switchModeGlobal(LssMode.OPERATION);
    })
    .catch((e) => console.log(e))
    .finally(() => channel.stop());
