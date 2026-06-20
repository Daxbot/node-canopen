const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Device, EdsError } = require('../../index');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Emcy', function () {
    it('should emit start once', function (done) {
        const device = new Device({ id: 0xA});

        device.emcy.on('start', () => done());
        device.emcy.start();
        device.emcy.start();
    });

    it('should emit stop once', function (done) {
        const device = new Device({ id: 0xA});
        device.emcy.start();

        device.emcy.on('stop', () => done());
        device.emcy.stop();
        device.emcy.stop();
    });

    it('should produce an emergency object', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.od.setEmcyCobId(0x8A);
        device.od.addEmcyConsumer(0x8A);
        device.emcy.start();

        const code = 0x1000;
        device.emcy.addListener('emergency', ({ em }) => {
            expect(em.code).to.equal(code);
            device.emcy.stop();
            done();
        });

        device.emcy.write(code);
    });

    it('should inhibit send', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.od.setEmcyCobId(0x8A);
        device.od.setEmcyInhibitTime(1000); // 0.1 seconds
        device.od.addEmcyConsumer(0x8A);
        device.emcy.start();

        const code = 0x1000;

        let sendCount = 0;
        let timeoutFlag = false;
        setTimeout(() => timeoutFlag = true, 50);

        device.emcy.addListener('emergency', ({ em }) => {
            expect(em.code).to.equal(code);
            if(++sendCount == 2) {
                device.emcy.stop();

                if(timeoutFlag)
                    done();
                else
                    done(new Error('too fast!'));
            }
        });

        device.emcy.write(code);
        device.emcy.write(code);
    });

    it('should throw if cobId is 0', function () {
        const device = new Device({ id: 0xA, loopback: true });
        device.emcy.start();

        expect(() => device.emcy.write(0x1000)).to.throw(EdsError);
    });

    it('should listen to ObjectDictionary#newEntry', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.emcy.start();

        expect(device.od.getEmcyCobId()).to.be.null;
        expect(device.od.getEmcyConsumers()).to.be.an('array').that.is.empty;

        device.emcy.addListener('emergency', () => done());

        device.od.setEmcyCobId(0x8A);
        device.od.addEmcyConsumer(0x8A);
        device.emcy.write(0x1000);
    });

    it('should listen to ObjectDictionary#removeEntry', function () {
        const device = new Device({ id: 0xA, loopback: true });
        device.od.setEmcyCobId(0x8A);
        device.od.addEmcyConsumer(0x8A);
        device.emcy.start();

        device.od.removeEntry(0x1014);
        device.od.removeEntry(0x1028);

        expect(device.od.getEmcyCobId()).to.be.null;
        expect(device.od.getEmcyConsumers()).to.be.an('array').that.is.empty;
    });

    it('should listen to DataObject#update', function (done) {
        const device = new Device({ id: 0xA, loopback: true });
        device.emcy.start();

        device.emcy.once('emergency', ({ cobId }) => {
            if (cobId === 0x8A) {
                device.emcy.once('emergency', ({ cobId }) => {
                    if(cobId === 0x8B)
                        done();
                });
            }
        });

        device.od.setEmcyCobId(0x8A);
        device.od.addEmcyConsumer(0x8A);
        device.emcy.write(0x1000);

        device.od.setEmcyCobId(0x8B);
        device.od.addEmcyConsumer(0x8B);
        device.emcy.write(0x1000);
    });
});
