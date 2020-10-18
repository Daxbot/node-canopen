/**
 * SDO client example.
 *
 * This example shows how to create a CANopen device that downloads (writes)
 * and uploads (reads) data from an SDO server.
 */

const { Device, ObjectType, AccessType, DataType } = require('../index.js');
const can = require('socketcan');

/** Step 1: Create a new Device. */
const device = new Device({ id: 0xC });

/** Step 2: Create a new socketcan RawChannel object. */
const channel = can.createRawChannel('can0');

/** Step 3: Configure the SDO client parameters. */
device.eds.addEntry(0x1280, {
    'ParameterName':    'SDO client parameter',
    'ObjectType':       ObjectType.RECORD,
    'SubNumber':        4,
});
device.eds.addSubEntry(0x1280, 1, {
    'ParameterName':    'COB-ID client to server',
    'DataType':         DataType.UNSIGNED32,
    'AccessType':       AccessType.READ_WRITE,
    'DefaultValue':     0x600,
});
device.eds.addSubEntry(0x1280, 2, {
    'ParameterName':    'COB-ID server to client',
    'DataType':         DataType.UNSIGNED32,
    'AccessType':       AccessType.READ_WRITE,
    'DefaultValue':     0x580,
});
device.eds.addSubEntry(0x1280, 3, {
    'ParameterName':    'Node-ID of the SDO server',
    'DataType':         DataType.UNSIGNED8,
    'AccessType':       AccessType.READ_WRITE,
    'DefaultValue':     0xD,
});

/** Step 4: Initialize and start the device. */
channel.addListener('onMessage', (message) => { device.receive(message); });
device.transmit((message) => { channel.send(message); });

device.init();
channel.start();

/** Step 5: Write data to the server then read it back. */
const date = new Date();

device.sdo.download({
    serverId: 0xD,
    data: date.toString(),
    dataType: DataType.VISIBLE_STRING,
    index: 0x2000
})
.then(() => {
    device.sdo.upload({
        serverId: 0xD,
        index: 0x2000,
        dataType: DataType.VISIBLE_STRING
    })
    .then((value) => {
        console.log(value);
        process.exit()
    });
});
