const canopen = require('../index');
const VirtualChannel = require('./common/VirtualChannel.js');
const assert = require('assert');

describe('Network', () => {
    it("Object Creation", (done) => {

        // Valid
        new canopen.Network(new VirtualChannel());
        
        // No channel
        assert.throws(() => {
            new canopen.Network(null);
        });

        // Channel has no send method
        assert.throws(() => {
            const channel = new VirtualChannel();
            channel.send = undefined;
            new canopen.Network(channel);
        });

        // Channel has no addListener method
        assert.throws(() => {
            const channel = new VirtualChannel();
            channel.addListener = undefined;
            new canopen.Network(channel);
        });

        done();
    });
});
