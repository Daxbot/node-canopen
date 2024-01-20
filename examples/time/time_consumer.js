#!/usr/bin/env node

const { Device } = require('../../index.js');

/* eslint no-console: "off" */

/**
 * Time consumer example.
 *
 * This example shows how to create a CANopen device that consumes TIME objects.
 *
 * @param {Device} device - Device object.
 */
async function main(device) {
    await new Promise((resolve) => {
        device.time.on('time', (date) => {
            console.log(date);
            device.stop();
            resolve();
        });

        // Consume Time messages with ID 0x100.
        device.eds.setTimeCobId({ cobId: 0x100, consume: true });
        device.start();
    });
}

if (require.main === module) {
    // Connect the Device with a socketcan RawChannel object.
    const can = require('socketcan');
    const channel = can.createRawChannel('can0');
    const device = new Device({ id: 0xA });

    device.addListener('message', (m) => channel.send(m));
    channel.addListener('onMessage', (m) => device.receive(m));
    channel.start();

    main(device).then(() => channel.stop());
}

module.exports = exports = main;
