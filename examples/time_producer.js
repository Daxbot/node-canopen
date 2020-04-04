/** Time producer example.
 *
 * This example shows how to create a CANopen device that produces TIME objects.
 */

const {EDS, Device} = require('../index.js');
const can = require('socketcan');

/** Step 1: Create a new socketcan RawChannel object. */
const channel = can.createRawChannel('vcan0');

/** Step 2: Create a new Device. */
node = new Device({ id: 0xF, channel: channel });

/** Step 3: Configure the COB-ID and set the production enable. */
node.TIME.cobId = 0x80 + node.id;
node.TIME.produce = true;

/** Step 4: Initialize and start the node. */
node.init();
node.start();

/** Step 5: Begin producing TIME objects. */
setInterval(() => { node.TIME.write(); }, 1000);

console.log("Press Ctrl-C to quit");