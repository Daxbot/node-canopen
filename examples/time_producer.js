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

/** Step 3: Configure the COB-ID. */
node.EDS.addEntry(0x1012, {
    ParameterName:      'COB-ID TIME',
    ObjectType:         EDS.objectTypes.VAR,
    DataType:           EDS.dataTypes.UNSIGNED32,
    AccessType:         EDS.accessTypes.READ_WRITE,
    DefaultValue:       0x80 + node.id,
});

/** Step 4: Initialize the client. */
node.init();
channel.start();

/** Step 5: Begin producing TIME objects. */
setInterval(() => { node.TIME.write(); }, 1000);

console.log("Press Ctrl-C to quit");