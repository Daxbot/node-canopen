const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const {EDS, Device} = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('SYNC', function() {
    let node = null;

    beforeEach(function() {
        node = new Device({ id: 0xA, loopback: true });

        /* COB-ID SYNC. */
        node.EDS.addEntry(0x1005, {
            ParameterName:      'COB-ID SYNC',
            ObjectType:         EDS.objectTypes.VAR,
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
            DefaultValue:       0x80,
        });

        /* Communication cycle period. */
        node.EDS.addEntry(0x1006, {
            ParameterName:      'Communication cycle period',
            ObjectType:         EDS.objectTypes.VAR,
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
            DefaultValue:       1000,
        });
    });

    afterEach(function() {
        delete node;
    });

    it('should require 0x1005', function() {
        node.EDS.removeEntry(0x1005);
        expect(() => { node.SYNC.start(); }).to.throw(ReferenceError);
    });

    it('should require 0x1006', function() {
        node.EDS.removeEntry(0x1006);
        expect(() => { node.SYNC.start(); }).to.throw(ReferenceError);
    });

    it('should produce a sync object', function(done) {
        node.init();
        node.channel.addListener('onMessage', () => { done(); });
        node.SYNC.write();
    });

    it('should emit on consuming a sync object', function(done) {
        node.init();
        node.on('sync', () => { done(); });
        node.SYNC.write();
    });
});
