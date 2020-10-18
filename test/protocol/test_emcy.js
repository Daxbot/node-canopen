const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, ObjectType, AccessType, DataType } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('EMCY', function() {
    let device = null;

    beforeEach(function() {
        device = new Device({ id: 0xA, loopback: true });

        /* Pre-defined error field. */
        device.eds.addEntry(0x1003, {
            'ParameterName':    'Pre-defined error field',
            'ObjectType':       ObjectType.ARRAY,
            'SubNumber':        2,
        });
        device.eds.addSubEntry(0x1003, 1, {
            'ParameterName':    'Standard error field',
            'ObjectType':       ObjectType.VAR,
            'DataType':         DataType.UNSIGNED32,
            'AccessType':       AccessType.READ_WRITE,
        });
    });

    afterEach(function() {
        delete device;
    });

    describe('Module initialization', function() {
        it('should require 0x1001', function() {
            device.eds.removeEntry(0x1001);
            return expect(() => { device.emcy.init(); }).to.throw(ReferenceError);
        });

        it('should throw if cobId is 0', function() {
            device.emcy.cobId = 0;
            return expect(() => { device.emcy.init(); }).to.throw(TypeError);
        });
    });

    describe('Object dictionary updates', function() {
        beforeEach(function() {
            device.emcy.cobId = 0x80;
            device.emcy.inhibitTime = 100;
            device.init();
        });

        it('should listen for updates to 0x1014', function(done) {
            const obj1014 = device.eds.getEntry(0x1014);
            obj1014.addListener('update', () => {
                setImmediate(() => {
                    expect(device.emcy.cobId).to.equal(0x9A);
                    done();
                });
            });

            obj1014.value = 0x9A;
        });

        it('should listen for updates to 0x1015', function(done) {
            const obj1015 = device.eds.getEntry(0x1015);
            obj1015.addListener('update', () => {
                setImmediate(() => {
                    expect(device.emcy.inhibitTime).to.equal(200);
                    done();
                });
            });

            obj1015.value = 200;
        });
    });

    describe('Producer', function() {
        beforeEach(function() {
            device.emcy.cobId = 0x80;
            device.init();
        });

        it('should produce an emergency object', function(done) {
            device.addListener('message', () => { done(); });
            device.emcy.write(0x1000);
        });
    });

    describe('Consumer', function() {
        beforeEach(function() {
            device.emcy.cobId = 0x80;
            device.init();
        });

        it('should emit on consuming an emergency object', function(done) {
            device.on('emergency', () => { done(); });
            device.emcy.write(0x1000);
        });

        it('should track error history', function() {
            return device.emcy.write(0x1234).then(() => {
                return expect(device.eds.getSubEntry(0x1003, 1).value).to.equal(0x1234);
            });
        });
    });
});
