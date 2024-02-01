const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { DataType, AccessType, ObjectType, EdsError, Eds } = require('../index');
const fs = require('fs');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Eds', function () {
    describe('File IO', function () {
        let testFile;

        before(function () {
            testFile = `test${Date.now()}.EDS`;
            if (fs.existsSync(testFile)) {
                let base = testFile;
                let count = 1;
                do {
                    testFile = base + '.' + count.toString();
                    count += 1;
                }
                while (fs.existsSync(testFile));
            }
        });

        after(function () {
            // Delete the generated EDS file.
            if (fs.existsSync(testFile))
                fs.unlinkSync(testFile);
        });

        it('should save to and load from a file', function () {
            const date = new Date(0);
            const saveFile = new Eds({
                fileName: testFile,
                creationDate: date,
                baudRates: [500000],
            });

            saveFile.save(testFile);

            const loadFile = Eds.fromFile(testFile);
            return Promise.all([
                expect(loadFile.fileName).to.equal(testFile),
                expect(loadFile.baudRates).to.include(500000),
                expect(loadFile.creationDate.getTime())
                    .to.equal(date.getTime()),
            ]);
        });

        it('should properly convert a boolean values', function () {
            const eds = new Eds();
            expect(eds.lssSupported).to.equal(false);
            eds.lssSupported = true;
            expect(eds.lssSupported).to.equal(true);
        });
    });

    describe('Add entry', function () {
        it('should require parameterName', function () {
            const eds = new Eds();
            return expect(() => {
                eds.addEntry(0x2000, {
                    dataType: DataType.UNSIGNED8,
                    accessType: AccessType.READ_WRITE,
                });
            }).to.throw(EdsError);
        });

        it('should not allow an unknown objectType', function () {
            const eds = new Eds();
            return expect(() => {
                eds.addEntry(0x2000, {
                    parameterName: 'DataObject',
                    objectType: -1,
                    dataType: DataType.UNSIGNED8,
                    accessType: AccessType.READ_WRITE,
                });
            }).to.throw(EdsError);
        });

        describe('ObjectType is DEFTYPE or VAR', function () {
            it('should require dataType', function () {
                const eds = new Eds();
                return expect(() => {
                    eds.addEntry(0x2000, {
                        parameterName: 'VAR',
                        objectType: ObjectType.VAR,
                        accessType: AccessType.READ_WRITE,
                    });
                }).to.throw(EdsError);
            });
            it('should not allow compactSubObj', function () {
                const eds = new Eds();
                return expect(() => {
                    eds.addEntry(0x2000, {
                        parameterName: 'VAR',
                        objectType: ObjectType.VAR,
                        dataType: DataType.UNSIGNED8,
                        accessType: AccessType.READ_WRITE,
                        compactSubObj: true, // Not allowed
                    }).to.throw(EdsError);
                });
            });
            it('should emit on value update', function (done) {
                const eds = new Eds();
                const obj = eds.addEntry(0x2000, {
                    parameterName: 'VAR',
                    objectType: ObjectType.VAR,
                    dataType: DataType.UNSIGNED8,
                    accessType: AccessType.READ_WRITE,
                });

                obj.addListener('update', () => {
                    done();
                });
                obj.value = 1;
            });
        });

        describe('ObjectType is DEFSTRUCT, ARRAY, or RECORD', function () {
            describe('compactSubObj is false', function () {
                it('should not allow dataType', function () {
                    const eds = new Eds();
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            parameterName: 'ARRAY',
                            objectType: ObjectType.ARRAY,
                            dataType: DataType.UNSIGNED8,
                        }).to.throw(EdsError);
                    });
                });
                it('should not allow defaultValue', function () {
                    const eds = new Eds();
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            parameterName: 'ARRAY',
                            objectType: ObjectType.ARRAY,
                            defaultValue: 0,
                        }).to.throw(EdsError);
                    });
                });
                it('should not allow pdoMapping', function () {
                    const eds = new Eds();
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            parameterName: 'ARRAY',
                            objectType: ObjectType.ARRAY,
                            pdoMapping: false,
                        }).to.throw(EdsError);
                    });
                });
                it('should not allow lowLimit', function () {
                    const eds = new Eds();
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            parameterName: 'ARRAY',
                            objectType: ObjectType.ARRAY,
                            lowLimit: null,
                        }).to.throw(EdsError);
                    });
                });
                it('should not allow highLimit', function () {
                    const eds = new Eds();
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            parameterName: 'ARRAY',
                            objectType: ObjectType.ARRAY,
                            highLimit: null,
                        }).to.throw(EdsError);
                    });
                });
            });
            describe('CompactSubObj is true', function () {
                it('should require dataType', function () {
                    const eds = new Eds();
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            parameterName: 'ARRAY',
                            objectType: ObjectType.ARRAY,
                            accessType: AccessType.READ_WRITE,
                            compactSubObj: true,
                        });
                    }).to.throw(EdsError);
                });
            });
        });

        describe('ObjectType is DOMAIN', function () {
            it('should not allow pdoMapping', function () {
                const eds = new Eds();
                return expect(() => {
                    eds.addEntry(0x2000, {
                        parameterName: 'ARRAY',
                        objectType: ObjectType.ARRAY,
                        pdoMapping: false,
                    }).to.throw(EdsError);
                });
            });
            it('should not allow lowLimit', function () {
                const eds = new Eds();
                return expect(() => {
                    eds.addEntry(0x2000, {
                        parameterName: 'DOMAIN',
                        objectType: ObjectType.DOMAIN,
                        lowLimit: null,
                    }).to.throw(EdsError);
                });
            });
            it('should not allow highLimit', function () {
                const eds = new Eds();
                return expect(() => {
                    eds.addEntry(0x2000, {
                        parameterName: 'DOMAIN',
                        objectType: ObjectType.DOMAIN,
                        highLimit: null,
                    }).to.throw(EdsError);
                });
            });
            it('should not allow compactSubObj', function () {
                const eds = new Eds();
                return expect(() => {
                    eds.addEntry(0x2000, {
                        parameterName: 'DOMAIN',
                        objectType: ObjectType.DOMAIN,
                        compactSubObj: false,
                    }).to.throw(EdsError);
                });
            });
        });
    });

    describe('Remove entry', function () {
        it('should remove an entry', function () {
            const eds = new Eds();
            eds.addEntry(0x2000, {
                parameterName: 'Test entry',
                dataType: DataType.UNSIGNED8,
            });

            eds.removeEntry(0x2000);
            return expect(eds.getEntry(0x2000)).to.equal(undefined);
        });

        it('should remove exactly one entry from the name lookup', function () {
            const eds = new Eds();
            eds.addEntry(0x2000, {
                parameterName: 'Test entry',
                objectType: ObjectType.VAR,
                dataType: DataType.UNSIGNED8,
                accessType: AccessType.READ_WRITE,
            });
            eds.addEntry(0x2001, {
                parameterName: 'Test entry',
                objectType: ObjectType.VAR,
                dataType: DataType.UNSIGNED8,
                accessType: AccessType.READ_WRITE,
            });
            eds.addEntry(0x2002, {
                parameterName: 'Test entry',
                objectType: ObjectType.VAR,
                dataType: DataType.UNSIGNED8,
                accessType: AccessType.READ_WRITE,
            });

            expect(eds.findEntry('Test entry').length).to.equal(3);
            eds.removeEntry(0x2000);

            const entries = eds.findEntry('Test entry');
            return Promise.all([
                expect(entries.length).to.equal(2),
                expect(entries[0].index).to.equal(0x2001),
                expect(entries[1].index).to.equal(0x2002),
            ]);
        });

        it('should throw if an entry does not exist', function () {
            const eds = new Eds();
            expect(() => eds.removeEntry(0x2003)).to.throw(EdsError);
        });
    });

    describe('Sub-entries', function () {
        it('should create sub-entry 0', function () {
            const eds = new Eds();
            const entry = eds.addEntry(0x2000, {
                parameterName: 'Test entry',
                objectType: ObjectType.ARRAY,
            });

            expect(entry[0]).to.exist;
        });

        it('should add sub-entires', function () {
            const eds = new Eds();
            const entry = eds.addEntry(0x2000, {
                parameterName: 'Test entry',
                objectType: ObjectType.ARRAY,
            });

            expect(entry.subNumber).to.equal(1);
            expect(entry[0].value).to.equal(0);

            eds.addSubEntry(0x2000, 1, {
                parameterName: 'Sub-entry 1',
                objectType: ObjectType.VAR,
                dataType: DataType.UNSIGNED8,
                accessType: AccessType.READ_WRITE,
            });

            expect(entry.subNumber).to.equal(2);
            expect(entry[0].value).to.equal(1);

            eds.addSubEntry(0x2000, 10, {
                parameterName: 'Sub-entry 10',
                objectType: ObjectType.VAR,
                dataType: DataType.UNSIGNED8,
                accessType: AccessType.READ_WRITE,
            });

            expect(entry.subNumber).to.equal(3);
            expect(entry[0].value).to.equal(10);
        });

        it('should remove sub-entries', function () {
            const eds = new Eds();
            const entry = eds.addEntry(0x2000, {
                parameterName: 'Test entry',
                objectType: ObjectType.ARRAY,
            });

            eds.addSubEntry(0x2000, 1, {
                parameterName: 'Sub-entry 1',
                objectType: ObjectType.VAR,
                dataType: DataType.UNSIGNED8,
                accessType: AccessType.READ_WRITE,
            });

            eds.addSubEntry(0x2000, 10, {
                parameterName: 'Sub-entry 10',
                objectType: ObjectType.VAR,
                dataType: DataType.UNSIGNED8,
                accessType: AccessType.READ_WRITE,
            });

            eds.removeSubEntry(0x2000, 10);
            expect(entry.subNumber).to.equal(2);
            expect(entry[0].value).to.equal(1);

            eds.removeSubEntry(0x2000, 1);
            expect(entry.subNumber).to.equal(1);
            expect(entry[0].value).to.equal(0);
        });

        it('should not remove sub-entry 0', function () {
            const eds = new Eds();
            expect(() => eds.removeSubEntry(0x2000, 0)).to.throw(EdsError);
        });
    });

    describe('Scaling', function () {
        it('should scale numeric values', function () {
            const eds = new Eds();
            const obj = eds.addEntry(0x2000, {
                parameterName: 'VAR',
                objectType: ObjectType.VAR,
                dataType: DataType.UNSIGNED8,
                accessType: AccessType.READ_WRITE,
                defaultValue: 2,
            });

            // 2 * 10 = 20
            obj.scaleFactor = 10;
            expect(obj.value).to.equal(20);

            // 2 * 0.5 = 1
            obj.scaleFactor = 0.5;
            expect(obj.value).to.equal(1);

            // 5 / 0.5 = 10
            obj.value = 5;
            obj.scaleFactor = 1;
            expect(obj.value).to.equal(10);
        });
    });

    describe('Accessors', function() {
        it('should get 0x1002', function () {
            const eds = new Eds();
            eds.setStatusRegister(100);
            expect(eds.getStatusRegister()).to.equal(100);
        });

        it('should get 0x1001', function () {
            const eds = new Eds();

            eds.setErrorRegister({ generic: true });
            expect(eds.getErrorRegister()).to.equal(1);

            eds.setErrorRegister({ current: true });
            expect(eds.getErrorRegister()).to.equal(3);

            eds.setErrorRegister({ voltage: true });
            expect(eds.getErrorRegister()).to.equal(7);

            eds.setErrorRegister({ temperature: true });
            expect(eds.getErrorRegister()).to.equal(15);

            eds.setErrorRegister({ generic: false, communication: true });
            expect(eds.getErrorRegister()).to.equal(30);

            eds.setErrorRegister({ current: false, device: true });
            expect(eds.getErrorRegister()).to.equal(60);

            eds.setErrorRegister({ voltage: false, manufacturer: true });
            expect(eds.getErrorRegister()).to.equal(184);

            eds.setErrorRegister({ temperature: false });
            expect(eds.getErrorRegister()).to.equal(176);
        });

        it('should get 0x1003', function () {
            const eds = new Eds();
            eds.setErrorHistoryLength(2);

            eds.pushErrorHistory(0x1000);
            expect(eds.getErrorHistory()[0].code).to.equal(0x1000);
            expect(eds.getErrorHistory()[0].info).to.equal(0);

            eds.pushErrorHistory(0x2000, 'CO');
            expect(eds.getErrorHistory()[0].code).to.equal(0x2000);
            expect(eds.getErrorHistory()[0].info).to.equal(0x4f43);

            expect(eds.getErrorHistory()[1].code).to.equal(0x1000);
            expect(eds.getErrorHistory()[1].info).to.equal(0);

            eds.pushErrorHistory(0x3000, 7);
            expect(eds.getErrorHistory()[0].code).to.equal(0x3000);
            expect(eds.getErrorHistory()[0].info).to.equal(7);

            expect(eds.getErrorHistory()[1].code).to.equal(0x2000);
            expect(eds.getErrorHistory()[1].info).to.equal(0x4f43);
        });

        it('should get 0x1005', function () {
            const eds = new Eds();
            expect(eds.getSyncCobId()).to.be.null;
            expect(eds.getSyncGenerationEnable()).to.be.false;

            eds.setSyncCobId(0x80);
            eds.setSyncGenerationEnable(true);

            expect(eds.getSyncCobId()).to.equal(0x80);
            expect(eds.getSyncGenerationEnable()).to.be.true;
        });

        it('should get 0x1006', function () {
            const eds = new Eds();
            expect(eds.getSyncCyclePeriod()).to.be.null;

            eds.setSyncCyclePeriod(333);
            expect(eds.getSyncCyclePeriod()).to.equal(333);
        });

        it('should get 0x1008', function () {
            const eds = new Eds();
            eds.setDeviceName('node-canopen');
            expect(eds.getDeviceName()).to.equal('node-canopen');
        });

        it('should get 0x1009', function () {
            const eds = new Eds();
            eds.setHardwareVersion('A');
            expect(eds.getHardwareVersion()).to.equal('A');
        });

        it('should get 0x1019', function () {
            const eds = new Eds();
            expect(eds.getSyncOverflow()).to.be.null;

            eds.setSyncOverflow(10);
            expect(eds.getSyncOverflow()).to.equal(10);
        });

        it('should get 0x1012', function () {
            const eds = new Eds();
            expect(eds.getTimeCobId()).to.be.null;
            expect(eds.getTimeProducerEnable()).to.be.false;
            expect(eds.getTimeConsumerEnable()).to.be.false;

            eds.setTimeCobId(0x100);
            expect(eds.getTimeCobId()).to.equal(0x100);

            eds.setTimeProducerEnable(true);
            expect(eds.getTimeProducerEnable()).to.be.true;
            expect(eds.getTimeConsumerEnable()).to.be.false;
            eds.setTimeProducerEnable(false);

            eds.setTimeConsumerEnable(true);
            expect(eds.getTimeProducerEnable()).to.be.false;
            expect(eds.getTimeConsumerEnable()).to.be.true;
            eds.setTimeConsumerEnable(false);

            expect(eds.getTimeProducerEnable()).to.be.false;
            expect(eds.getTimeConsumerEnable()).to.be.false;
        });

        it('should get 0x100A', function () {
            const eds = new Eds();
            eds.setSoftwareVersion('1.0');
            expect(eds.getSoftwareVersion()).to.equal('1.0');
        });

        it('should get 0x1014', function () {
            const eds = new Eds();
            expect(eds.getEmcyCobId()).to.be.null;
            expect(eds.getEmcyValid()).to.be.false;

            eds.setEmcyCobId(0x8A);
            expect(eds.getEmcyCobId()).to.equal(0x8A);
            expect(eds.getEmcyValid()).to.be.true;
        });

        it('should get 0x1015', function () {
            const eds = new Eds();
            expect(eds.getEmcyInhibitTime()).to.be.null;

            eds.setEmcyInhibitTime(100);
            expect(eds.getEmcyInhibitTime()).to.equal(100);
        });

        it('should get 0x1016', function () {
            const eds = new Eds();

            eds.addHeartbeatConsumer(0xB, 100);

            const consumers = eds.getHeartbeatConsumers();
            expect(consumers[0].deviceId).to.equal(0xB);
            expect(consumers[0].heartbeatTime).to.equal(100);

            eds.removeHeartbeatConsumer(0xB);
            expect(eds.getHeartbeatConsumers()).to.be.an('array').that.is.empty;
        });

        it('should get 0x1017', function () {
            const eds = new Eds();
            expect(eds.getHeartbeatProducerTime()).to.be.null;

            eds.setHeartbeatProducerTime(500);
            expect(eds.getHeartbeatProducerTime()).to.equal(500);
        });

        it('should get 0x1018', function () {
            const eds = new Eds();
            eds.setIdentity({
                vendorId: 1,
                productCode: 2,
                revisionNumber: 3,
                serialNumber: 4,
            });

            const identity = eds.getIdentity();
            expect(identity.vendorId).to.equal(1);
            expect(identity.productCode).to.equal(2);
            expect(identity.revisionNumber).to.equal(3);
            expect(identity.serialNumber).to.equal(4);
        });

        it('should get 0x1028', function () {
            const eds = new Eds();

            eds.addEmcyConsumer(0x3);
            expect(eds.getEmcyConsumers()[0]).to.equal(0x3);

            eds.removeEmcyConsumer(0x3);
            expect(eds.getEmcyConsumers()).to.be.an('array').that.is.empty;
        });
    });
});