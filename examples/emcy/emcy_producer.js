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
        device.eds.setEmcyCobId(0x8A);
        device.start();

        device.emcy.write({
            code: EmcyType.GENERIC_ERROR,
            info: Buffer.from([0x1, 0x2, 0x3, 0x4, 0x5]),
        });

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
