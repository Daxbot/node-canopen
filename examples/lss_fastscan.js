#!/usr/bin/env node

/**
 * LSS fastscan example.
 *
 * This example shows how configure a network containing multiple LSS slaves
 * using LSS fastscan.
 */

/* eslint no-console: "off", "no-constant-condition": "off" */

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

/** LSS fastscan example. */
async function main() {
    let nodeId = 0x20;

    while(true) {
        /** Step 5a: Set exactly 1 node into configuration mode. */
        const result = await device.lss.fastscan();
        if(result === null) {
            console.log('All nodes configured!');
            break;
        }

        console.log('Node found:');
        console.log(`  Vendor id: 0x${result.vendorId.toString(16)}`);
        console.log(`  Product code: 0x${result.productCode.toString(16)}`);
        console.log(`  Revision number: 0x${result.revisionNumber.toString(16)}`);
        console.log(`  Serial number: 0x${result.serialNumber.toString(16)}`);

        /** Step 5b:  Set the new node id. */
        console.log(`Setting node to id 0x${nodeId}`);
        await device.lss.configureNodeId(nodeId++);

        /** Step 5c: Switch selected node into operation mode. */
        device.lss.switchModeGlobal(LssMode.OPERATION);
    }
}

// Step 5: Select and configure one node at a time.
main().finally(() => channel.stop());
