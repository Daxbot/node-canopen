#!/usr/bin/env node

const { Eds, ObjectType, DataType } = require('../../index');
const os = require('os');
const fs = require('fs');

/* eslint no-console: "off" */

/**
 * EDS creation example.
 *
 * This example shows how to create a new electronic data sheet object, add
 * entries, and save it to disk.
 *
 * @param {boolean} cleanup - if true, then remove the created file.
 */
function main(cleanup=false) {
    // Create the Eds
    let eds = new Eds({
        fileName: 'example.eds',
        description: 'An example EDS file',
        createdBy: os.userInfo().username,
    });

    // Add objects manually ...
    eds.addEntry(0x1016, {
        parameterName: 'Consumer heartbeat time',
        objectType: ObjectType.ARRAY
    });

    eds.addSubEntry(0x1016, 1, {
        parameterName: 'Heartbeat consumer 1',
        dataType: DataType.UNSIGNED32,
        defaultValue: (0x3 << 16) | 10, // { deviceId: 0x3, timeout: 10 }
    });

    // ... or use the helper methods
    eds.addHeartbeatConsumer({ deviceId: 0x4, timeout: 10 });

    // Write to disk.
    eds.save('example.eds');

    // Load from disk
    eds = Eds.load('example.eds');

    console.log(eds.getHeartbeatConsumers());

    if(cleanup)
        fs.rmSync('example.eds');
}

module.exports = exports = main;

if (require.main === module)
    main();
