#!/usr/bin/env node

/**
 * LSS fastscan example.
 *
 * This example shows how configure a network containing multiple LSS slaves
 * using LSS fastscan.
 */

const { Device, LssMode } = require('../index.js');
const can = require('socketcan');

/** Step 1: Create a new Device. */
const device = new Device({ id: 0xa });

/** Step 2: Create a new socketcan RawChannel object. */
const channel = can.createRawChannel('can0');

/** Step 3: Enable LSS support in the EDS file. */
device.eds.lssSupported = true;

/** Step 4: Initialize and start the node. */
channel.addListener('onMessage', (message) => { device.receive(message); });
device.transmit((message) => { channel.send(message); });

device.init();
channel.start();

/** Step 5: Select and configure one node at a time. */
new Promise(async (resolve) => {
    let nodeId = 0x20;

    while(1) {
        /** Step 5a: Set exactly 1 node into configuration mode. */
        const result = await device.lss.fastscan();
        if(result === null) {
            console.log('All nodes configured!');
            resolve();
            break;
        }

        /** Step 5b:  Set the new node id. */
        console.log(`Setting node to id 0x${nodeId}`);
        await device.lss.configureNodeId(nodeId++);

        /** Step 5c: Switch selected node into operation mode. */
        device.lss.switchModeGlobal(LssMode.OPERATION);
    }
})
.finally(() => channel.stop());
