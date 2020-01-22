const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const {EDS, Device} = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('TIME', function() {
    let node = null;

    beforeEach(function() {
        node = new Device({ id: 0xA, loopback: true });
        node.EDS.dataObjects[0x1012] = new EDS.DataObject({
            ParameterName:      'COB-ID TIME',
            ObjectType:         EDS.objectTypes.VAR,
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
            DefaultValue:       0x80,
        });
    });

    afterEach(function() {
        delete node;
    });

    it('should require 0x1012', function() {
        delete node.dataObjects[0x1012];
        expect(() => { node.TIME.write(); }).to.throw(ReferenceError);
    });

    it('should produce a time object', function(done) {
        node.init();
        node.channel.addListener('onMessage', () => { done(); });
        node.TIME.write();
    });

    it('should emit on consuming a time object', function(done) {
        node.init();
        node.on('time', () => { done(); });
        node.TIME.write();
    });
});
