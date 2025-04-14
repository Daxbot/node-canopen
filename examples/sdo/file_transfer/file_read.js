#!/usr/bin/env node

const { Device, DataType } = require('../../../index.js');
const fs = require('fs/promises');

/* eslint no-console: "off" */

/**
 * SDO client example.
 *
 * This example shows how to create a CANopen device that uploads (reads) data
 * from an SDO server.
 *
 * @param {Device} device - Device object.
 * @param {number} serverId - device id of the SDO server.
 * @param {string} infile - path on the server to read from.
 * @param {string} outfile - path on the client to write to.
 */
async function main(device, serverId, infile, outfile) {
    // Add the SDO client parameters.
    const cobIdTx = 0x600 | device.id; // client to server
    const cobIdRx = 0x580 | device.id; // server to client
    device.eds.addSdoClientParameter(serverId, cobIdTx, cobIdRx);
    device.start();

    // First write the path to 0x2000
    await device.sdo.download({
        serverId: serverId,
        data: infile,
        dataType: DataType.VISIBLE_STRING,
        index: 0x2000,
    });

    // Wait until data is available by reading the length
    await new Promise((resolve, reject) => {
        let interval = null;
        let timeout = null;

        timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for file transfer'));
            clearInterval(interval);
        }, 1000);

        interval = setInterval(() => {
            device.sdo.upload({
                serverId: serverId,
                dataType: DataType.UNSIGNED32,
                index: 0x2001,
                blockTransfer: true,
                timeout: 100,
            }).then((len) => {
                if(len > 0) {
                    console.log('The file is', len, 'bytes');
                    clearTimeout(timeout);
                    clearInterval(interval);
                    resolve();
                }
            });
        }, 10);
    });

    // Read the file
    const data = await device.sdo.upload({
        serverId: serverId,
        dataType: DataType.DOMAIN,
        index: 0x2002,
    });

    console.log('Got', data.length, 'bytes');

    await fs.writeFile(outfile, data)

    device.stop();
}

if (require.main === module) {
    const infile = process.argv[2];
    const outfile = process.argv[3] || 'output.txt';
    if (!infile)
        throw ReferenceError('Please provide an input file path');

    // Connect the Device with a socketcan RawChannel object.
    const can = require('socketcan');
    const channel = can.createRawChannel('can0');
    const device = new Device({ id: 0xB });

    device.addListener('message', (m) => channel.send(m));
    channel.addListener('onMessage', (m) => device.receive(m));
    channel.start();

    main(device, 0xA, infile, outfile).then(() => channel.stop());
}

module.exports = exports = main;
