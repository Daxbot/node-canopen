const canopen = require('../index');
const VirtualChannel = require('./common/VirtualChannel.js');
const chai = require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bytes'));

const expect = chai.expect;

describe('SDO Protocol', function() {
    // Create an SDO client and server at deviceId 0xA
    const channel = new VirtualChannel();
    const client = new canopen.Device(channel, 0xA, './test/common/test.eds');
    const server = new canopen.Device(channel, 0xA, './test/common/test.eds');

    describe('Bad Input', function() {
        it("should reject bad download index", function() {
            return expect(client.SDO.download(-1)).to.be.rejected;
        });

        it("should reject bad download subindex", function() {
            return expect(client.SDO.download(0x1006, -1)).to.be.rejected;
        });

        it("should reject bad download timeout", function() {
            return expect(client.SDO.download(0x1006, 0, -1)).to.be.rejected;
        });

        it("should reject bad upload index", function() {
            return expect(client.SDO.upload(-1)).to.be.rejected;
        });

        it("should reject bad upload subindex", function() {
            return expect(client.SDO.upload(0x1006, -1)).to.be.rejected;
        });

        it("should reject bad upload timeout", function() {
            return expect(client.SDO.upload(0x1006, 0, -1)).to.be.rejected;
        });
    });

    describe('Expedited Transfer', function() {
        before(function() { server.SDO.serverStart() });
        after(function() { server.SDO.serverStop() });

        const testValues = {
            "BOOLEAN" : [true, false],
            "INTEGER8" : [0xab, 0xcd],
            "INTEGER16" : [0x1234, 0xabcd],
            "INTEGER24" : [0x123456, 0xabcdef],
            "INTEGER32" : [0xdecaf, 0xc0ffee],
            "UNSIGNED8" : [0xab, 0xcd],
            "UNSIGNED16" : [0x1234, 0xabcd],
            "UNSIGNED24" : [0x123456, 0xabcdef],
            "UNSIGNED32" : [0xdecaf, 0xc0ffee],
            "TIME_OF_DAY" : [0, (Date.now() >>> 0)],
            "TIME_DIFFERENCE" : [0, (Date.now() >>> 0)],
        };

        Object.keys(testValues).forEach(function(key) {
            it("should upload " + key, function() {
                client.setValue(key, 0, testValues[key][0]);
                server.setValue(key, 0, testValues[key][1]);

                return client.SDO.upload(key).then(() => {
                    const clientValue = client.getRaw(key, 0);
                    const serverValue = server.getRaw(key, 0);
                    expect(clientValue).to.equalBytes(serverValue);
                });
            });

            it("should download " + key, function() {
                client.setValue(key, 0, testValues[key][0]);
                server.setValue(key, 0, testValues[key][1]);

                return client.SDO.download(key).then(() => {
                    const clientValue = client.getRaw(key, 0);
                    const serverValue = server.getRaw(key, 0);
                    expect(serverValue).to.equalBytes(clientValue);
                });
            });
        });
    });

    describe("Segmented Transfer", function() {
        before(function() { server.SDO.serverStart() });
        after(function() { server.SDO.serverStop() });

        const testValues = {
            "INTEGER40" : [0xdecaf, 0xc0ffee],
            "INTEGER48" : [0xdecaf, 0xc0ffee],
            "INTEGER56" : [0xdecaf, 0xc0ffee],
            "INTEGER64" : [0xdecaf, 0xc0ffee],
            "UNSIGNED40" : [0xdecaf, 0xc0ffee],
            "UNSIGNED48" : [0xdecaf, 0xc0ffee],
            "UNSIGNED56" : [0xdecaf, 0xc0ffee],
            "UNSIGNED64" : [0xdecaf, 0xc0ffee],
            "REAL32" : [3.14159, 2.71828],
            "REAL64" : [3.14159, 2.71828],
            "VISIBLE_STRING" : ["CLIENT", "SERVER"],
            "OCTET_STRING" : ["12345678", "87654321"],
            "UNICODE_STRING" : ["\u03b1\u03b2\u03b3", "\u03b4\u03b5\u03b6"],
        };

        Object.keys(testValues).forEach(function(key) {
            it("should upload " + key, function() {
                client.setValue(key, 0, testValues[key][0]);
                server.setValue(key, 0, testValues[key][1]);

                return client.SDO.upload(key).then(() => {
                    const clientValue = client.getRaw(key, 0);
                    const serverValue = server.getRaw(key, 0);
                    expect(clientValue).to.equalBytes(serverValue);
                });
            });

            it("should download " + key, function() {
                client.setValue(key, 0, testValues[key][0]);
                server.setValue(key, 0, testValues[key][1]);

                return client.SDO.download(key).then(() => {
                    const clientValue = client.getRaw(key, 0);
                    const serverValue = server.getRaw(key, 0);
                    expect(serverValue).to.equalBytes(clientValue);
                });
            });
        });
    });

    describe('Timeout', function() {
        it("should reject download after timeout", function() {
            return expect(client.SDO.download(0x1006, 0, 10)).to.be.rejected;
        });

        it("should reject upload after timeout", function() {
            return expect(client.SDO.upload(0x1006, 0, 10)).to.be.rejected;
        });
    });

    describe('Queue Overflow', function() {
        before(function() { client.SDO.queue_size = 0; });
        after(function() { client.SDO.queue_size = Infinity });

        it("should reject upload after queue overflow", function() {
            return expect(client.SDO.upload(0x1006)).to.be.rejected;
        });

        it("should reject download after queue overflow", function() {
            return expect(client.SDO.download(0x1006)).to.be.rejected;
        });
    });
});
