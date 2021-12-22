# node-canopen
CANopen is the internationally standardized (EN 50325-4) CAN-based
higher-layer protocol for embedded control system. For more information on
CANopen see http://www.can-cia.org/

This library allows the manipulation of CANopen devices as defined in CiA 301.

## Documentation
Pre-built documentation is available here: https://daxbot.github.io/node-canopen/

## Protocols
### Emergency - EMCY
The CANopen emergency protocol is used to indicate internal errors with a
CANopen device. Call [Emcy.write][1] to produce an emergency object.

 OD Entry | Description             | Notes
 -------- | ----------------------- | ------------------------
  0x1001  | Error register          | Required.
  0x1003  | Pre-defined error field | Required for error history.
  0x1014  | COB_ID EMCY             | Required for write.
  0x1015  | Inhibit time EMCY       | Required for inhibit time.

Supported Features:
 - Error generation :heavy_check_mark:
 - Error history :heavy_check_mark:

[1]: https://daxbot.github.io/node-canopen/#emcywrite

### Layer Setting Services - LSS
The CANopen layer setting services protocol allows the CAN-ID and bitrate of
an LSS consumer device to be modified. This allows for setting up a network of
identical devices without relying on physical dip switches or non-volatile
storage to distinguish between them.

 OD Entry | Description             | Notes
 -------- | ----------------------- | ------------------------
  0x1018  | Identity object         | Required.

Supported Features:
 - LSS producer :heavy_check_mark:
 - LSS consumer :heavy_check_mark:

### Network Management - NMT
The CANopen network management protocol is used to manipulate the state of
NMT consumer devices on the network and is responsible for the device heartbeat.
Call [Nmt.start][2] to begin heartbeat generation.

 OD Entry | Description             | Notes
 -------- | ----------------------- | ------------------------
  0x1016  | Consumer heartbeat time | Required for monitoring.
  0x1017  | Producer heartbeat time | Required for generation.

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

 OD Entry        | Description                  | Notes
 --------------- | ---------------------------- | ------------------
 0x1400 - 0x15FF | RPDO communication parameter | Required for RPDOs.
 0x1600 - 0x17FF | RPDO mapping parameter       | Required for RPDOs.
 0x1800 - 0x19FF | TPDO communication parameter | Required for TPDOs.
 0x1A00 - 0x1BFF | TPDO mapping parameter       | Required for TPDOs.

Supported Features:
 - Asynchronous PDOs
    - Triggered :heavy_check_mark:
    - Inhibit time :heavy_check_mark:
    - Event timer :heavy_check_mark:
    - RTR :x:
 - Synchronous PDOs :heavy_check_mark:
 - Multiplex PDOs :x:

[3]: https://daxbot.github.io/node-canopen/#pdowrite
[4]: https://daxbot.github.io/node-canopen/#pdostart

### Service Data Object - SDO
The CANopen service data object protocol provides direct access to a device's
object dictionary. Call the [Sdo.upload][5] or [Sdo.download][6] methods to
initate a transfer.

 OD Entry        | Description          | Notes
 --------------- | -------------------- | --------------------
 0x1200 - 0x127F | SDO server parameter | Required for server.
 0x1280 - 0x12FF | SDO client parameter | Required for client.

Supported Features:
 - Expedited Transfer :heavy_check_mark:
 - Segmented Transfer :heavy_check_mark:
 - Block Transfer :heavy_check_mark:

[5]: https://daxbot.github.io/node-canopen/#sdoupload
[6]: https://daxbot.github.io/node-canopen/#sdodownload

### Synchronization - SYNC
The CANopen sync protocol is used to synchronize actions between devices on the
network. Call [Sync.start][7] to begin producing sync objects.

 OD Entry | Description                 | Notes
 -------- | --------------------------- | -----------------------------
  0x1005  | COB-ID SYNC                 | Required.
  0x1006  | Communication cycle period  | Required for generation.
  0x1019  | Sync counter overflow value | Required for counter.

Supported Features:
 - Sync counter :heavy_check_mark:

[7]: https://daxbot.github.io/node-canopen/#syncstart

###  Time stamp - TIME
The CANopen time protocol is used to provide a simple network clock. Call
[Time.write][8] to produce a time stamp object.

 OD Entry | Description | Notes
 -------- | ----------- | ---------
  0x1012  | COB-ID TIME | Required.

[8]: https://daxbot.github.io/node-canopen/#timewrite