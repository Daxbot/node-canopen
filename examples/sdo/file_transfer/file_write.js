#!/usr/bin/env node

const { Device, DataType } = require('../../../index.js');
const fs = require('fs/promises');

/* eslint no-console: "off" */

/**
 * SDO client example.
 *
 * This example shows how to create a CANopen device that downloads (writes)
 * data to an SDO server.
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
    device.od.addSdoClientParameter(serverId, cobIdTx, cobIdRx);
    device.start();

    let data = null;
    if(infile) {
        data = await fs.readFile(infile);
    }
    else {
        console.log('Generating random data');
        data = Buffer.alloc(40*1024); // 40kB
        for (let i = 0; i < data.length; ++i)
            data[i] = Math.floor(Math.random() * 0xff);
    }

    // First write the path to 0x2000
    await device.sdo.download({
        serverId: serverId,
        data: outfile,
        dataType: DataType.VISIBLE_STRING,
        index: 0x2000,
    });

    // Write the file
    await device.sdo.download({
        serverId: serverId,
        data: data,
        dataType: DataType.DOMAIN,
        index: 0x2002,
        blockTransfer: true
    });

    device.stop();
}

if (require.main === module) {
    const infile = process.argv[2];
    const outfile = process.argv[3] || 'output.txt';

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
