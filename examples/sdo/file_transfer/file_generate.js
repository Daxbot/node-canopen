#!/usr/bin/env node

const fs = require('fs/promises');

/* eslint no-console: "off" */

/**
 * Generate a random file for testing purposes.
 *
 * @param {string} name - file name.
 * @param {number} size - file size in bytes.
 */
async function main(name, size) {
    console.log('Generating', size, 'bytes of random data');
    data = Buffer.alloc(size);
    for (let i = 0; i < data.length; ++i)
        data[i] = Math.floor(Math.random() * 0xff);

    return fs.writeFile(name, data);
}

if (require.main === module) {
    const name = process.argv[2] || 'output.txt';
    const size = process.argv[3] || (40*1024);

    main(name, size);
}

module.exports = exports = main;
