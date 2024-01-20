#!/usr/bin/env node

const { Device } = require('../../index.js');

/**
 * NMT producer example.
 *
 * This example shows how configure the device heartbeat.
 *
 * @param {Device} device - Device object.
 */
async function main(device) {
    await new Promise((resolve) => {
        device.eds.setHeartbeatProducerTime(20);
        device.start();

        setTimeout(() => {
            // Enter NmtState.OPERATIONAL
            device.nmt.startNode();

            setTimeout(() => {
                // Enter NmtState.STOPPED
                device.nmt.stopNode();
                device.stop();
                resolve();
            }, 100);
        }, 100);
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
