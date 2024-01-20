const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device } = require('../../index');
const examples = require('../../examples');

chai.use(chaiAsPromised);

describe('Examples', function () {
    let deviceA;
    let deviceB;

    beforeEach(function () {
        deviceA = new Device({
            id: 0xA,
            enableLss: true
        });

        deviceB = new Device({
            id: 0xB,
            enableLss: true
        });

        deviceA.addListener('message', (m) => {
            setImmediate(() => deviceB.receive(m));
        });

        deviceB.addListener('message', (m) => {
            setImmediate(() => deviceA.receive(m));
        });
    });

    it('should run eds', function () {
        return examples.edsCreation(true);
    });

    it('should run emcy', function () {
        return Promise.all([
            examples.emcyConsumer(deviceA),
            examples.emcyProducer(deviceB),
        ]);
    });

    it('should run lss', function () {
        return Promise.all([
            examples.lssConsumer(deviceA),
            examples.lssGlobal(deviceB),
        ]);
    });

    it('should run fastscan', function () {
        return Promise.all([
            examples.lssConsumer(deviceA),
            examples.lssFastscan(deviceB),
        ]);
    });

    it('should run nmt', function () {
        return Promise.all([
            examples.nmtConsumer(deviceA, deviceB.id),
            examples.nmtProducer(deviceB),
        ]);
    });

    it('should run pdo', function () {
        return Promise.all([
            examples.pdoConsumer(deviceA),
            examples.pdoProducer(deviceB),
        ]);
    });

    it('should run sdo', function () {
        return Promise.all([
            examples.sdoServer(deviceA, deviceB.id),
            examples.sdoClient(deviceB, deviceA.id),
        ]);
    });

    it('should run sync', function () {
        return Promise.all([
            examples.syncConsumer(deviceA),
            examples.syncProducer(deviceB),
        ]);
    });

    it('should run time', function () {
        return Promise.all([
            examples.timeConsumer(deviceA),
            examples.timeProducer(deviceB),
        ]);
    });
});
