/** EDS creation example.
 *
 * This example shows how to create a new electronic data sheet object, add
 * entries, and save it to disk.
 */

const { EDS } = require('../index');
const os = require("os");

/** Step 1: Instantiate a new EDS object. */
const eds = new EDS.EDS();

/** Step 2: Edit file info. */
eds.fileName = 'example.eds';
eds.fileVersion = '1'
eds.fileRevision = '1'
eds.EDSVersion = '4.0'
eds.description = 'An example EDS file';
eds.creationDate = new Date();
eds.createdBy = os.userInfo().username;

/** Step 3: Add entries. */
eds.addEntry(0x1016, {
    ParameterName:      'Consumer heartbeat time',
    ObjectType:         EDS.objectTypes.ARRAY,
    SubNumber:          2,
});

eds.addSubEntry(0x1016, 1, {
    ParameterName:      'Consumer 1',
    ObjectType:         EDS.objectTypes.VAR,
    DataType:           EDS.dataTypes.UNSIGNED32,
    AccessType:         EDS.accessTypes.READ_WRITE,
    DefaultValue:       (0x3 << 16) | 10,
});

eds.addEntry(0x1017, {
    ParameterName:      'Producer heartbeat timer',
    ObjectType:         EDS.objectTypes.VAR,
    DataType:           EDS.dataTypes.UNSIGNED32,
    AccessType:         EDS.accessTypes.READ_WRITE,
    DefaultValue:       500,
});

eds.addEntry(0x2000, {
    ParameterName:      'Error status bits',
    ObjectType:         EDS.objectTypes.VAR,
    DataType:           EDS.dataTypes.OCTET_STRING,
    AccessType:         EDS.accessTypes.READ_WRITE,
    DefaultValue:       '00000000000000000000',
});

/** Step 4: Write to disk */
eds.save('example.eds');
