#!/usr/bin/env node

const { Device, DataType } = require('../../index');

/**
 * TPDO example.
 *
 * This example shows how to map data objects to be transmitted via PDO.
 *
 * @param {Device} device - Device object.
 */
async function main(device) {
    await new Promise((resolve) => {
        // Create a new TPDO entry that sends the value of object 0x2000
        const obj2000 = device.eds.addEntry(0x2000, {
            parameterName: 'Test object',
            dataType: DataType.UNSIGNED8,
        });

        device.eds.addTransmitPdo({
            cobId: 0x180,               // Send with ID 0x180
            transmissionType: 254,      // Send on value change
            dataObjects: [obj2000],     // Map the value of 0x2000
        });

        // Start the device and enter NmtState.OPERATIONAL.
        device.start();
        device.nmt.startNode();

        // Send the PDO
        let count = 0;
        const timer = setInterval(() => {
            device.eds.setValue(0x2000, ++count);

            if (count >= 3) {
                // Cleanup
                clearInterval(timer);
                device.stop();
                resolve();
            }
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
