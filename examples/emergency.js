/** EMCY message example.
 *
 * This example shows how to broadcast CANopen emergency objects.
 */

const {EDS, Device} = require('../index.js');
const can = require('socketcan');

/** Step 1: Create a new socketcan RawChannel object. */
const channel = can.createRawChannel('vcan0');

/** Step 2: Create a new Device. */
node = new Device({ id: 0xA, channel: channel });

/** Step 3: Configure the COB-ID. */
node.EDS.addEntry(0x1014, {
    ParameterName:      'COB-ID EMCY',
    ObjectType:         EDS.objectTypes.VAR,
    DataType:           EDS.dataTypes.UNSIGNED32,
    AccessType:         EDS.accessTypes.READ_WRITE,
    DefaultValue:       0x80 + node.id,
});

/** Step 4: Initialize the node. */
node.init();
channel.start();

/** Step 5: Produce an EMCY object. */
node.EMCY.write(0x1000);

setTimeout(() => {
    process.exit();
}, 1000);
