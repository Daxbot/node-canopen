#!/usr/bin/env node

const { Device, LssMode } = require('../../index.js');

/* eslint no-console: "off", "no-constant-condition": "off" */

/**
 * LSS consumer example.
 *
 * This example shows how create an LSS consumer.
 *
 * @param {Device} device - Device object.
 */
async function main(device) {
    await new Promise((resolve) => {
        // Set the device identity. If your device is registered with CiA, then
        // these numbers will be provided by them. However, if your goal is to
        // use LSS to configure multiple custom nodes you can set this to whatever
        // you want.
        device.eds.setIdentity({
            vendorId: Math.floor(Math.random() * 0xffffffff),
            productCode: Math.floor(Math.random() * 0xffffffff),
            revisionNumber: Math.floor(Math.random() * 0xffffffff),
            serialNumber: Math.floor(Math.random() * 0xffffffff),
        });

        device.lss.addListener('changeMode', (mode) => {
            console.log('Changed mode to',
                (mode) ? 'CONFIGURATION' : 'OPERATION');

            if(mode == LssMode.OPERATION)
                resolve();
        });

        device.lss.addListener('changeDeviceId', (newId) => {
            console.log('Changed device id to', newId);
        });
    });
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
