const edsCreation = require('./eds/eds_creation');
const emcyConsumer = require('./emcy/emcy_consumer');
const emcyProducer = require('./emcy/emcy_producer');
const lssConsumer = require('./lss/lss_consumer');
const lssFastscan = require('./lss/lss_fastscan');
const lssGlobal = require('./lss/lss_global');
const nmtConsumer = require('./nmt/nmt_consumer');
const nmtProducer = require('./nmt/nmt_producer');
const pdoConsumer = require('./pdo/pdo_consumer');
const pdoProducer = require('./pdo/pdo_producer');
const sdoClient = require('./sdo/sdo_client');
const sdoServer = require('./sdo/sdo_server');
const syncConsumer = require('./sync/sync_consumer');
const syncProducer = require('./sync/sync_producer');
const timeConsumer = require('./time/time_consumer');
const timeProducer = require('./time/time_producer');

module.exports = exports = {
    edsCreation,
    emcyConsumer,
    emcyProducer,
    lssConsumer,
    lssFastscan,
    lssGlobal,
    nmtConsumer,
    nmtProducer,
    pdoConsumer,
    pdoProducer,
    sdoClient,
    sdoServer,
    syncConsumer,
    syncProducer,
    timeConsumer,
    timeProducer,
};
