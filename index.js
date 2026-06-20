const Device = require('./source/device');
const { DataObject, ObjectDictionary } = require('./source/eds');
const { ObjectType, AccessType, DataType } = require('canopen-eds');

const {
    EmcyType,
    EmcyCode,
    EmcyMessage,
    LssError,
    LssMode,
    NmtState,
    SdoCode,
    SdoError
} = require('./source/protocol');

const {
    calculateCrc,
    typeToRaw,
    rawToType,
    dateToTime,
    timeToDate
} = require('./source/functions');

module.exports = exports = {
    Device,
    DataObject,
    ObjectDictionary,
    SdoError,
    SdoCode,
    EmcyMessage,
    EmcyCode,
    EmcyType,
    AccessType,
    DataType,
    LssError,
    LssMode,
    NmtState,
    ObjectType,
    calculateCrc,
    typeToRaw,
    rawToType,
    dateToTime,
    timeToDate,
};
