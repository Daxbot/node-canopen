const canopen = require('../index');
const VirtualChannel = require('./common/VirtualChannel.js');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Network', function() {
    it("should be constructable", function() {
        new canopen.Network(new VirtualChannel());
    });

    it("should require channel", function() {
        expect(() => { new canopen.Network(null); }).to.throw;
    });

    it("should require channel.send", function() {
        const channel = new VirtualChannel();
        channel.send = undefined;

        expect(() => { new canopen.Network(channel); }).to.throw;
    });

    it("should require channel.addListener", function() {
        const channel = new VirtualChannel();
        channel.addListener = undefined;

        expect(() => { new canopen.Network(channel); }).to.throw;
    });
});
