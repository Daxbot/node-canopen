#!/usr/bin/env node

const { Device, LssMode } = require('../../index.js');

/* eslint no-console: "off", "no-constant-condition": "off" */

/**
 * LSS fastscan example.
 *
 * This example shows how configure a network containing multiple LSS slaves
 * using LSS fastscan.
 *
 * @param {Device} device - Device object.
 * @param {number} nodeId - node id to assign.
 */
async function main(device, nodeId=0x20) {
    // Set exactly 1 node into configuration mode.
    const result = await device.lss.fastscan();
    if (result === null) {
        console.log('All nodes configured!');
        return;
    }

    console.log('Node found:');
    console.log(`  Vendor id: 0x${result.vendorId.toString(16)}`);
    console.log(`  Product code: 0x${result.productCode.toString(16)}`);
    console.log(`  Revision number: 0x${result.revisionNumber.toString(16)}`);
    console.log(`  Serial number: 0x${result.serialNumber.toString(16)}`);

    // Set the new node id.
    console.log(`Setting node to id 0x${nodeId}`);
    await device.lss.configureNodeId(nodeId++);

    // Switch selected node into operation mode. */
    device.lss.switchModeGlobal(LssMode.OPERATION);
}

if (require.main === module) {
    // Connect the Device with a socketcan RawChannel object.
    const can = require('socketcan');
    const channel = can.createRawChannel('can0');
    const device = new Device({ enableLss: true });

    device.addListener('message', (m) => channel.send(m));
    channel.addListener('onMessage', (m) => device.receive(m));
    channel.start();

    main(device).then(() => channel.stop());
}

module.exports = exports = main;
