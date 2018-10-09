const canopen = require('../src/index');
const VirtualChannel = require('./common/VirtualChannel.js');
const assert = require('assert');

describe('Device', () => {
    it("Object Creation", (done) => {
        
        // No channel
        try {
            new canopen.Device(null, 0xA);
            done("Failed to throw error on channel == null");
        }
        catch (e) { }

        // Channel has no send method
        try {
            const channel = new VirtualChannel();
            channel.send = undefined;

            new canopen.Device(channel, 0xA);
            done("Failed to throw error on channel.send == undefined");
        }
        catch (e) { }

        // Channel has no addListener method
        try {
            const channel = new VirtualChannel();
            channel.addListener = undefined;

            new canopen.Device(channel, 0xA);
            done("Failed to throw error on channel.addListener == undefined");
        }
        catch (e) { }

        // No deviceId
        try {
            new canopen.Device(new VirtualChannel(), null);
            done("Failed to throw error on deviceId == null");
        }
        catch (e) { }

        // deviceId out of range
        try {
            new canopen.Device(new VirtualChannel(), 0x100);
            done("Failed to throw error on deviceId > 0xFF");
        }
        catch (e) { }

        // Load EDS
        done();
    });

    it("EDS Parsing", (done) => {
        const channel = new VirtualChannel();
        const device = new canopen.Device(channel, 0xA, './test/common/test.eds');

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

        for(const [name, type] of Object.entries(device.dataTypes)) {
            const testValue = testValues[name];
            if(testValue == undefined)
                continue;

            const raw = device._typeToRaw(testValue, type);
            assert(Buffer.isBuffer(raw), `${name}: isBuffer()`);

            const parsed = device._rawToType(raw, type);
            assert.strictEqual(testValue, parsed, `${name}: ${testValue} == ${parsed} (${raw})`);
        }

        done();
    });
});
