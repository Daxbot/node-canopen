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
    it('should get 0x1018', function () {
        const device = new Device({ enableLss: true });
        expect(device.lss.vendorId).to.equal(0);
        expect(device.lss.productCode).to.equal(0);
        expect(device.lss.revisionNumber).to.equal(0);
        expect(device.lss.serialNumber).to.equal(0);

        device.eds.setIdentity({
            vendorId: 1,
            productCode: 2,
            revisionNumber: 3,
            serialNumber: 4,
        });

        expect(device.lss.vendorId).to.equal(1);
        expect(device.lss.productCode).to.equal(2);
        expect(device.lss.revisionNumber).to.equal(3);
        expect(device.lss.serialNumber).to.equal(4);
    });

    describe('Mode switching', function () {
        it('should change mode (global)', function (done) {
            const device = new Device({ loopback: true, enableLss: true });

            device.lss.addListener('changeMode', (mode) => {
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

            device.lss.addListener('changeMode', (mode) => {
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
        it('should fastscan', async function () {
            const device = new Device({ loopback: true, enableLss: true });
            device.eds.setIdentity({
                vendorId: rand32(),
                productCode: rand32(),
                revisionNumber: rand32(),
                serialNumber: rand32(),
            });

            const identity = await device.lss.fastscan({ timeout: 2 });
            expect(device.lss.mode).to.equal(LssMode.CONFIGURATION);
            expect(device.lss.vendorId).to.equal(identity.vendorId);
            expect(device.lss.productCode).to.equal(identity.productCode);
            expect(device.lss.revisionNumber).to.equal(identity.revisionNumber);
            expect(device.lss.serialNumber).to.equal(identity.serialNumber);
        });
    });
});