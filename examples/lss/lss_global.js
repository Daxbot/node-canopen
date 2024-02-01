#!/usr/bin/env node

const { Device, LssMode } = require('../../index.js');

/* eslint no-console: "off" */

/**
 * LSS global example.
 *
 * This example shows how configure a network containing a single LSS slave
 * using LSS switch mode global.
 *
 * @param {Device} device - Device object.
 */
async function main(device) {
    device.lss.switchModeGlobal(LssMode.CONFIGURATION);
    await device.lss.configureNodeId(0x7f);
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
