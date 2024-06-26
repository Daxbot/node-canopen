#!/usr/bin/env node

const { Device, DataType } = require('../../index.js');

/* eslint no-console: "off" */

/**
 * SDO server example.
 *
 * This example shows how to create a CANopen device that serves values from its
 * Object Dictionary using the SDO protocol.
 *
 * @param {Device} device - Device object.
 * @param {number} clientId - device id of the SDO client.
 */
async function main(device, clientId) {
    await new Promise((resolve) => {
        // Add the SDO server parameters.
        const cobIdTx = 0x580 | clientId; // client to server
        const cobIdRx = 0x600 | clientId; // server to client
        device.eds.addSdoServerParameter(clientId, cobIdTx, cobIdRx);
        device.start();

        // Create an additional entry to be accessed by the SDO client.
        const obj2000 = device.eds.addEntry(0x2000, {
            parameterName: 'Test string',
            dataType: DataType.VISIBLE_STRING,
        });

        let timer = null;
        obj2000.addListener('update', (data) => {
            console.log(data.value);

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

    main(device, 0xB).then(() => channel.stop());
}

module.exports = exports = main;
