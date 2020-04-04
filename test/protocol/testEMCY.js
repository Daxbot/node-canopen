const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const {EDS, Device} = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('EMCY', function() {
    let node = null;

    beforeEach(function() {
        node = new Device({ id: 0xA, loopback: true });

        /* Pre-defined error field. */
        node.EDS.addEntry(0x1003, {
            ParameterName:      'Pre-defined error field',
            ObjectType:         EDS.objectTypes.ARRAY,
            SubNumber:          2,
        });
        node.EDS.addSubEntry(0x1003, 1, {
            ParameterName:      'Standard error field',
            ObjectType:         EDS.objectTypes.VAR,
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
        });
    });

    afterEach(function() {
        delete node;
    });

    describe('Module initialization', function() {
        it('should require 0x1001', function() {
            node.EDS.removeEntry(0x1001);
            return expect(() => { node.EMCY.init(); }).to.throw(ReferenceError);
        });

        it('should throw if cobId is 0', function() {
            node.EMCY.cobId = 0;
            return expect(() => { node.EMCY.init(); }).to.throw(TypeError);
        });
    });

    describe('Object dictionary updates', function() {
        beforeEach(function() {
            node.EMCY.cobId = 0x80;
            node.EMCY.inhibitTime = 100;
            node.init();
        });

        it('should listen for updates to 0x1014', function(done) {
            const obj1014 = node.EDS.getEntry(0x1014);
            obj1014.addListener('update', () => {
                setImmediate(() => {
                    expect(node.EMCY.cobId).to.equal(0x9A);
                    done();
                });
            });

            obj1014.value = 0x9A;
        });

        it('should listen for updates to 0x1015', function(done) {
            const obj1015 = node.EDS.getEntry(0x1015);
            obj1015.addListener('update', () => {
                setImmediate(() => {
                    expect(node.EMCY.inhibitTime).to.equal(200);
                    done();
                });
            });

            obj1015.value = 200;
        });
    });

    describe('Producer', function() {
        beforeEach(function() {
            node.EMCY.cobId = 0x80;
            node.init();
        });

        it('should produce an emergency object', function(done) {
            node.channel.addListener('onMessage', () => { done(); });
            node.EMCY.write(0x1000);
        });
    });

    describe('Consumer', function() {
        beforeEach(function() {
            node.EMCY.cobId = 0x80;
            node.init();
        });

        it('should emit on consuming an emergency object', function(done) {
            node.on('emergency', () => { done(); });
            node.EMCY.write(0x1000);
        });

        it('should track error history', function() {
            return node.EMCY.write(0x1234).then(() => {
                return expect(node.EDS.getSubEntry(0x1003, 1).value).to.equal(0x1234);
            });
        });
    });
});
