/** EMCY message example.
 *
 * This example shows how to broadcast CANopen emergency objects.
 */

const {Device} = require('../index.js');
const can = require('socketcan');

/** Step 1: Create a new Device. */
node = new Device({ id: 0xA });

/** Step 2: Create a new socketcan RawChannel object. */
const channel = can.createRawChannel('vcan0');

/** Step 3: Configure the COB-ID. */
node.EMCY.cobId = 0x80;

/** Step 4: Initialize and start the node. */
channel.addListener('onMessage', (message) => { node.receive(message); });
node.transmit((message) => { channel.send(message); });

node.init();
node.start();
channel.start();

/** Step 5: Produce an EMCY object. */
node.EMCY.write(0x1000);

setTimeout(() => {
    process.exit();
}, 1000);
