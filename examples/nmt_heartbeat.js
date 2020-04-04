/** NMT example.
 *
 * This example shows how configure the device heartbeat and send NMT commands.
 */

const {EDS, Device} = require('../index.js');
const can = require('socketcan');

/** Step 1: Create a new socketcan RawChannel object. */
const channel = can.createRawChannel('vcan0');

/** Step 2: Create a new Device. */
node = new Device({ id: 0xB, channel: channel });

/** Step 3: Configure the producer heartbeat time. */
node.NMT.producerTime = 500;

/** Step 4: Initialize and start the node. */
node.init();
node.start();

/** Step 5: Stop the node using NMT commands. */
setTimeout(() => {
    node.NMT.stopNode(node.id);
    setTimeout(() => {
        process.exit()
    }, 2000);
}, 2000);
