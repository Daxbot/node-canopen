const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { calculateCrc } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('CRC', function() {
    it('should calculate correct check value', function() {
        const data = Buffer.from('123456789');
        expect(calculateCrc(data)).to.equal(0x31C3);
    });
});
