const canopen = require('../index');
const VirtualChannel = require('./common/VirtualChannel.js');
const assert = require('assert');

describe('Device', () => {
    it("Object Creation", (done) => {

        // Valid
        new canopen.Device(new VirtualChannel(), 0xA);

        // No channel
        assert.throws(() => {
            new canopen.Device(null, 0xA);
        });

        // Channel has no send method
        assert.throws(() => {
            const channel = new VirtualChannel();
            channel.send = undefined;
            new canopen.Device(channel, 0xA);
        });

        // Channel has no addListener method
        assert.throws(() => {
            const channel = new VirtualChannel();
            channel.addListener = undefined;
            new canopen.Device(channel, 0xA);
        });

        // No deviceId
        assert.throws(() => {
            new canopen.Device(new VirtualChannel(), null);
        });

        // deviceId out of range
        assert.throws(() => {
            new canopen.Device(new VirtualChannel(), 0x100);
        });

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

            const raw = device.typeToRaw(testValue, type);
            assert(Buffer.isBuffer(raw), `${name}: isBuffer()`);

            const parsed = device.rawToType(raw, type);
            assert.strictEqual(testValue, parsed, `${name}: ${testValue} == ${parsed} (${raw})`);
        }

        done();
    });
});
