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
node.EDS.addEntry(0x1005, {
    ParameterName:      'COB-ID SYNC',
    ObjectType:         EDS.objectTypes.VAR,
    DataType:           EDS.dataTypes.UNSIGNED32,
    AccessType:         EDS.accessTypes.READ_WRITE,
    DefaultValue:       0x80,
});

node.EDS.addEntry(0x1006, {
    ParameterName:      'Communication cycle period',
    ObjectType:         EDS.objectTypes.VAR,
    DataType:           EDS.dataTypes.UNSIGNED32,
    AccessType:         EDS.accessTypes.READ_WRITE,
    DefaultValue:       1e6, // 1 second
});

/** Step 4: Initialize the node. */
node.init();
channel.start();

/** Step 5: Begin producing SYNC objects. */
node.SYNC.start();

console.log("Press Ctrl-C to quit");