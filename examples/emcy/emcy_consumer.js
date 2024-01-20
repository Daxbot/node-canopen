#!/usr/bin/env node

const { Device } = require('../../index.js');

/* eslint no-console: "off" */

/**
 * EMCY consumer example.
 *
 * This example shows how to listen for CANopen emergency objects.
 *
 * @param {Device} device - Device object.
 */
async function main(device) {
    await new Promise((resolve) => {
        device.emcy.on('emergency', ({ cobId, em }) => {
            console.log('Emergency message from 0x' + cobId.toString(16));
            console.log(em.toString(), em.info);
            device.stop();
            resolve();
        });

        device.eds.addEmcyConsumer(0x8A);
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
