# node-canopen
CANopen is the internationally standardized (EN 50325-4) CAN-based
higher-layer protocol for embedded control system. More information on CANopen
can be found on the [CiA site](http://www.can-cia.org/)

This library allows the manipulation of CANopen devices as defined in CiA 301.

## Porting Guide (Version 5 -> 6)

When updating from version 5 to version 6 be aware of the following changes:

1. Modifying the Eds via the protocol modules has been deprecated and the
preferred method is to use the new dedicated methods in the Eds class itself.
This change was made to allow configuration without needing to create
a Device object first. The following table is non-exhaustive and serves only
to illustrate the change:

  Old method                      | New method
  ------------------------------- | --------------------------------
  `device.emcy.cobId = 0x8A`      | `device.eds.setEmcyCobId(0x8A)`
  `device.nmt.producerTime = 500` | `device.eds.setHeartbeatProducerTime(500)`
  `device.sdo.addServer(0x8B)`    | `device.eds.addSdoClientParameter(0x8B)`
  `device.sync.generate = true`   | `device.eds.setSyncGenerationEnable(true)`

2. NMT state now matters. Prior to version 6 the NMT state was available, but
not used internally. The Device object is now aware of the NMT state and will
bring up and shutdown protocol objects as the state changes. If your PDOs are
not firing after the update make sure you are calling Nmt#startNode to switch
to NmtState.OPERATIONAL. This new behavior should only take effect upon calling
Device#start().

3. Events have been refactored and moved to their respective protocol modules.
Old events are still available, but will only fire if the Device#init() method
has been called.

4. The internal Eds array of DataObjects is now keyed from the hex index rather
than the decimal index to make debug printing less confusing. A getter with the
old indexing is provided so that iterating directly on Eds.dataObjects will
still work as expected, however you should switch to using the new iterator
methods (Eds.values(), Eds.entries(), Eds.keys()).

5. SDO client/server parameters will no longer assume you want to add the
node ID if you choose 0x580/0x600 for the SDO COB-IDs. As far as I can tell this
is not officially in the standard, but was a convienence added to some other
libraries.

## Documentation

Pre-built documentation for the latest release is available
[here](https://daxbot.github.io/node-canopen/).

Examples for each protocol are also available in the `examples` folder.

## Device
The Device class represents a CANopen device and provides context for the
protocol objects as well as access methods for the manufacturer data fields.
It contains the Eds and protocol objects.

 OD Entry | Description                   | Supported
 -------- | ----------------------------- | ------------------------
  0x1000  | Device type                   | :x:
  0x1002  | Manufacturer status register  | :heavy_check_mark:
  0x1008  | Manufacturer device name      | :heavy_check_mark:
  0x1009  | Manufacturer hardware version | :heavy_check_mark:
  0x100A  | Manufacturer software version | :heavy_check_mark:
  0x1010  | Store parameters              | :x:
  0x1011  | Restore default parameters    | :x:

## Eds
The Eds class represents a CANopen electronic datasheet file and can be used to
load and save the eds file format as defined in CiA 306. Device configuration
files (DCF) are not currently supported.

Eds provides setters for many of the communication profile objects
that are defined in CiA 301. Most of the protocol objects require one or more
entries in the Eds before they can function. Typically the user will want to
create or set those entries before calling [Device.start()][1].

[1]: https://daxbot.github.io/node-canopen/Device.html#start

## Protocols

### Emergency - EMCY
The CANopen emergency protocol is used to indicate internal errors with a
CANopen device. Call [Emcy.write()][2] to produce an emergency object. If a
valid 'Emergency consumer object entry' is present, the Emcy module will emit
[event:emergency][3] when the matching COB-ID is consumed.

 OD Entry | Description               | Supported
 -------- | ------------------------- | ------------------------
  0x1001  | Error register            | :heavy_check_mark:
  0x1003  | Pre-defined error field   | :heavy_check_mark:
  0x1014  | COB_ID EMCY               | :heavy_check_mark:
  0x1015  | Inhibit time EMCY         | :heavy_check_mark:
  0x1028  | Emergency consumer object | :heavy_check_mark:
  0x1029  | Error behavior object     | :x:

[2]: https://daxbot.github.io/node-canopen/Emcy.html#write
[3]: https://daxbot.github.io/node-canopen/Emcy.html#event:emergency

### Layer Setting Services - LSS
The CANopen layer setting services protocol allows the CAN-ID and bitrate of
an LSS consumer device to be modified. This allows for setting up a network of
identical devices without relying on physical dip switches or non-volatile
storage to distinguish between them.

 OD Entry | Description             | Supported
 -------- | ----------------------- | ------------------------
  0x1018  | Identity object         | :heavy_check_mark:

Supported Features:
 - LSS producer :heavy_check_mark:
 - LSS consumer :heavy_check_mark:

### Network Management - NMT
The CANopen network management protocol is used to manipulate the state of
NMT consumer devices on the network and is responsible for the device heartbeat.
Heartbeat generation will begin automatically when 'Producer heartbeat time'
is set. If a 'Consumer heartbeat time' entry is present, then the Nmt module
will emit [event:timeout][5] if the consumer heartbeat is lost.

 OD Entry | Description             | Supported
 -------- | ----------------------- | ------------------------
  0x100C  | Guard time              | :x:
  0x100D  | Life time factor        | :x:
  0x1016  | Consumer heartbeat time | :heavy_check_mark:
  0x1017  | Producer heartbeat time | :heavy_check_mark:

Supported Features:
 - Remote state changes :heavy_check_mark:
 - Heartbeat
   - Generation :heavy_check_mark:
   - Monitoring :heavy_check_mark:
 - Command processing
    - State changes :heavy_check_mark:
    - Reset node :heavy_check_mark:
    - Reset communications :heavy_check_mark:

[4]: https://daxbot.github.io/node-canopen/Nmt.html#event:changeState
[5]: https://daxbot.github.io/node-canopen/Nmt.html#event:timeout

### Process Data Object - PDO
The CANopen process data object protocol is used for broadcasting data changes
with minimal overhead, similar to a more traditional CAN network architecture.
A mapped TPDO can be sent with the [Pdo.write()][6] method. Event driven TPDOs
will be sent automatically when the device is in NmtState.OPERATIONAL. The Pdo
module will emit [event:pdo][7] when a mapped RPDO is consumed.

 OD Entry        | Description                  | Supported
 --------------- | ---------------------------- | ------------------
 0x1400 - 0x15FF | RPDO communication parameter | :heavy_check_mark:
 0x1600 - 0x17FF | RPDO mapping parameter       | :heavy_check_mark:
 0x1800 - 0x19FF | TPDO communication parameter | :heavy_check_mark:
 0x1A00 - 0x1BFF | TPDO mapping parameter       | :heavy_check_mark:

[6]: https://daxbot.github.io/node-canopen/Pdo.html#write
[7]: https://daxbot.github.io/node-canopen/Pdo.html#event:pdo

### Service Data Object - SDO
The CANopen service data object protocol provides direct access to a device's
object dictionary. Call the [SdoClient.upload()][7] or [SdoClient.download()][8]
methods to initate a transfer.

 OD Entry        | Description          | Supported
 --------------- | -------------------- | --------------------
 0x1200 - 0x127F | SDO server parameter | :heavy_check_mark:
 0x1280 - 0x12FF | SDO client parameter | :heavy_check_mark:

[8]: https://daxbot.github.io/node-canopen/SdoClient.html#upload
[9]: https://daxbot.github.io/node-canopen/SdoClient.html#download

### Synchronization - SYNC
The CANopen sync protocol is used to synchronize actions between devices on the
network. If enabled, Sync message generation will begin automatically when
[Device.start()][1] is called. Sync will emit [event:sync][10] when a Sync
object is consumed.

 OD Entry | Description                 | Supported
 -------- | --------------------------- | -----------------------------
  0x1005  | COB-ID SYNC                 | :heavy_check_mark:
  0x1006  | Communication cycle period  | :heavy_check_mark:
  0x1007  | Sync window length          | :x:
  0x1019  | Sync counter overflow value | :heavy_check_mark:

[10]: https://daxbot.github.io/node-canopen/Sync.html#event:sync

###  Time stamp - TIME
The CANopen time protocol is used to provide a simple network clock. Call
[Time.write()][11] to produce a time stamp object. Time will emit
[event:time][12] when a time stamp object is consumed.

 OD Entry | Description                | Supported
 -------- | -------------------------- | ---------
  0x1012  | COB-ID TIME                | :heavy_check_mark:
  0x1013  | High resolution time stamp | :x:

[11]: https://daxbot.github.io/node-canopen/Time.html#write
[12]: https://daxbot.github.io/node-canopen/Time.html#event:time