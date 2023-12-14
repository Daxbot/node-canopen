const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, LssMode } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

/**
 * Returns a random unsigned 32-bit integer.
 *
 * @returns {number} - unsigned 32-bit integer.
 * @private
 */
function randomId() {
    return Math.floor(Math.random() * 0xffffffff);
}

describe('Lss', function () {
    describe('Mode switching', function () {
        it('should change mode (global)', function (done) {
            const device = new Device({ id: 0xA, loopback: true });
            device.eds.lssSupported = true;
            device.init();

            device.lss.switchModeGlobal(LssMode.CONFIGURATION);
            setTimeout(() => {
                expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
                done();
            }, 10);
        });

        it('should change mode (selective)', function (done) {
            const device = new Device({ id: 0xA, loopback: true });
            device.eds.lssSupported = true;
            device.lss.vendorId = 1;
            device.lss.productCode = 2;
            device.lss.revisionNumber = 3;
            device.lss.serialNumber = 4;
            device.init();

            device.lss.switchModeSelective(1, 2, 3, 4);
            setTimeout(() => {
                expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
                done();
            }, 10);
        });

        it('should emit on mode change', function (done) {
            const device = new Device({ id: 0xA, loopback: true });
            device.eds.lssSupported = true;
            device.init();

            device.on('lssChangeMode', () => {
                expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
                done();
            });

            device.lss.switchModeGlobal(LssMode.CONFIGURATION);
        });
    });

    describe('Inquire', function () {
        let device;

        before(function () {
            device = new Device({ id: 0xA, loopback: true });
            device.eds.lssSupported = true;
            device.lss.vendorId = 1;
            device.lss.productCode = 2;
            device.lss.revisionNumber = 3;
            device.lss.serialNumber = 4;
            device.lss._mode = LssMode.CONFIGURATION;
            device.init();
        });

        it('should inquire vendor-id', async function () {
            const vendorId = await device.lss.inquireVendorId();
            expect(vendorId).to.equal(device.lss.vendorId);
        });

        it('should inquire product-code', async function () {
            const productCode = await device.lss.inquireProductCode();
            expect(productCode).to.equal(device.lss.productCode);
        });

        it('should inquire revision-number', async function () {
            const revisionNumber = await device.lss.inquireRevisionNumber();
            expect(revisionNumber).to.equal(device.lss.revisionNumber);
        });

        it('should inquire serial-number', async function () {
            const serialNumber = await device.lss.inquireSerialNumber();
            expect(serialNumber).to.equal(device.lss.serialNumber);
        });
    });

    describe('Fastscan', function () {
        let device;

        before(function () {
            device = new Device({ id: 0xA, loopback: true });
            device.eds.lssSupported = true;
            device.lss._mode = LssMode.CONFIGURATION;
            device.init();
        });

        it('should scan vendorId', async function () {
            for (let i = 0; i < 10; ++i) {
                device.lss.vendorId = randomId();
                await device.lss.fastscan({ timeout: 2 });
                expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
                device._mode = LssMode.OPERATION;
            }
        });

        it('should scan productCode', async function () {
            for (let i = 0; i < 10; ++i) {
                device.lss.productCode = randomId();
                await device.lss.fastscan({ timeout: 2 });
                expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
                device._mode = LssMode.OPERATION;
            }
        });

        it('should scan revisionNumber', async function () {
            for (let i = 0; i < 10; ++i) {
                device.lss.revisionNumber = randomId();
                await device.lss.fastscan({ timeout: 2 });
                expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
                device._mode = LssMode.OPERATION;
            }
        });

        it('should scan serialNumber', async function () {
            for (let i = 0; i < 10; ++i) {
                device.lss.serialNumber = randomId();
                await device.lss.fastscan({ timeout: 2 });
                expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
                device._mode = LssMode.OPERATION;
            }
        });
    });
});