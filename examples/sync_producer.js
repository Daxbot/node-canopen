/** Sync producer example.
 *
 * This example shows how to create a CANopen device that produces network
 * synchronization objects.
 */

const {EDS, Device} = require('../index.js');
const can = require('socketcan');

/** Step 1: Create a new socketcan RawChannel object. */
const channel = can.createRawChannel('vcan0');

/** Step 2: Create a new Device. */
node = new Device({ id: 0xE, channel: channel });

/** Step 3: Configure the COB-ID and cycle period. */
node.SYNC.cobId = 0x80;
node.SYNC.cyclePeriod = 1e6; // 1 second
node.SYNC.enable = true;

/** Step 4: Initialize the node. */
node.init();
node.start();

console.log("Press Ctrl-C to quit");