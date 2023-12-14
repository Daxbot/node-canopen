const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, EdsError } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Emcy', function () {
    let device = null;

    describe('Module initialization', function () {
        beforeEach(function () {
            device = new Device({ id: 0xA, loopback: true });
        });

        it('should create 0x1001', function () {
            device.eds.removeEntry(0x1001);
            expect(device.eds.getEntry(0x1001)).to.not.exist;

            device.emcy.init();
            expect(device.eds.getEntry(0x1001)).to.exist;
        });

        it('should throw if cobId is 0', function () {
            device.emcy.cobId = 0;
            return expect(() => {
                device.emcy.init();
            }).to.throw(TypeError);
        });
    });

    describe('Object dictionary', function () {
        beforeEach(function () {
            device = new Device({ id: 0xA, loopback: true });
            device.emcy.cobId = 0x80;
            device.emcy.inhibitTime = 100;
            device.init();
        });

        it('should add entries to 0x1028', function () {
            device.emcy.addConsumer(0x8B);
            expect(device.eds.getSubEntry(0x1028, 1)).to.exist;
        });

        it('should throw on repeated add', function () {
            device.emcy.addConsumer(0x8B);
            expect(() => device.emcy.addConsumer(0x8B)).to.throw(EdsError);
        });

        it('should get entries from 0x1028', function () {
            device.emcy.addConsumer(0x8B);
            expect(device.emcy.getConsumer(0x8B)).to.exist;
            expect(device.emcy.getConsumer(0x8C)).to.be.null;
        });

        it('should remove entries from 0x1028', function () {
            device.emcy.addConsumer(0x8B);
            device.emcy.removeConsumer(0x8B);
            expect(device.emcy.getConsumer(0x8B)).to.be.null;
        });

        it('should throw on repeated remove', function () {
            expect(() => device.emcy.removeConsumer(0x8B)).to.throw(EdsError);
        });

        it('should configure 0x1003', function (done) {
            // Configure 0x1003 for 10 sub-entries
            device.emcy.setHistoryLength(10);
            expect(device.eds.getEntry(0x1003).subNumber).to.equal(11);

            // Re-configure 0x1003 for 5 sub-entries
            device.emcy.setHistoryLength(5);
            expect(device.eds.getEntry(0x1003).subNumber).to.equal(6);

            done();
        });

        it('should listen for updates to 0x1014', function (done) {
            const obj1014 = device.eds.getEntry(0x1014);
            obj1014.addListener('update', () => {
                setImmediate(() => {
                    expect(device.emcy.cobId).to.equal(0x9A);
                    done();
                });
            });

            obj1014.value = 0x9A;
        });

        it('should listen for updates to 0x1015', function (done) {
            const obj1015 = device.eds.getEntry(0x1015);
            obj1015.addListener('update', () => {
                setImmediate(() => {
                    expect(device.emcy.inhibitTime).to.equal(200);
                    done();
                });
            });

            obj1015.value = 200;
        });

        it('should listen for updates to 0x1028', function (done) {
            const obj1028 = device.eds.getEntry(0x1028);
            obj1028.addListener('update', (entry) => {
                setImmediate(() => {
                    expect(entry[1].value & 0x7FF).to.equal(0x8A);
                    done();
                });
            });

            device.emcy.addConsumer(0x8A);
        });
    });

    describe('Producer', function () {
        it('should produce an emergency object', function (done) {
            device = new Device({ id: 0xA, loopback: true });
            device.emcy.cobId = 0x80;
            device.init();
            device.addListener('message', () => done());
            device.emcy.write(0x1000);
        });
    });

    describe('Consumer', function () {
        beforeEach(function () {
            device = new Device({ id: 0xA, loopback: true });
            device.emcy.cobId = 0x8A;
            device.emcy.addConsumer(0x8A);
            device.init();
        });

        it('should emit on consuming an emergency object', function (done) {
            device.on('emergency', () => {
                done();
            });
            device.emcy.write(0x1000);
        });

        it('should track error history', function (done) {
            device.emcy.setHistoryLength(1);
            device.emcy.write(0x1234).then(() => {
                setImmediate(() => {
                    expect(device.emcy.history[0]).to.equal(0x1234);
                    done();
                });
            })
                .catch((e) => done(e));
        });
    });
});
