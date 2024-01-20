#!/usr/bin/env node

const { Device, DataType } = require('../../index');

/* eslint no-console: "off" */

/**
 * RPDO example.
 *
 * This example shows how to map data objects to be received via PDO.
 *
 * @param {Device} device - Device object.
 */
async function main(device) {
    await new Promise((resolve) => {
        // Create a new RPDO entry that receives the value of object 0x2000
        const obj2000 = device.eds.addEntry(0x2000, {
            parameterName: 'Test object',
            dataType: DataType.UNSIGNED8,
        });

        device.eds.addReceivePdo({
            cobId: 0x180,               // Send with ID 0x180
            dataObjects: [obj2000],     // Map 0x2000
        });

        // Start the device and enter NmtState.OPERATIONAL.
        device.start();
        device.nmt.startNode();

        let timer = null;
        device.pdo.on('pdo', ({ cobId, updated }) => {
            console.log('Received PDO 0x' + cobId.toString(16));
            for (const obj of updated)
                console.log(`Updated ${obj} to ${obj.value}`);

            if (!timer) {
                timer = setTimeout(() => {
                    device.stop();
                    resolve();
                }, 200);
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
