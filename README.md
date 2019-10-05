# node-canopen
[![Build Status](https://travis-ci.org/DaxBot/node-canopen.svg?branch=master)](https://travis-ci.org/DaxBot/node-canopen)

CANopen is the internationally standardized (EN 50325-4) CAN-based
higher-layer protocol for embedded control system. For more information on
CANopen see http://www.can-cia.org/

This library allows the manipulation of a CANopen network as defined in CiA 301
and supports the following protocols:

## Master/slave (CiA 301, 4.4.2)

Protocol | Master | Slave
-------- | ------ | ------
NMT | :heavy_check_mark: | :heavy_check_mark:
SYNC | :heavy_check_mark: | :x:
TIME | :x: | :x:
LSS | :x: | :x:

## Client/server (CiA 301, 4.4.3)

Protocol | Client | Server
-------- | ------ | ------
SDO | :heavy_check_mark: | :heavy_check_mark:

## Producer/consumer (CiA 301 4.4.4)

Protocol | Producer | Consumer
-------- | -------- | --------
PDO | :heavy_check_mark: | :heavy_check_mark:
EMCY | :x: | :heavy_check_mark:
TIME | :x: | :x:
LSS | :x: | :x:

## Examples
### canopend
Written as a replacement for the CANopenSocket application of the same name, canopend shows how to create a CANopen network master. Read/write commands can be sent to the command socket in order to initate an SDO transfer and return the results. If canopend is started with an EDS file it will parse incoming PDOs and report updates to the command socket.

Socket commands:
 - `[<sequence>] <node> read  <index> <subindex> <datatype>`
 - `[<sequence>] <node> write <index> <subindex> <datatype> <value>`

Command responses are as follows:

 Event | Response
 ----- | --------
 Successful write | `[<sequence>] OK`
 Successful read | `[<sequence>] OK <value>`
 SDO error | `[<sequence>] ERROR <error>`
 PDO update | `PDO: <name>=<value>`
 Emergency | `EM: <id> <code> <register> <bit> <info>`

## Modules
### Service Data Object - SDO
The CANopen service data object protocol is used for manipulating individual entries on the device and uses a client/server relationship.  The device whose object dictionary is being accessed is the server and the request intiator is the client. The SDO module uses the [SDO::upload](https://daxbot.github.io/node-canopen/#sdoupload) and [SDO::download](https://daxbot.github.io/node-canopen/#sdoupload) methods to initate SDO requests as a client.  To avoid interfering with remote devices the module will not serve requests by default. To begin or end server operation call [SDO::serverStart](https://daxbot.github.io/node-canopen/#sdoserverstop) or [SDO::serverStop](https://daxbot.github.io/node-canopen/#sdoserverstop).

Supported Features:
 - Expedited Transfer :heavy_check_mark:
 - Segmented Transfer :heavy_check_mark:
 - Block Transfer :x:

### Process Data Object - PDO
The CANopen process data object protocol is used for broadcasting data changes with minimal overhead, similar to a more traditional CAN network architecture. PDO uses a producer/consumer model where a device pushes a message to the bus and any number of nodes can act upon it.  Currently the PDO module handles Transmit PDOs and Receive PDOs the same way.  When a mapped data object is updated using [Device::setValue](https://daxbot.github.io/node-canopen/#devicesetvalue) or [Device::setRaw](https://daxbot.github.io/node-canopen/#devicesetraw) the user can call [PDO::transmit](https://daxbot.github.io/node-canopen/#pdotransmit) to push the changes to the network.  The module will automatically process incoming PDOs and update the object dictionary accordingly.

Supported Features:
 - Asynchronous PDOs
    - Triggered :heavy_check_mark:
    - Inhibit time :x:
    - Event timer :x:
 - Synchronous PDOs :x:

### Network Management - NMT
The CANopen network management protocol is used to manipulate the state of devices on the network and is responsible for heartbeat monitoring.  The NMT module can be used to set a device's operational mode.

Supported Features:
 - Remote state changes :heavy_check_mark:
 - Heartbeat monitoring :heavy_check_mark:
 - Command processing
    - State changes :heavy_check_mark:
    - Reset node :x:
    - Reset communications :x:

### Sync - SYNC
The CANopen sync protocol is used to synchronize actions between devices on the network.  Sync can be started or stopped using the standalone Sync module.

### Emergency - EMCY
Not yet implemented

###  Timestamp - TIME
Not yet implemented

### Layer Setting Services - LSS
Not yet implemented