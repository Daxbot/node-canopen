#!/usr/bin/env node

const { Device } = require('../../index.js');

/* eslint no-console: "off" */

/**
 * Sync consumer example.
 *
 * This example shows how to create a CANopen device that consumes network
 * synchronization objects.
 *
 * @param {Device} device - Device object.
 */
async function main(device) {
    await new Promise((resolve) => {
        // Consume Sync messages with ID 0x80
        device.eds.setSyncCobId({ cobId: 0x80 });
        device.start();

        let timer = null;
        device.sync.on('sync', (counter) => {
            console.log('Sync counter:', counter);

            if (!timer) {
                timer = setTimeout(() => {
                    device.stop();
                    resolve();
                }, 500);
            }
            else {
                timer.refresh();
            }
        });
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
