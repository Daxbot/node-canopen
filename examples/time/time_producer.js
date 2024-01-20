#!/usr/bin/env node

const { Device } = require('../../index.js');

/**
 * Time producer example.
 *
 * This example shows how to create a CANopen device that produces TIME objects.
 *
 * @param {Device} device - Device object.
 */
async function main(device) {
    await new Promise((resolve) => {
        // Send Time messages with ID 0x100.
        device.eds.setTimeCobId({ cobId: 0x100, produce: true });
        device.start();
        device.time.write();
        device.stop();
        resolve();
    });
}

if (require.main === module) {
    // Connect the Device with a socketcan RawChannel object.
    const can = require('socketcan');
    const channel = can.createRawChannel('can0');
    const device = new Device({ id: 0xB });

    device.addListener('message', (m) => channel.send(m));
    channel.addListener('onMessage', (m) => device.receive(m));
    channel.start();

    main(device).then(() => channel.stop());
}

module.exports = exports = main;
