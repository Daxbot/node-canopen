const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { DataType, typeToRaw } = require('../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Types', function() {
    it('should reference time from January 1, 1984', function() {
        const date = new Date('1984-01-01');
        const raw = typeToRaw(date, DataType.TIME_OF_DAY);
        expect(raw.compare(Buffer.alloc(6))).to.be.equal(0);
    });
});
