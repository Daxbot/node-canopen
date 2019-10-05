const canopen = require('../index');
const VirtualChannel = require('./common/VirtualChannel.js');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('PDO', () => {
    // Create a PDO client and server at deviceId 0xA
    const channel = new VirtualChannel();
    const client = new canopen.Device(channel, 0xA, './test/common/test.eds');
    const server = new canopen.Device(channel, 0xA, './test/common/test.eds');

    describe('Transmit', function() {
        it("should transfer client value to server", function() {
            for(let i = 1; i <= 8; i++) {
                client.setValue('TPDO', i, i);
                server.setValue('TPDO', i, 0);
            }

            client.PDO.transmit();
            for(let i = 1; i <= 8; i++) {
                const clientValue = client.getValue('TPDO', i);
                const serverValue = server.getValue('TPDO', i);
                expect(serverValue).to.equal(clientValue);
            }
        });
    });
});
