const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const Protocol = require('../../source/protocol/protocol');
const { DataType, Eds } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Protocol', function () {
    it('should add Eds callbacks', function (done) {
        const eds = new Eds();
        expect(eds.listenerCount('newEntry')).to.equal(0);

        const protocol = new Protocol(eds);
        protocol.addEdsCallback('newEntry', () => done());
        expect(eds.listenerCount('newEntry')).to.equal(1);

        eds.addEntry(0x2000, {
            parameterName: 'DataObject',
            dataType: DataType.UNSIGNED8,
        });
    });

    it('should remove Eds callbacks', function (done) {
        const eds = new Eds();
        expect(eds.listenerCount('newEntry')).to.equal(0);

        const callback = () => {
            done(new Error('should not be called'));
        };

        const protocol = new Protocol(eds);
        protocol.addEdsCallback('newEntry', callback);
        expect(eds.listenerCount('newEntry')).to.equal(1);

        protocol.removeEdsCallback('newEntry');
        expect(eds.listenerCount('newEntry')).to.equal(0);

        // Should not invoke callback
        eds.addEntry(0x2000, {
            parameterName: 'DataObject',
            dataType: DataType.UNSIGNED8,
        });

        done();
    });

    it('should add DataObject callbacks', function (done) {
        const eds = new Eds();
        const protocol = new Protocol(eds);

        const obj2000 = eds.addEntry(0x2000, {
            parameterName: 'DataObject',
            dataType: DataType.UNSIGNED8,
        });

        expect(obj2000.listenerCount('update')).to.equal(0);
        protocol.addUpdateCallback(obj2000, () => done());
        expect(obj2000.listenerCount('update')).to.equal(1);

        obj2000.value++;
    });

    it('should remove DataObject callbacks', function (done) {
        const eds = new Eds();
        const protocol = new Protocol(eds);

        const obj2000 = eds.addEntry(0x2000, {
            parameterName: 'DataObject',
            dataType: DataType.UNSIGNED8,
        });

        const callback = () => {
            done(new Error('should not be called'));
        };

        expect(obj2000.listenerCount('update')).to.equal(0);
        protocol.addUpdateCallback(obj2000, callback);
        expect(obj2000.listenerCount('update')).to.equal(1);
        protocol.removeUpdateCallback(obj2000);
        expect(obj2000.listenerCount('update')).to.equal(0);

        obj2000.value++;
        done();
    });

    it('should throw on repeated add', function (done) {
        const eds = new Eds();
        const protocol = new Protocol(eds);

        const obj2000 = eds.addEntry(0x2000, {
            parameterName: 'DataObject',
            dataType: DataType.UNSIGNED8,
        });

        protocol.addEdsCallback('newEntry', () => { });
        expect(() => protocol.addEdsCallback('newEntry', () => { })).to.throw();

        protocol.addUpdateCallback(obj2000, () => { });
        expect(() => protocol.addUpdateCallback(obj2000, () => { })).to.throw();

        done();
    });
});
