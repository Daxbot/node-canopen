const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const {EDS, Device} = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('SYNC', function() {
    let node = null;

    beforeEach(function() {
        node = new Device({ id: 0xA, loopback: true });
    });

    afterEach(function() {
        delete node;
    });

    describe('Module initialization', function() {
        it('should throw if cobId is 0', function() {
            node.SYNC.cobId = 0;
            return expect(() => { node.SYNC.init(); }).to.throw(TypeError);
        });

        it('should throw if enable is false', function() {
            node.SYNC.cobId = 0x80;
            node.SYNC.enable = false;
            node.SYNC.cyclePeriod = 1000;
            node.init();

            return Promise.all([
                expect(() => { node.SYNC.write(); }).to.throw(TypeError),
                expect(() => { node.SYNC.start(); }).to.throw(TypeError),
            ]);
        });

        it('should throw if cyclePeriod is 0', function() {
            node.SYNC.cobId = 0x80;
            node.SYNC.enable = true;
            node.SYNC.cyclePeriod = 0;
            node.init();

            return expect(() => { node.SYNC.start(); }).to.throw(TypeError);
        });
    });

    describe('Object dictionary updates', function() {
        beforeEach(function() {
            node.SYNC.cobId = 0x80;
            node.SYNC.enable = true;
            node.SYNC.cyclePeriod = 100;
            node.SYNC.overflow = 10;
            node.init();
        });

        it('should listen for updates to 0x1005', function(done) {
            const obj1005 = node.EDS.getEntry(0x1005);
            obj1005.addListener('update', () => {
                setImmediate(() => {
                    expect(node.SYNC.cobId).to.equal(0x90);
                    expect(node.SYNC.enable).to.equal(false);
                    done();
                });
            });

            obj1005.value = 0x90;
        });

        it('should listen for updates to 0x1006', function(done) {
            const obj1006 = node.EDS.getEntry(0x1006);
            obj1006.addListener('update', () => {
                setImmediate(() => {
                    expect(node.SYNC.cyclePeriod).to.equal(200);
                    done();
                });
            });

            obj1006.value = 200;
        });

        it('should listen for updates to 0x1019', function(done) {
            const obj1019 = node.EDS.getEntry(0x1019);
            obj1019.addListener('update', () => {
                setImmediate(() => {
                    expect(node.SYNC.overflow).to.equal(20);
                    done();
                });
            });

            obj1019.value = 20;
        });
    });

    describe('Producer', function() {
        it('should produce a sync object', function(done) {
            node.SYNC.cobId = 0x80;
            node.SYNC.enable = true;
            node.SYNC.cyclePeriod = 100;
            node.init();

            node.channel.addListener('onMessage', () => { done(); });
            node.SYNC.write();
        });

        it('should increment the counter', function(done) {
            node.SYNC.cobId = 0x80;
            node.SYNC.enable = true;
            node.SYNC.cyclePeriod = 100;
            node.SYNC.overflow = 255;
            node.init();

            node.channel.addListener('onMessage', (msg) => {
                if(msg.data[0] > 10) {
                    node.SYNC.stop();
                    done();
                }
            });
            node.SYNC.start();
        });
    });

    describe('Consumer', function() {
        it('should emit on consuming a sync object', function(done) {
            node.SYNC.enable = true;
            node.SYNC.cobId = 0x80;
            node.init();

            node.on('sync', () => { done(); });
            node.SYNC.write();
        });
    });
});
