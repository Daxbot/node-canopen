#!/usr/bin/env node

const { Device, DataType } = require('../../index.js');

/* eslint no-console: "off" */

/**
 * SDO client example.
 *
 * This example shows how to create a CANopen device that downloads (writes)
 * and uploads (reads) data from an SDO server.
 *
 * @param {Device} device - Device object.
 * @param {number} serverId - device id of the SDO server.
 */
async function main(device, serverId) {
    // Add the SDO client parameters.
    device.eds.addSdoClientParameter(serverId, 0x600, 0x580);
    device.start();

    // Write date to the server then read it back.
    const date = new Date();
    await device.sdo.download({
        serverId: serverId,
        data: date.toString(),
        dataType: DataType.VISIBLE_STRING,
        index: 0x2000,
    });

    const value = await device.sdo.upload({
        serverId: serverId,
        dataType: DataType.VISIBLE_STRING,
        index: 0x2000,
    });

    console.log(value);
    device.stop();
}

if (require.main === module) {
    // Connect the Device with a socketcan RawChannel object.
    const can = require('socketcan');
    const channel = can.createRawChannel('can0');
    const device = new Device({ id: 0xB });

    device.addListener('message', (m) => channel.send(m));
    channel.addListener('onMessage', (m) => device.receive(m));
    channel.start();

    main(device, 0xA).then(() => channel.stop());
}

module.exports = exports = main;
