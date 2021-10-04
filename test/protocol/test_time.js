const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Time', function() {
    let device = null;

    beforeEach(function() {
        device = new Device({ id: 0xA, loopback: true });
    });

    describe('Module initialization', function() {
        it('should throw if cobId is 0', function() {
            device.time.cobId = 0;
            return expect(() => {
                device.time.init();
            }).to.throw(TypeError);
        });
    });

    describe('Object dictionary updates', function() {
        it('should listen for updates to 0x1012', function(done) {
            device.time.cobId = 0x80;
            device.time.produce = true;
            device.time.consume = true;
            device.init()

            const obj1012 = device.eds.getEntry(0x1012);
            obj1012.addListener('update', () => {
                setImmediate(() => {
                    expect(device.time.cobId).to.equal(0x90);
                    expect(device.time.produce).to.equal(false);
                    expect(device.time.consume).to.equal(false);
                    done();
                });
            });

            obj1012.value = 0x90;
        });
    });

    describe('Producer', function() {
        it('should throw if produce is false', function() {
            device.time.cobId = 0x80;
            device.time.produce = false;
            device.time.consume = true;
            device.init();

            return expect(() => {
                device.time.write();
            }).to.throw(TypeError);
        });

        it('should produce a time object', function(done) {
            device.time.cobId = 0x80;
            device.time.produce = true;
            device.time.consume = true;
            device.init();

            device.addListener('message', () => {
                done();
            });
            device.time.write();
        });
    });

    describe('Consumer', function() {
        it('should emit on consuming a time object', function(done) {
            device.time.cobId = 0x80;
            device.time.produce = true;
            device.time.consume = true;
            device.init();

            device.on('time', () => {
                done();
            });
            device.time.write();
        });
    });
});
