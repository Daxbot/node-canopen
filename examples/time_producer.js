/** Time producer example.
 *
 * This example shows how to create a CANopen device that produces TIME objects.
 */

const {Device} = require('../index.js');
const can = require('socketcan');

/** Step 1: Create a new Device. */
node = new Device({ id: 0xF });

/** Step 2: Create a new socketcan RawChannel object. */
const channel = can.createRawChannel('vcan0');

/** Step 3: Configure the COB-ID and set the production enable. */
node.TIME.cobId = 0x80 + node.id;
node.TIME.produce = true;

/** Step 4: Initialize and start the node. */
channel.addListener('onMessage', (message) => { node.receive(message); });
node.transmit((message) => { channel.send(message); });

node.init();
node.start();
channel.start();

/** Step 5: Begin producing TIME objects. */
setInterval(() => { node.TIME.write(); }, 1000);

console.log("Press Ctrl-C to quit");