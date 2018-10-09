const canopen = require('../src/index');
const VirtualChannel = require('./common/VirtualChannel.js');
const assert = require('assert');

describe('SDO', () => {
    // Create an SDO client and server at deviceId 0xA
    const channel = new VirtualChannel();
    const client = new canopen.Device(channel, 0xA, './test/common/test.eds');
    const server = new canopen.Device(channel, 0xA, './test/common/test.eds');

    // Start server
    server.SDO.serverStart();

    it("Expedited Upload", (done) => {

        // Using entry [1006] "Communication cycle period" (UNSIGNED32)
        const targetIndex = 0x1006;

        client.setValue(targetIndex, 0, 0xdecaf);
        server.setValue(targetIndex, 0, 0xc0ffee);

        function check() {
            const clientValue = client.getValue(targetIndex, 0);
            const serverValue = server.getValue(targetIndex, 0);
            assert.strictEqual(clientValue, serverValue, `${clientValue.toString(16)} == ${serverValue.toString(16)}`);
            done();
        }

        // Start client upload
        client.SDO.upload(client.getEntry(targetIndex)).then(check, done).catch(done);
    });

    it("Expedited Download", (done) => {

        // Using entry [1006] "Communication cycle period" (UNSIGNED32)
        const targetIndex = 0x1006;

        client.setValue(targetIndex, 0, 0xdecaf);
        server.setValue(targetIndex, 0, 0xc0ffee);

        function check() {
            const clientValue = client.getValue(targetIndex, 0);
            const serverValue = server.getValue(targetIndex, 0);
            assert.strictEqual(clientValue, serverValue, `${clientValue.toString(16)} == ${serverValue.toString(16)}`);
            done();
        }

        // Start client download
        client.SDO.upload(client.getEntry(targetIndex)).then(check, done).catch(done);
    });

    it("Segmented Upload", (done) => {

        // Using entry [1008] "Manufacturer device name" (string)
        const targetIndex = 0x1008;

        client.setValue(targetIndex, 0, "decaf");
        server.setValue(targetIndex, 0, "coffee");

        function check() {
            const clientValue = client.getValue(targetIndex, 0);
            const serverValue = server.getValue(targetIndex, 0);
            assert.strictEqual(clientValue, serverValue, `${clientValue.toString(16)} == ${serverValue.toString(16)}`);
            done();
        }

        // Start client download
        client.SDO.upload(client.getEntry(targetIndex)).then(check, done).catch(done);
    });

    it("Segmented Download", (done) => {

        // Using entry [1008] "Manufacturer device name" (string)
        const targetIndex = 0x1008;

        client.setValue(targetIndex, 0, "decaf");
        server.setValue(targetIndex, 0, "coffee");

        function check() {
            const clientValue = client.getValue(targetIndex, 0);
            const serverValue = server.getValue(targetIndex, 0);
            assert.strictEqual(clientValue, serverValue, `${clientValue.toString(16)} == ${serverValue.toString(16)}`);
            done();
        }

        // Start client download
        client.SDO.download(client.getEntry(targetIndex)).then(check, done).catch(done);
    });

    it("Generic Data Upload", (done) => {

        const testValues = {
            // Basic
            BOOLEAN:    true,
            INTEGER8:   -0x11,
            INTEGER16:  -0x1122,
            INTEGER32:  -0x11223344,
            UNSIGNED8:  0x11,
            UNSIGNED16: 0x1122,
            UNSIGNED32: 0x11223344,
            REAL32:     1.0,
            REAL64:     1.0,

            // Strings
            VISIBLE_STRING: "VISIBLE_STRING",
            OCTET_STRING: "12345678",
            UNICODE_STRING: "\u03b1\u03b2\u03b3",

            // Timestamp - 32 bit
            TIME_OF_DAY: (Date.now() >>> 0),
            TIME_DIFFERENCE: (Date.now() >>> 0),
        };

        /* jshint ignore:start */
        async function awaitUpload(entry, done) {
            await client.SDO.upload(entry).catch(done);
        }
        /* jshint ignore:end */

        for(const name of Object.keys(client.dataTypes)) {
            const testValue = testValues[name];
            if(testValue == undefined)
                continue;

            client.setValue(name, 0, null);
            server.setValue(name, 0, testValue);

            // Start client upload
            awaitUpload(client.getEntry(name), done);

            const clientValue = client.getValue(name, 0);
            const serverValue = server.getValue(name, 0);
            assert.strictEqual(clientValue, serverValue, `${name}: ${clientValue} == ${serverValue}`);
        }
        done();
    });

    it("Generic Data Download", (done) => {

        const testValues = {
            // Basic
            BOOLEAN:    true,
            INTEGER8:   -0x11,
            INTEGER16:  -0x1122,
            INTEGER32:  -0x11223344,
            UNSIGNED8:  0x11,
            UNSIGNED16: 0x1122,
            UNSIGNED32: 0x11223344,
            REAL32:     1.0,
            REAL64:     1.0,

            // Strings
            VISIBLE_STRING: "VISIBLE_STRING",
            OCTET_STRING: "12345678",
            UNICODE_STRING: "\u03b1\u03b2\u03b3",

            // Timestamp - 32 bit
            TIME_OF_DAY: (Date.now() >>> 0),
            TIME_DIFFERENCE: (Date.now() >>> 0),
        };

        /* jshint ignore:start */
        async function awaitDownload(entry, done) {
            await client.SDO.download(entry).catch(done);
        }
        /* jshint ignore:end */

        for(const name of Object.keys(client.dataTypes)) {
            const testValue = testValues[name];
            if(testValue == undefined)
                continue;

            client.setValue(name, 0, testValue);
            server.setValue(name, 0, null);

            // Start client download
            awaitDownload(client.getEntry(name), done);

            const clientValue = client.getValue(name, 0);
            const serverValue = server.getValue(name, 0);
            assert.strictEqual(clientValue, serverValue, `${name}: ${clientValue} == ${serverValue}`);
        }
        done();
    });
});
