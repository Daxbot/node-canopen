/** SDO client example.
 *
 * This example shows how to create a CANopen device that downloads (writes)
 * and uploads (reads) data from an SDO server.
 */

const {EDS, Device} = require('../index.js');
const can = require('socketcan');

/** Step 1: Create a new socketcan RawChannel object. */
const channel = can.createRawChannel('vcan0');

/** Step 2: Create a new Device. */
node = new Device({ id: 0xC, channel: channel });

/** Step 3: Configure the SDO client parameters. */
node.EDS.addEntry(0x1280, {
    ParameterName:      'SDO client parameter',
    ObjectType:         EDS.objectTypes.RECORD,
    SubNumber:          3,
});
node.EDS.addSubEntry(0x1280, 1, {
    ParameterName:      'COB-ID client to server',
    DataType:           EDS.dataTypes.UNSIGNED32,
    AccessType:         EDS.accessTypes.READ_WRITE,
    DefaultValue:       0x600,
});
node.EDS.addSubEntry(0x1280, 2, {
    ParameterName:      'COB-ID server to client',
    DataType:           EDS.dataTypes.UNSIGNED32,
    AccessType:         EDS.accessTypes.READ_WRITE,
    DefaultValue:       0x580,
});
node.EDS.addSubEntry(0x1280, 3, {
    ParameterName:      'Node-ID of the SDO server',
    DataType:           EDS.dataTypes.UNSIGNED8,
    AccessType:         EDS.accessTypes.READ_WRITE,
    DefaultValue:       0xD,
});

/** Step 4: Initialize the node. */
node.init();
channel.start();

/** Step 5: Write data to the server then read it back. */
const date = new Date();
const buffer = Buffer.from(date.toString(), 'utf8');

node.SDO.download(0xA, buffer, 0x2000).then(() => {
    node.SDO.upload(0xA, 0x2000).then((data) => {
        console.log(data.toString());
        process.exit()
    });
})
