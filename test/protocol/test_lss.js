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
function rand32() {
    return Math.floor(Math.random() * 0xffffffff);
}

describe('Lss', function () {
    describe('Mode switching', function () {
        it('should change mode (global)', function (done) {
            const device = new Device({ loopback: true, enableLss: true });

            device.lss.addListener('lssChangeMode', (mode) => {
                expect(mode).to.equal(LssMode.CONFIGURATION);
                done();
            });

            device.lss.switchModeGlobal(LssMode.CONFIGURATION);
        });

        it('should change mode (selective)', function (done) {
            const device = new Device({ loopback: true, enableLss: true });

            const identity = {
                vendorId: 1,
                productCode: 2,
                revisionNumber: 3,
                serialNumber: 4,
            };

            device.lss.addListener('lssChangeMode', (mode) => {
                expect(mode).to.equal(LssMode.CONFIGURATION);
                done();
            });

            device.eds.setIdentity(identity);
            device.lss.switchModeSelective(identity);
        });

    });

    describe('Inquire', function () {
        const device = new Device({ loopback: true, enableLss: true });
        const identity = {
            vendorId: 1,
            productCode: 2,
            revisionNumber: 3,
            serialNumber: 4,
        };

        before(function () {
            device.eds.setIdentity(identity);
            device.lss.switchModeSelective(identity);
        });

        it('should inquire vendor-id', function (done) {
            expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
            device.lss.inquireVendorId().then((vendorId) => {
                expect(vendorId).to.equal(identity.vendorId);
                done();
            });
        });

        it('should inquire product-code', function (done) {
            expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
            device.lss.inquireProductCode().then((productCode) => {
                expect(productCode).to.equal(identity.productCode);
                done();
            });
        });

        it('should inquire revision-number', function (done) {
            expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
            device.lss.inquireRevisionNumber().then((revisionNumber) => {
                expect(revisionNumber).to.equal(identity.revisionNumber);
                done();
            });
        });

        it('should inquire serial-number', function (done) {
            expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
            device.lss.inquireSerialNumber().then((serialNumber) => {
                expect(serialNumber).to.equal(identity.serialNumber);
                done();
            });
        });
    });

    describe('Fastscan', function () {
        it('should scan vendorId', async function () {
            const device = new Device({ loopback: true, enableLss: true });
            for (let i = 0; i < 3; ++i) {
                device.lss.vendorId = rand32();
                await device.lss.fastscan({ timeout: 2 });
                expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
                device._mode = LssMode.OPERATION;
            }
        });

        it('should scan productCode', async function () {
            const device = new Device({ loopback: true, enableLss: true });
            for (let i = 0; i < 3; ++i) {
                device.lss.productCode = rand32();
                await device.lss.fastscan({ timeout: 2 });
                expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
                device._mode = LssMode.OPERATION;
            }
        });

        it('should scan revisionNumber', async function () {
            const device = new Device({ loopback: true, enableLss: true });
            for (let i = 0; i < 3; ++i) {
                device.lss.revisionNumber = rand32();
                await device.lss.fastscan({ timeout: 2 });
                expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
                device._mode = LssMode.OPERATION;
            }
        });

        it('should scan serialNumber', async function () {
            const device = new Device({ loopback: true, enableLss: true });
            for (let i = 0; i < 3; ++i) {
                device.lss.serialNumber = rand32();
                await device.lss.fastscan({ timeout: 2 });
                expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
                device._mode = LssMode.OPERATION;
            }
        });
    });
});