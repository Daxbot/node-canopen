const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const {Device} = require('../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Device', function() {
    it('should be constructable', function() {
        new Device({ id: 0xA, loopback: true });
    });

    it('should require channel if not in loopback', function() {
        expect(() => {
            new Device({ channel: null, id: 0xA});
        }).to.throw(TypeError);
    });

    it('should require id be in range 1-127', function() {
        expect(() => {
            new Device({id: null, loopback: true });
        }).to.throw(RangeError);
        expect(() => {
            new Device({id: 0, loopback: true });
        }).to.throw(RangeError);
        expect(() => {
            new Device({id: 128, loopback: true });
        }).to.throw(RangeError);
        expect(() => {
            new Device({id: 0xFFFF, loopback: true });
        }).to.throw(RangeError);
    });
});
