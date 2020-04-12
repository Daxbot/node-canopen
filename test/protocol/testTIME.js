const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const {EDS, Device} = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('TIME', function() {
    let node = null;

    beforeEach(function() {
        node = new Device({ id: 0xA, loopback: true });
    });

    afterEach(function() {
        delete node;
    });

    describe('Module initialization', function() {
        it('should throw if cobId is 0', function() {
            node.TIME.cobId = 0;
            return expect(() => { node.TIME.init(); }).to.throw(TypeError);
        });
    });

    describe('Object dictionary updates', function() {
        beforeEach(function() {
            node.TIME.cobId = 0x80;
            node.TIME.produce = true;
            node.TIME.consume = true;
            node.init();
        });

        it('should listen for updates to 0x1012', function(done) {
            const obj1012 = node.EDS.getEntry(0x1012);
            obj1012.addListener('update', () => {
                setImmediate(() => {
                    expect(node.TIME.cobId).to.equal(0x90);
                    expect(node.TIME.produce).to.equal(false);
                    expect(node.TIME.consume).to.equal(false);
                    done();
                });
            });

            obj1012.value = 0x90;
        });
    });

    describe('Producer', function() {
        it('should throw if produce is false', function() {
            node.TIME.cobId = 0x80;
            node.TIME.produce = false;
            node.TIME.consume = true;
            node.init();

            return expect(() => { node.TIME.write(); }).to.throw(TypeError);
        });

        it('should produce a time object', function(done) {
            node.TIME.cobId = 0x80;
            node.TIME.produce = true;
            node.TIME.consume = true;
            node.init();

            node.addListener('message', () => { done(); });
            node.TIME.write();
        });
    });

    describe('Consumer', function() {
        it('should emit on consuming a time object', function(done) {
            node.TIME.cobId = 0x80;
            node.TIME.produce = true;
            node.TIME.consume = true;
            node.init();

            node.on('time', () => { done(); });
            node.TIME.write();
        });
    });
});
