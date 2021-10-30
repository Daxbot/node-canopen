const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { DataType, AccessType, ObjectType, typeToRaw, EdsError, Eds} = require('../index');
const fs = require('fs');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Eds', function() {
    it('should be constructable', function() {
        new Eds();
    });

    describe('File IO', function() {
        let testFile;

        before(function() {
            testFile = `test${Date.now()}.EDS`;
            if(fs.existsSync(testFile)) {
                let base = testFile;
                let count = 1;
                do {
                    testFile = base + '.' + count.toString();
                    count += 1;
                }
                while(fs.existsSync(testFile));
            }
        })

        after(function() {
            // Delete the generated EDS file.
            if(fs.existsSync(testFile))
                fs.unlinkSync(testFile);
        });

        it('should save to and load from a file', function() {
            const saveFile = new Eds();
            const loadFile = new Eds();
            const date = new Date(0);

            saveFile.fileName = 'Test file';
            saveFile.creationDate = date;
            saveFile.baudRates = [500000];
            saveFile.save(testFile);

            loadFile.load(testFile);
            return Promise.all([
                expect(loadFile.fileName).to.equal('Test file'),
                expect(loadFile.baudRates).to.include(500000),
                expect(loadFile.creationDate.getTime()).to.equal(date.getTime()),
            ])
        });

        it('should create a raw entry if there is a defaultValue', function() {
            const loadFile = new Eds();
            loadFile.load('test/sample.eds');

            const entry = loadFile.getSubEntry('DeviceInfo', 0)
            expect(entry.raw).to.not.be.undefined
        });

        it('should properly convert a boolean values', function() {
            const eds = new Eds();
            expect(eds.simpleBootUpMaster).to.equal(false);
            expect(eds.simpleBootUpSlave).to.equal(false);
            expect(eds.dynamicChannelsSupported).to.equal(false);
            expect(eds.groupMessaging).to.equal(false);
            expect(eds.lssSupported).to.equal(false);

            eds.simpleBootUpMaster = true;
            expect(eds.simpleBootUpMaster).to.equal(true);

            eds.simpleBootUpSlave = true;
            expect(eds.simpleBootUpSlave).to.equal(true);

            eds.dynamicChannelsSupported = true;
            expect(eds.dynamicChannelsSupported).to.equal(true);

            eds.groupMessaging = true;
            expect(eds.groupMessaging).to.equal(true);

            eds.lssSupported = true;
            expect(eds.lssSupported).to.equal(true);
        });
    });

    describe('Data types', function() {
        it('should reference time from January 1, 1984', function() {
            const date = new Date('1984-01-01');
            const raw = typeToRaw(date, DataType.TIME_OF_DAY);
            expect(raw.compare(Buffer.alloc(6))).to.be.equal(0);
        });
    });

    describe('Add entry', function() {
        let eds;

        beforeEach(function() {
            eds = new Eds();
        });

        it('should require parameterName', function() {
            return expect(() => {
                eds.addEntry(0x2000, {
                    dataType:       DataType.UNSIGNED8,
                    accessType:     AccessType.READ_WRITE,
                });
            }).to.throw(EdsError);
        });

        it('should not allow an unknown objectType', function() {
            return expect(() => {
                eds.addEntry(0x2000, {
                    parameterName:  'DataObject',
                    objectType:     -1,
                    dataType:       DataType.UNSIGNED8,
                    accessType:     AccessType.READ_WRITE,
                });
            }).to.throw(EdsError);
        });

        describe('ObjectType is DEFTYPE or VAR', function() {
            it('should require dataType', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        parameterName:  'VAR',
                        objectType:     ObjectType.VAR,
                        accessType:     AccessType.READ_WRITE,
                    });
                }).to.throw(EdsError);
            });
            it('should require accessType', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        parameterName:  'VAR',
                        objectType:     ObjectType.VAR,
                        dataType:       DataType.UNSIGNED8,
                    });
                }).to.throw(EdsError);
            });
            it('should not allow subNumber', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        parameterName:  'VAR',
                        objectType:     ObjectType.VAR,
                        dataType:       DataType.UNSIGNED8,
                        accessType:     AccessType.READ_WRITE,
                        subNumber:      1,
                    }).to.throw(EdsError);
                })
            });
            it('should not allow compactSubObj', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        parameterName:  'VAR',
                        objectType:     ObjectType.VAR,
                        dataType:       DataType.UNSIGNED8,
                        accessType:     AccessType.READ_WRITE,
                        compactSubObj:  true, // Not allowed
                    }).to.throw(EdsError);
                })
            });
            it('should emit on value update', function(done) {
                const obj = eds.addEntry(0x2000, {
                    parameterName:  'VAR',
                    objectType:     ObjectType.VAR,
                    dataType:       DataType.UNSIGNED8,
                    accessType:     AccessType.READ_WRITE,
                });

                obj.addListener('update', () => {
                    done();
                });
                obj.value = 1;
            });
        });

        describe('ObjectType is DEFSTRUCT, ARRAY, or RECORD', function() {
            describe('compactSubObj is false', function() {
                it('should not allow dataType', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            parameterName:  'ARRAY',
                            objectType:     ObjectType.ARRAY,
                            dataType:       DataType.UNSIGNED8,
                            subNumber:      1,
                        }).to.throw(EdsError);
                    })
                });
                it('should not allow accessType', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            parameterName:  'ARRAY',
                            objectType:     ObjectType.ARRAY,
                            accessType:     AccessType.READ_WRITE,
                            subNumber:      1,
                        }).to.throw(EdsError);
                    })
                });
                it('should not allow defaultValue', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            parameterName:  'ARRAY',
                            objectType:     ObjectType.ARRAY,
                            defaultValue:   0,
                            subNumber:      1,
                        }).to.throw(EdsError);
                    })
                });
                it('should not allow pdoMapping', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            parameterName:  'ARRAY',
                            objectType:     ObjectType.ARRAY,
                            pdoMapping:     false,
                            subNumber:      1,
                        }).to.throw(EdsError);
                    })
                });
                it('should not allow lowLimit', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            parameterName:  'ARRAY',
                            objectType:     ObjectType.ARRAY,
                            lowLimit:       null,
                            subNumber:      1,
                        }).to.throw(EdsError);
                    })
                });
                it('should not allow highLimit', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            parameterName:  'ARRAY',
                            objectType:     ObjectType.ARRAY,
                            highLimit:      null,
                            subNumber:      1,
                        }).to.throw(EdsError);
                    })
                });
            });
            describe('CompactSubObj is true', function() {
                it('should require dataType', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            parameterName:  'ARRAY',
                            objectType:     ObjectType.ARRAY,
                            accessType:     AccessType.READ_WRITE,
                            compactSubObj:  true,
                        });
                    }).to.throw(EdsError);
                });
                it('should require accessType', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            parameterName:  'ARRAY',
                            objectType:     ObjectType.ARRAY,
                            dataType:       DataType.UNSIGNED8,
                            compactSubObj:  true,
                        });
                    }).to.throw(EdsError);
                });
                it('should not allow subNumber', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            parameterName:  'ARRAY',
                            objectType:     ObjectType.ARRAY,
                            dataType:       DataType.UNSIGNED8,
                            accessType:     AccessType.READ_WRITE,
                            subNumber:      1,
                            compactSubObj:  true,
                        }).to.throw(EdsError);
                    });
                });
            });
        });

        describe('ObjectType is DOMAIN', function() {
            it('should not allow pdoMapping', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        parameterName:  'ARRAY',
                        objectType:     ObjectType.ARRAY,
                        pdoMapping:     false,
                    }).to.throw(EdsError);
                })
            });
            it('should not allow lowLimit', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        parameterName:  'DOMAIN',
                        objectType:     ObjectType.DOMAIN,
                        lowLimit:       null,
                    }).to.throw(EdsError);
                })
            });
            it('should not allow highLimit', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        parameterName:  'DOMAIN',
                        objectType:     ObjectType.DOMAIN,
                        highLimit:      null,
                    }).to.throw(EdsError);
                })
            });
            it('should not allow subNumber', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        parameterName:  'DOMAIN',
                        objectType:     ObjectType.DOMAIN,
                        subNumber:      1,
                    }).to.throw(EdsError);
                })
            });
            it('should not allow compactSubObj', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        parameterName:  'DOMAIN',
                        objectType:     ObjectType.DOMAIN,
                        compactSubObj:  false,
                    }).to.throw(EdsError);
                })
            });
        });
    });

    describe('Remove entry', function() {
        let eds;

        beforeEach(function() {
            eds = new Eds();
            eds.addEntry(0x2000, {
                parameterName:  'Test entry',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED8,
                accessType:     AccessType.READ_WRITE,
            });
            eds.addEntry(0x2001, {
                parameterName:  'Test entry',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED8,
                accessType:     AccessType.READ_WRITE,
            });
            eds.addEntry(0x2002, {
                parameterName:  'Test entry',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED8,
                accessType:     AccessType.READ_WRITE,
            });
        });

        it('should remove an entry', function() {
            eds.removeEntry(0x2000);
            return expect(eds.getEntry(0x2000)).to.equal(undefined);
        });

        it('should remove exactly one entry from the name lookup', function() {
            expect(eds.getEntry('Test entry').length).to.equal(3);
            eds.removeEntry(0x2000);

            const entries = eds.getEntry('Test entry');
            return Promise.all([
                expect(entries.length).to.equal(2),
                expect(entries[0].index).to.equal(0x2001),
                expect(entries[1].index).to.equal(0x2002),
            ]);
        });

        it('should throw if an entry does not exist', function() {
            expect(() => {
                eds.removeEntry(0x2003);
            }).to.throw();
        });
    });

    describe('Sub-entries', function() {
        let eds;

        before(function() {
            eds = new Eds();
        });

        it('should create sub-entry 0', function() {
            const entry = eds.addEntry(0x2000, {
                parameterName:  'Test entry',
                objectType:     ObjectType.ARRAY,
                subNumber:      1
            });

            expect(entry[0]).to.exist;
        });

        it('should add sub-entires', function() {
            const entry = eds.getEntry(0x2000);

            expect(entry.subNumber).to.equal(1);
            expect(entry[0].value).to.equal(0);

            eds.addSubEntry(0x2000, 1, {
                parameterName:  'Sub-entry 1',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED8,
                accessType:     AccessType.READ_WRITE,
            });

            expect(entry.subNumber).to.equal(2);
            expect(entry[0].value).to.equal(1);

            eds.addSubEntry(0x2000, 10, {
                parameterName:  'Sub-entry 10',
                objectType:     ObjectType.VAR,
                dataType:       DataType.UNSIGNED8,
                accessType:     AccessType.READ_WRITE,
            });

            expect(entry.subNumber).to.equal(3);
            expect(entry[0].value).to.equal(10);
        });

        it('should remove sub-entries', function() {
            const entry = eds.getEntry(0x2000);

            eds.removeSubEntry(0x2000, 10);
            expect(entry.subNumber).to.equal(2);
            expect(entry[0].value).to.equal(1);

            eds.removeSubEntry(0x2000, 1);
            expect(entry.subNumber).to.equal(1);
            expect(entry[0].value).to.equal(0);
        });

        it('should not remove sub-entry 0', function() {
            expect(() => eds.removeSubEntry(0x2000, 0)).to.throw(EdsError);
        });
    });
});