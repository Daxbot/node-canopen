#!/usr/bin/env node


const { Device } = require('../../index.js');

/**
 * Sync producer example.
 *
 * This example shows how to create a CANopen device that produces network
 * synchronization objects.
 *
 * @param {Device} device - Device object.
 */
async function main(device) {
    await new Promise((resolve) => {
        // Send Sync messages with ID 0x80
        device.eds.setSyncCobId({ cobId: 0x80, generate: true });
        device.eds.setSyncCyclePeriod(1e5); // Every 100 ms
        device.eds.setSyncOverflow(3); // Overflow at 3
        device.start();

        setTimeout(() => {
            device.stop();
            resolve();
        }, 500);
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
