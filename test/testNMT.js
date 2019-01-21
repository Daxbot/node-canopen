const canopen = require('../index');
const VirtualChannel = require('./common/VirtualChannel.js');
const assert = require('assert');

describe('NMT', () => {
    const channel = new VirtualChannel();
    const network = new canopen.Network(channel);
    const device = network.addDevice(0xA, './test/common/test.eds');

    it("Target PreOperational", (done) => {

        device.state = network.NMT.states.INITIALIZING;
        network.NMT.PreOperational(0xA);
        assert.strictEqual(device.state, network.NMT.states.PRE_OPERATIONAL);
        done();
    });

    it("Target Operational", (done) => {

        device.state = network.NMT.states.INITIALIZING;
        network.NMT.Operational(0xA);
        assert.strictEqual(device.state, network.NMT.states.OPERATIONAL);
        done();
    });

    it("Target Stopped", (done) => {

        device.state = network.NMT.states.INITIALIZING;
        network.NMT.Stopped(0xA);
        assert.strictEqual(device.state, network.NMT.states.STOPPED);
        done();
    });

    it("Target ResetDevice", (done) => {

        device.state = network.NMT.states.OPERATIONAL;
        network.NMT.ResetDevice(0xA);
        assert.strictEqual(device.state, network.NMT.states.INITIALIZING);
        done();
    });

    it("Target ResetCommunication", (done) => {

        device.state = network.NMT.states.OPERATIONAL;
        network.NMT.ResetCommunication(0xA);
        assert.strictEqual(device.state, network.NMT.states.INITIALIZING);
        done();
    });

    it("Broadcast PreOperational", (done) => {

        device.state = network.NMT.states.INITIALIZING;
        network.NMT.PreOperational(0);
        assert.strictEqual(device.state, network.NMT.states.PRE_OPERATIONAL);
        done();
    });

    it("Broadcast Operational", (done) => {

        device.state = network.NMT.states.INITIALIZING;
        network.NMT.Operational(0);
        assert.strictEqual(device.state, network.NMT.states.OPERATIONAL);
        done();
    });

    it("Broadcast Stopped", (done) => {

        device.state = network.NMT.states.INITIALIZING;
        network.NMT.Stopped(0);
        assert.strictEqual(device.state, network.NMT.states.STOPPED);
        done();
    });

    it("Broadcast ResetDevice", (done) => {

        device.state = network.NMT.states.OPERATIONAL;
        network.NMT.ResetDevice(0);
        assert.strictEqual(device.state, network.NMT.states.INITIALIZING);
        done();
    });

    it("Broadcast ResetCommunication", (done) => {

        device.state = network.NMT.states.OPERATIONAL;
        network.NMT.ResetCommunication(0);
        assert.strictEqual(device.state, network.NMT.states.INITIALIZING);
        done();
    });

});
