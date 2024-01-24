# node-canopen
CANopen is the internationally standardized (EN 50325-4) CAN-based
higher-layer protocol for embedded control system. For more information on
CANopen see http://www.can-cia.org/

This library allows the manipulation of CANopen devices as defined in CiA 301.

## Device
The Device class represents a CANopen device and provides context for the
protocol objects as well as access methods for the manufacturer data fields.

 OD Entry | Description                   | Supported
 -------- | ----------------------------- | ------------------------
  0x1000  | Device type                   | :heavy_check_mark:
  0x1002  | Manufacturer status register  | :heavy_check_mark:
  0x1008  | Manufacturer device name      | :heavy_check_mark:
  0x1009  | Manufacturer hardware version | :heavy_check_mark:
  0x100A  | Manufacturer software version | :heavy_check_mark:
  0x1010  | Store parameters              | :x:
  0x1011  | Restore default parameters    | :x:

## Protocols
### Emergency - EMCY
The CANopen emergency protocol is used to indicate internal errors with a
CANopen device. Call [Emcy.write][1] to produce an emergency object.

 OD Entry | Description               | Supported
 -------- | ------------------------- | ------------------------
  0x1001  | Error register            | :heavy_check_mark:
  0x1003  | Pre-defined error field   | :heavy_check_mark:
  0x1014  | COB_ID EMCY               | :heavy_check_mark:
  0x1015  | Inhibit time EMCY         | :heavy_check_mark:
  0x1028  | Emergency consumer object | :heavy_check_mark:
  0x1029  | Error behavior object     | :x:

[1]: https://daxbot.github.io/node-canopen/#emcywrite

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
Call [Nmt.start][2] to begin heartbeat generation.

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

[2]: https://daxbot.github.io/node-canopen/#nmtstart

### Process Data Object - PDO
The CANopen process data object protocol is used for broadcasting data changes
with minimal overhead, similar to a more traditional CAN network architecture.
A mapped PDO can be sent with the [Pdo.write][3] method. Calling
[Pdo.start][4] will begin producing mapped synchronous TPDOs.

 OD Entry        | Description                  | Supported
 --------------- | ---------------------------- | ------------------
 0x1400 - 0x15FF | RPDO communication parameter | :heavy_check_mark:
 0x1600 - 0x17FF | RPDO mapping parameter       | :heavy_check_mark:
 0x1800 - 0x19FF | TPDO communication parameter | :heavy_check_mark:
 0x1A00 - 0x1BFF | TPDO mapping parameter       | :heavy_check_mark:

[3]: https://daxbot.github.io/node-canopen/#pdowrite
[4]: https://daxbot.github.io/node-canopen/#pdostart

### Service Data Object - SDO
The CANopen service data object protocol provides direct access to a device's
object dictionary. Call the [Sdo.upload][5] or [Sdo.download][6] methods to
initate a transfer.

 OD Entry        | Description          | Supported
 --------------- | -------------------- | --------------------
 0x1200 - 0x127F | SDO server parameter | :heavy_check_mark:
 0x1280 - 0x12FF | SDO client parameter | :heavy_check_mark:

[5]: https://daxbot.github.io/node-canopen/#sdoupload
[6]: https://daxbot.github.io/node-canopen/#sdodownload

### Synchronization - SYNC
The CANopen sync protocol is used to synchronize actions between devices on the
network. Call [Sync.start][7] to begin producing sync objects.

 OD Entry | Description                 | Supported
 -------- | --------------------------- | -----------------------------
  0x1005  | COB-ID SYNC                 | :heavy_check_mark:
  0x1006  | Communication cycle period  | :heavy_check_mark:
  0x1007  | Sync window length          | :x:
  0x1019  | Sync counter overflow value | :heavy_check_mark:

[7]: https://daxbot.github.io/node-canopen/#syncstart

###  Time stamp - TIME
The CANopen time protocol is used to provide a simple network clock. Call
[Time.write][8] to produce a time stamp object.

 OD Entry | Description                | Supported
 -------- | -------------------------- | ---------
  0x1012  | COB-ID TIME                | :heavy_check_mark:
  0x1013  | High resolution time stamp | :x:

[8]: https://daxbot.github.io/node-canopen/#timewrite