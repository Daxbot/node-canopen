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

    describe('Expedited Transfer', function() {
        before(function() { server.SDO.serverStart() });
        after(function() { server.SDO.serverStop() });

        it("should upload BOOLEAN", function() {
            client.setValue("BOOLEAN", 0, true);
            server.setValue("BOOLEAN", 0, false);

            return client.SDO.upload("BOOLEAN").then(() => {
                const clientValue = client.getRaw("BOOLEAN", 0);
                const serverValue = server.getRaw("BOOLEAN", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download BOOLEAN", function() {
            client.setValue("BOOLEAN", 0, true);
            server.setValue("BOOLEAN", 0, false);

            return client.SDO.download("BOOLEAN").then(() => {
                const clientValue = client.getRaw("BOOLEAN", 0);
                const serverValue = server.getRaw("BOOLEAN", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload INTEGER8", function() {
            client.setValue("INTEGER8", 0, 0xab);
            server.setValue("INTEGER8", 0, 0xcd);

            return client.SDO.upload("INTEGER8").then(() => {
                const clientValue = client.getRaw("INTEGER8", 0);
                const serverValue = server.getRaw("INTEGER8", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download INTEGER8", function() {
            client.setValue("INTEGER8", 0, 0xab);
            server.setValue("INTEGER8", 0, 0xcd);

            return client.SDO.download("INTEGER8").then(() => {
                const clientValue = client.getRaw("INTEGER8", 0);
                const serverValue = server.getRaw("INTEGER8", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload INTEGER16", function() {
            client.setValue("INTEGER16", 0, 0x1234);
            server.setValue("INTEGER16", 0, 0xabcd);

            return client.SDO.upload("INTEGER16").then(() => {
                const clientValue = client.getRaw("INTEGER16", 0);
                const serverValue = server.getRaw("INTEGER16", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download INTEGER16", function() {
            client.setValue("INTEGER16", 0, 0x1234);
            server.setValue("INTEGER16", 0, 0xabcd);

            return client.SDO.download("INTEGER16").then(() => {
                const clientValue = client.getRaw("INTEGER16", 0);
                const serverValue = server.getRaw("INTEGER16", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload INTEGER24", function() {
            client.setValue("INTEGER24", 0, 0x123456);
            server.setValue("INTEGER24", 0, 0xabcdef);

            return client.SDO.upload("INTEGER24").then(() => {
                const clientValue = client.getRaw("INTEGER24", 0);
                const serverValue = server.getRaw("INTEGER24", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download INTEGER24", function() {
            client.setValue("INTEGER24", 0, 0x123456);
            server.setValue("INTEGER24", 0, 0xabcdef);

            return client.SDO.download("INTEGER24").then(() => {
                const clientValue = client.getRaw("INTEGER24", 0);
                const serverValue = server.getRaw("INTEGER24", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload INTEGER32", function() {
            client.setValue("INTEGER32", 0, 0xdecaf);
            server.setValue("INTEGER32", 0, 0xc0ffee);

            return client.SDO.upload("INTEGER32").then(() => {
                const clientValue = client.getRaw("INTEGER32", 0);
                const serverValue = server.getRaw("INTEGER32", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download INTEGER32", function() {
            client.setValue("INTEGER32", 0, 0xdecaf);
            server.setValue("INTEGER32", 0, 0xc0ffee);

            return client.SDO.download("INTEGER32").then(() => {
                const clientValue = client.getRaw("INTEGER32", 0);
                const serverValue = server.getRaw("INTEGER32", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload UNSIGNED8", function() {
            client.setValue("UNSIGNED8", 0, 0xab);
            server.setValue("UNSIGNED8", 0, 0xcd);

            return client.SDO.upload("UNSIGNED8").then(() => {
                const clientValue = client.getRaw("UNSIGNED8", 0);
                const serverValue = server.getRaw("UNSIGNED8", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download UNSIGNED8", function() {
            client.setValue("UNSIGNED8", 0, 0xab);
            server.setValue("UNSIGNED8", 0, 0xcd);

            return client.SDO.download("UNSIGNED8").then(() => {
                const clientValue = client.getRaw("UNSIGNED8", 0);
                const serverValue = server.getRaw("UNSIGNED8", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload UNSIGNED16", function() {
            client.setValue("UNSIGNED16", 0, 0x1234);
            server.setValue("UNSIGNED16", 0, 0xabcd);

            return client.SDO.upload("UNSIGNED16").then(() => {
                const clientValue = client.getRaw("UNSIGNED16", 0);
                const serverValue = server.getRaw("UNSIGNED16", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download UNSIGNED16", function() {
            client.setValue("UNSIGNED16", 0, 0x1234);
            server.setValue("UNSIGNED16", 0, 0xabcd);

            return client.SDO.download("UNSIGNED16").then(() => {
                const clientValue = client.getRaw("UNSIGNED16", 0);
                const serverValue = server.getRaw("UNSIGNED16", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload UNSIGNED24", function() {
            client.setValue("UNSIGNED24", 0, 0x123456);
            server.setValue("UNSIGNED24", 0, 0xabcdef);

            return client.SDO.upload("UNSIGNED24").then(() => {
                const clientValue = client.getRaw("UNSIGNED24", 0);
                const serverValue = server.getRaw("UNSIGNED24", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download UNSIGNED24", function() {
            client.setValue("UNSIGNED24", 0, 0x123456);
            server.setValue("UNSIGNED24", 0, 0xabcdef);

            return client.SDO.download("UNSIGNED24").then(() => {
                const clientValue = client.getRaw("UNSIGNED24", 0);
                const serverValue = server.getRaw("UNSIGNED24", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload UNSIGNED32", function() {
            client.setValue("UNSIGNED32", 0, 0xdecaf);
            server.setValue("UNSIGNED32", 0, 0xc0ffee);

            return client.SDO.upload("UNSIGNED32").then(() => {
                const clientValue = client.getRaw("UNSIGNED32", 0);
                const serverValue = server.getRaw("UNSIGNED32", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download UNSIGNED32", function() {
            client.setValue("UNSIGNED32", 0, 0xdecaf);
            server.setValue("UNSIGNED32", 0, 0xc0ffee);

            return client.SDO.download("UNSIGNED32").then(() => {
                const clientValue = client.getRaw("UNSIGNED32", 0);
                const serverValue = server.getRaw("UNSIGNED32", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload TIME_OF_DAY", function() {
            client.setValue("TIME_OF_DAY", 0, 0);
            server.setValue("TIME_OF_DAY", 0, (Date.now() >>> 0));

            return client.SDO.upload("TIME_OF_DAY").then(() => {
                const clientValue = client.getRaw("TIME_OF_DAY", 0);
                const serverValue = server.getRaw("TIME_OF_DAY", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download TIME_OF_DAY", function() {
            client.setValue("TIME_OF_DAY", 0, (Date.now() >>> 0));
            server.setValue("TIME_OF_DAY", 0, 0);

            return client.SDO.download("TIME_OF_DAY").then(() => {
                const clientValue = client.getRaw("TIME_OF_DAY", 0);
                const serverValue = server.getRaw("TIME_OF_DAY", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload TIME_DIFFERENCE", function() {
            client.setValue("TIME_DIFFERENCE", 0, 0);
            server.setValue("TIME_DIFFERENCE", 0, (Date.now() >>> 0));

            return client.SDO.upload("TIME_DIFFERENCE").then(() => {
                const clientValue = client.getRaw("TIME_DIFFERENCE", 0);
                const serverValue = server.getRaw("TIME_DIFFERENCE", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download TIME_DIFFERENCE", function() {
            client.setValue("TIME_DIFFERENCE", 0, (Date.now() >>> 0));
            server.setValue("TIME_DIFFERENCE", 0, 0);

            return client.SDO.download("TIME_DIFFERENCE").then(() => {
                const clientValue = client.getRaw("TIME_DIFFERENCE", 0);
                const serverValue = server.getRaw("TIME_DIFFERENCE", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });
    });

    describe("Segmented Transfer", function() {
        before(function() { server.SDO.serverStart() });
        after(function() { server.SDO.serverStop() });

        it("should upload INTEGER40", function() {
            client.setValue("INTEGER40", 0, 0xdecaf);
            server.setValue("INTEGER40", 0, 0xc0ffee);

            return client.SDO.upload("INTEGER40").then(() => {
                const clientValue = client.getRaw("INTEGER40", 0);
                const serverValue = server.getRaw("INTEGER40", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download INTEGER40", function() {
            client.setValue("INTEGER40", 0, 0xdecaf);
            server.setValue("INTEGER40", 0, 0xc0ffee);

            return client.SDO.download("INTEGER40").then(() => {
                const clientValue = client.getRaw("INTEGER40", 0);
                const serverValue = server.getRaw("INTEGER40", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload INTEGER48", function() {
            client.setValue("INTEGER48", 0, 0xdecaf);
            server.setValue("INTEGER48", 0, 0xc0ffee);

            return client.SDO.upload("INTEGER48").then(() => {
                const clientValue = client.getRaw("INTEGER48", 0);
                const serverValue = server.getRaw("INTEGER48", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download INTEGER48", function() {
            client.setValue("INTEGER48", 0, 0xdecaf);
            server.setValue("INTEGER48", 0, 0xc0ffee);

            return client.SDO.download("INTEGER48").then(() => {
                const clientValue = client.getRaw("INTEGER48", 0);
                const serverValue = server.getRaw("INTEGER48", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload INTEGER56", function() {
            client.setValue("INTEGER56", 0, 0xdecaf);
            server.setValue("INTEGER56", 0, 0xc0ffee);

            return client.SDO.upload("INTEGER56").then(() => {
                const clientValue = client.getRaw("INTEGER56", 0);
                const serverValue = server.getRaw("INTEGER56", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download INTEGER56", function() {
            client.setValue("INTEGER56", 0, 0xdecaf);
            server.setValue("INTEGER56", 0, 0xc0ffee);

            return client.SDO.download("INTEGER56").then(() => {
                const clientValue = client.getRaw("INTEGER56", 0);
                const serverValue = server.getRaw("INTEGER56", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload INTEGER64", function() {
            client.setValue("INTEGER64", 0, 0xdecaf);
            server.setValue("INTEGER64", 0, 0xc0ffee);

            return client.SDO.upload("INTEGER64").then(() => {
                const clientValue = client.getRaw("INTEGER64", 0);
                const serverValue = server.getRaw("INTEGER64", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download INTEGER64", function() {
            client.setValue("INTEGER64", 0, 0xdecaf);
            server.setValue("INTEGER64", 0, 0xc0ffee);

            return client.SDO.download("INTEGER64").then(() => {
                const clientValue = client.getRaw("INTEGER64", 0);
                const serverValue = server.getRaw("INTEGER64", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload UNSIGNED40", function() {
            client.setValue("UNSIGNED40", 0, 0xdecaf);
            server.setValue("UNSIGNED40", 0, 0xc0ffee);

            return client.SDO.upload("UNSIGNED40").then(() => {
                const clientValue = client.getRaw("UNSIGNED40", 0);
                const serverValue = server.getRaw("UNSIGNED40", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download UNSIGNED40", function() {
            client.setValue("UNSIGNED40", 0, 0xdecaf);
            server.setValue("UNSIGNED40", 0, 0xc0ffee);

            return client.SDO.download("UNSIGNED40").then(() => {
                const clientValue = client.getRaw("UNSIGNED40", 0);
                const serverValue = server.getRaw("UNSIGNED40", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload UNSIGNED48", function() {
            client.setValue("UNSIGNED48", 0, 0xdecaf);
            server.setValue("UNSIGNED48", 0, 0xc0ffee);

            return client.SDO.upload("UNSIGNED48").then(() => {
                const clientValue = client.getRaw("UNSIGNED48", 0);
                const serverValue = server.getRaw("UNSIGNED48", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download UNSIGNED48", function() {
            client.setValue("UNSIGNED48", 0, 0xdecaf);
            server.setValue("UNSIGNED48", 0, 0xc0ffee);

            return client.SDO.download("UNSIGNED48").then(() => {
                const clientValue = client.getRaw("UNSIGNED48", 0);
                const serverValue = server.getRaw("UNSIGNED48", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload UNSIGNED56", function() {
            client.setValue("UNSIGNED56", 0, 0xdecaf);
            server.setValue("UNSIGNED56", 0, 0xc0ffee);

            return client.SDO.upload("UNSIGNED56").then(() => {
                const clientValue = client.getRaw("UNSIGNED56", 0);
                const serverValue = server.getRaw("UNSIGNED56", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download UNSIGNED56", function() {
            client.setValue("UNSIGNED56", 0, 0xdecaf);
            server.setValue("UNSIGNED56", 0, 0xc0ffee);

            return client.SDO.download("UNSIGNED56").then(() => {
                const clientValue = client.getRaw("UNSIGNED56", 0);
                const serverValue = server.getRaw("UNSIGNED56", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload UNSIGNED64", function() {
            client.setValue("UNSIGNED64", 0, 0xdecaf);
            server.setValue("UNSIGNED64", 0, 0xc0ffee);

            return client.SDO.upload("UNSIGNED64").then(() => {
                const clientValue = client.getRaw("UNSIGNED64", 0);
                const serverValue = server.getRaw("UNSIGNED64", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download UNSIGNED64", function() {
            client.setValue("UNSIGNED64", 0, 0xdecaf);
            server.setValue("UNSIGNED64", 0, 0xc0ffee);

            return client.SDO.download("UNSIGNED64").then(() => {
                const clientValue = client.getRaw("UNSIGNED64", 0);
                const serverValue = server.getRaw("UNSIGNED64", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload REAL32", function() {
            client.setValue("REAL32", 0, 3.14159);
            server.setValue("REAL32", 0, 2.71828);

            return client.SDO.upload("REAL32").then(() => {
                const clientValue = client.getRaw("REAL32", 0);
                const serverValue = server.getRaw("REAL32", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download REAL32", function() {
            client.setValue("REAL32", 0, 3.14159);
            server.setValue("REAL32", 0, 2.71828);

            return client.SDO.download("REAL32").then(() => {
                const clientValue = client.getRaw("REAL32", 0);
                const serverValue = server.getRaw("REAL32", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload REAL64", function() {
            client.setValue("REAL64", 0, 3.14159);
            server.setValue("REAL64", 0, 2.71828);

            return client.SDO.upload("REAL64").then(() => {
                const clientValue = client.getRaw("REAL64", 0);
                const serverValue = server.getRaw("REAL64", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download REAL64", function() {
            client.setValue("REAL64", 0, 3.14159);
            server.setValue("REAL64", 0, 2.71828);

            return client.SDO.download("REAL64").then(() => {
                const clientValue = client.getRaw("REAL64", 0);
                const serverValue = server.getRaw("REAL64", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload VISIBLE_STRING", function() {
            client.setValue("VISIBLE_STRING", 0, "CLIENT");
            server.setValue("VISIBLE_STRING", 0, "SERVER");

            return client.SDO.upload("VISIBLE_STRING").then(() => {
                const clientValue = client.getRaw("VISIBLE_STRING", 0);
                const serverValue = server.getRaw("VISIBLE_STRING", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download VISIBLE_STRING", function() {
            client.setValue("VISIBLE_STRING", 0, "CLIENT");
            server.setValue("VISIBLE_STRING", 0, "SERVER");

            return client.SDO.download("VISIBLE_STRING").then(() => {
                const clientValue = client.getRaw("VISIBLE_STRING", 0);
                const serverValue = server.getRaw("VISIBLE_STRING", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload OCTET_STRING", function() {
            client.setValue("OCTET_STRING", 0, "12345678");
            server.setValue("OCTET_STRING", 0, "87654321");

            return client.SDO.upload("OCTET_STRING").then(() => {
                const clientValue = client.getRaw("OCTET_STRING", 0);
                const serverValue = server.getRaw("OCTET_STRING", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download OCTET_STRING", function() {
            client.setValue("OCTET_STRING", 0, "12345678");
            server.setValue("OCTET_STRING", 0, "87654321");

            return client.SDO.download("OCTET_STRING").then(() => {
                const clientValue = client.getRaw("OCTET_STRING", 0);
                const serverValue = server.getRaw("OCTET_STRING", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });

        it("should upload UNICODE_STRING", function() {
            client.setValue("UNICODE_STRING", 0, "\u03b1\u03b2\u03b3");
            server.setValue("UNICODE_STRING", 0, "\u03b4\u03b5\u03b6");

            return client.SDO.upload("UNICODE_STRING").then(() => {
                const clientValue = client.getRaw("UNICODE_STRING", 0);
                const serverValue = server.getRaw("UNICODE_STRING", 0);
                expect(clientValue).to.equalBytes(serverValue);
            });
        });

        it("should download UNICODE_STRING", function() {
            client.setValue("UNICODE_STRING", 0, "\u03b1\u03b2\u03b3");
            server.setValue("UNICODE_STRING", 0, "\u03b4\u03b5\u03b6");

            return client.SDO.download("UNICODE_STRING").then(() => {
                const clientValue = client.getRaw("UNICODE_STRING", 0);
                const serverValue = server.getRaw("UNICODE_STRING", 0);
                expect(serverValue).to.equalBytes(clientValue);
            });
        });
    });

    describe('Abort', function() {
        it("should abort a download on timeout", function() {
            return expect(client.SDO.download(0x1006, 0, 10)).to.be.rejected;
        });

        it("should abort an upload on timeout", function() {
            return expect(client.SDO.upload(0x1006, 0, 10)).to.be.rejected;
        });
    });
});
