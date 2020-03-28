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
node.EDS.addEntry(0x1017, {
    ParameterName:      'Producer heartbeat time',
    ObjectType:         EDS.objectTypes.VAR,
    DataType:           EDS.dataTypes.UNSIGNED32,
    AccessType:         EDS.accessTypes.READ_WRITE,
    DefaultValue:       500,
});

/** Step 4: Initialize the client. */
node.init();
channel.start();

/** Step 5: Begin heartbeat generation. */
node.NMT.start();

/** Step 6: Start and stop the node using NMT commands. */
setTimeout(() => {
    node.NMT.startNode(node.id);
    setTimeout(() => {
        node.NMT.stopNode(node.id);
        setTimeout(() => {
            process.exit()
        }, 2000);
    }, 2000);
}, 2000);
