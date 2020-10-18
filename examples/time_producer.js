/** Time producer example.
 *
 * This example shows how to create a CANopen device that produces TIME objects.
 */

const { Device } = require('../index.js');
const can = require('socketcan');

/** Step 1: Create a new Device. */
const device = new Device({ id: 0xF });

/** Step 2: Create a new socketcan RawChannel object. */
const channel = can.createRawChannel('can0');

/** Step 3: Configure the COB-ID and set the production enable. */
device.time.cobId = 0x80 + device.id;
device.time.produce = true;

/** Step 4: Initialize and start the node. */
channel.addListener('onMessage', (message) => { device.receive(message); });
device.transmit((message) => { channel.send(message); });

device.init();
channel.start();

/** Step 5: Begin producing TIME objects. */
setInterval(() => { device.time.write(); }, 1000);

console.log("Press Ctrl-C to quit");