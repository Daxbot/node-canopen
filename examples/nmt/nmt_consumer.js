#!/usr/bin/env node

const { Device } = require('../../index.js');

/* eslint no-console: "off" */

/**
 * NMT consumer example.
 *
 * This example shows how configure a heartbeat consumer.
 *
 * @param {Device} device - Device object.
 * @param {number} consumerId - device id of the heartbeat to consume.
 */
async function main(device, consumerId) {
    await new Promise((resolve) => {
        device.nmt.addListener('timeout', (deviceId) => {
            console.log('Heartbeat timeout for 0x' +  deviceId.toString(16));
            device.stop();
            resolve();
        });

        device.nmt.addListener('heartbeat', (deviceId) => {
            console.log('Heartbeat detected for 0x' +  deviceId.toString(16));
        });

        device.eds.addHeartbeatConsumer(consumerId, 200);
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

    main(device, 0xB).then(() => channel.stop());
}

module.exports = exports = main;
