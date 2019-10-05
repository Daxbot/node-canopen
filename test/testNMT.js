const canopen = require('../index');
const VirtualChannel = require('./common/VirtualChannel.js');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('NMT', () => {
    const channel = new VirtualChannel();
    const network = new canopen.Network(channel);
    const device = network.addDevice(0xA, './test/common/test.eds');

    it("should send PreOperational", function() {
        device.state = network.NMT.states.INITIALIZING;
        network.NMT.PreOperational(0xA);
        expect(device.state).to.equal(network.NMT.states.PRE_OPERATIONAL);
    });

    it("should send Operational", function() {
        device.state = network.NMT.states.INITIALIZING;
        network.NMT.Operational(0xA);
        expect(device.state).to.equal(network.NMT.states.OPERATIONAL);
    });

    it("should send Stopped", function() {
        device.state = network.NMT.states.INITIALIZING;
        network.NMT.Stopped(0xA);
        expect(device.state).to.equal(network.NMT.states.STOPPED);
    });

    it("should send ResetDevice", function() {
        device.state = network.NMT.states.OPERATIONAL;
        network.NMT.ResetDevice(0xA);
        expect(device.state).to.equal(network.NMT.states.INITIALIZING);
    });

    it("should send ResetCommunication", function() {
        device.state = network.NMT.states.OPERATIONAL;
        network.NMT.ResetCommunication(0xA);
        expect(device.state).to.equal(network.NMT.states.INITIALIZING);
    });

    it("should broadcast PreOperational", function() {
        device.state = network.NMT.states.INITIALIZING;
        network.NMT.PreOperational(0);
        expect(device.state).to.equal(network.NMT.states.PRE_OPERATIONAL);
    });

    it("should broadcast Operational", function() {
        device.state = network.NMT.states.INITIALIZING;
        network.NMT.Operational(0);
        expect(device.state).to.equal(network.NMT.states.OPERATIONAL);
    });

    it("should broadcast Stopped", function() {
        device.state = network.NMT.states.INITIALIZING;
        network.NMT.Stopped(0);
        expect(device.state).to.equal(network.NMT.states.STOPPED);
    });

    it("should broadcast ResetDevice", function() {
        device.state = network.NMT.states.OPERATIONAL;
        network.NMT.ResetDevice(0);
        expect(device.state).to.equal(network.NMT.states.INITIALIZING);
    });

    it("should broadcast ResetCommunication", function() {
        device.state = network.NMT.states.OPERATIONAL;
        network.NMT.ResetCommunication(0);
        expect(device.state).to.equal(network.NMT.states.INITIALIZING);
    });
});
