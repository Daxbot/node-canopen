#!/usr/bin/env node

const { Device, DataType, AccessType } = require('../../../index.js');
const fs = require('fs/promises');

/* eslint no-console: "off" */

/**
 * SDO server example.
 *
 * This example shows how to create a CANopen device that serves a file
 * using the SDO protocol.
 *
 * @param {Device} device - Device object.
 * @param {number} clientId - device id of the SDO client.
 */
async function main(device, clientId) {
    return new Promise((resolve) => {
        // Add the SDO server parameters.
        const cobIdTx = 0x580 | clientId; // client to server
        const cobIdRx = 0x600 | clientId; // server to client
        device.od.addSdoServerParameter(clientId, cobIdTx, cobIdRx);
        device.start();

        const obj2000 = device.od.addEntry(0x2000, {
            parameterName: 'File path',
            dataType: DataType.VISIBLE_STRING,
            defaultValue: '',
            accessType: AccessType.READ_WRITE,
        });

        const obj2001 = device.od.addEntry(0x2001, {
            parameterName: 'File size',
            dataType: DataType.UNSIGNED32,
            defaultValue: 0,
            accessType: AccessType.READ_ONLY,
        });

        const obj2002 = device.od.addEntry(0x2002, {
            parameterName: 'File data',
            dataType: DataType.DOMAIN,
            accessType: AccessType.READ_WRITE,
        });

        obj2000.addListener('update', (data) => {
            // If the file exists and is readable
            fs.access(data.value, fs.constants.R_OK).then(() => {
                // Then read the file
                console.log('Reading', data.value);
                return fs.readFile(data.value).catch(
                    (e) => console.error('Error reading file', e));
            })
            .then((file) => {
                // Then store the buffer and length
                console.log('Read', file.length, 'bytes');
                obj2001.value = file.length;
                obj2002.raw = file;

            })
            .catch(() => { /* ignore */ });
        });

        obj2002.addListener('update', (data) => {
            if(obj2000.value) {
                console.log('Writing', data.raw.length, 'bytes to', obj2000.value);
                fs.writeFile(obj2000.value, data.raw)
                    .catch((e) => console.error('Error writing file', e));
            }
        });
    })
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
