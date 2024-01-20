#!/usr/bin/env node

const { Device, EmcyType } = require('../../index.js');

/* eslint no-console: "off" */

/**
 * EMCY message example.
 *
 * This example shows how to broadcast CANopen emergency objects.
 *
 * @param {Device} device - Device object.
 */
async function main(device) {
    await new Promise((resolve) => {
        device.eds.setEmcyHistoryLength(1);
        device.eds.setEmcyCobId(0x8A);
        device.start();

        device.emcy.write(
            EmcyType.GENERIC_ERROR, Buffer.from([0x1, 0x2, 0x3, 0x4, 0x5]));

        // Check error history
        const lastError = device.emcy.history[0];
        console.log(`Sent 0x${lastError.toString(16)}`);

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
