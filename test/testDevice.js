const canopen = require('../index');
const VirtualChannel = require('./common/VirtualChannel.js');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Device', function() {
    it("should be constructable", function() {
        new canopen.Device(new VirtualChannel(), 0xA);
    });

    it("should require channel", function() {
        expect(() => { new canopen.Device(null, 0xA); }).to.throw;
    });

    it("should require channel.send", function() {
        const channel = new VirtualChannel();
        channel.send = undefined;

        expect(() => { new canopen.Device(channel, 0xA); }).to.throw;
    });

    it("should require channel.addListener", function() {
        const channel = new VirtualChannel();
        channel.addListener = undefined;

        expect(() => { new canopen.Device(channel, 0xA); }).to.throw;
    });

    it("should require deviceId be in range 1-127", function() {
        const channel = new VirtualChannel();
        channel.addListener = undefined;

        expect(() => { new canopen.Device(channel, null); }).to.throw;
        expect(() => { new canopen.Device(channel, 0); }).to.throw;
        expect(() => { new canopen.Device(channel, 128); }).to.throw;
        expect(() => { new canopen.Device(channel, 0xFFFF); }).to.throw;
    });

    it("should parse eds", function() {
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
            const parsed = device.rawToType(raw, type);
            expect(testValue).to.equal(parsed);
        }
    });
});
