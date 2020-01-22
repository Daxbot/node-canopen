const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const {EDS, Device} = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('EMCY', function() {
    let node = null;

    beforeEach(function() {
        node = new Device({ id: 0xA, loopback: true });
        node.EDS.dataObjects[0x1003] = new EDS.DataObject({
            ParameterName:      'Pre-defined error field',
            ObjectType:         EDS.objectTypes.ARRAY,
            SubNumber:          1,
        });
        node.EDS.dataObjects[0x1003][1] = new EDS.DataObject({
            ParameterName:      'Standard error field',
            ObjectType:         EDS.objectTypes.VAR,
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
        });
        node.EDS.dataObjects[0x1014] = new EDS.DataObject({
            ParameterName:      'COB-ID EMCY',
            ObjectType:         EDS.objectTypes.VAR,
            DataType:           EDS.dataTypes.UNSIGNED32,
            AccessType:         EDS.accessTypes.READ_WRITE,
            DefaultValue:       0x80,
        });
    });

    afterEach(function() {
        delete node;
    });

    it('should require 0x1001', function() {
        delete node.dataObjects[0x1001];
        expect(() => { node.init(); }).to.throw(ReferenceError);
    });

    it('should require 0x1014', function() {
        delete node.dataObjects[0x1014];
        expect(() => { node.EMCY.write(0x1000); }).to.throw(ReferenceError);
    });

    it('should produce an emergency object', function(done) {
        node.init();
        node.channel.addListener('onMessage', () => { done(); });
        node.EMCY.write(0x1000);
    });

    it('should emit on consuming an emergency object', function(done) {
        node.init();
        node.on('emergency', () => { done(); });
        node.EMCY.write(0x1000);
    });

    it('should track error history', function() {
        node.init();
        node.EMCY.write(0x1234).then(() => {
            expect(node.dataObjects[0x1003][1].value).to.equal(0x1234);
        });
    });
});
