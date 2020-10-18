const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { Eds, DataType, AccessType, ObjectType } = require('../index');
const fs = require('fs');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('EDS', function() {
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

        it('should create a raw entry if there is a DefaultValue', function() {
            const loadFile = new Eds();
            loadFile.load('test/sample.eds');

            const entry = loadFile.getSubEntry('DeviceInfo', 0)
            expect(entry.raw).to.not.be.undefined
        });
    });

    describe('Add entry', function() {
        let eds;

        beforeEach(function() {
            eds = new Eds();
        });

        afterEach(function() {
            delete eds;
        });

        it('should require ParameterName', function() {
            return expect(() => {
                eds.addEntry(0x2000, {
                    'DataType':         DataType.UNSIGNED8,
                    'AccessType':       AccessType.READ_WRITE,
                });
            }).to.throw(TypeError);
        });

        it('should not allow an unknown ObjectType', function() {
            return expect(() => {
                eds.addEntry(0x2000, {
                    'ParameterName':    'DataObject',
                    'ObjectType':       -1,
                    'DataType':         DataType.UNSIGNED8,
                    'AccessType':       AccessType.READ_WRITE,
                });
            }).to.throw(TypeError);
        });

        describe('ObjectType is DEFTYPE or VAR', function() {
            it('should require DataType', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'VAR',
                        'ObjectType':       ObjectType.VAR,
                        'AccessType':       AccessType.READ_WRITE,
                    });
                }).to.throw(TypeError);
            });
            it('should require AccessType', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'VAR',
                        'ObjectType':       ObjectType.VAR,
                        'DataType':         DataType.UNSIGNED8,
                    });
                }).to.throw(TypeError);
            });
            it('should not allow SubNumber', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'VAR',
                        'ObjectType':       ObjectType.VAR,
                        'DataType':         DataType.UNSIGNED8,
                        'AccessType':       AccessType.READ_WRITE,
                        'SubNumber':        1,
                    }).to.throw(TypeError);
                })
            });
            it('should not allow CompactSubObj', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'VAR',
                        'ObjectType':       ObjectType.VAR,
                        'DataType':         DataType.UNSIGNED8,
                        'AccessType':       AccessType.READ_WRITE,
                        'CompactSubObj':    true, // Not allowed
                    }).to.throw(TypeError);
                })
            });
            it('should emit on value update', function(done) {
                const obj = eds.addEntry(0x2000, {
                    'ParameterName':    'VAR',
                    'ObjectType':       ObjectType.VAR,
                    'DataType':         DataType.UNSIGNED8,
                    'AccessType':       AccessType.READ_WRITE,
                });

                obj.addListener('update', () => { done(); });
                obj.value = 1;
            });
        });

        describe('ObjectType is DEFSTRUCT, ARRAY, or RECORD', function() {
            describe('CompactSubObj is false', function() {
                it('should require SubNumber', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       ObjectType.ARRAY,
                        });
                    }).to.throw(TypeError);
                });
                it('should not allow DataType', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       ObjectType.ARRAY,
                            'DataType':         DataType.UNSIGNED8,
                            'SubNumber':        1,
                        }).to.throw(TypeError);
                    })
                });
                it('should not allow AccessType', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       ObjectType.ARRAY,
                            'AccessType':       AccessType.READ_WRITE,
                            'SubNumber':        1,
                        }).to.throw(TypeError);
                    })
                });
                it('should not allow DefaultValue', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       ObjectType.ARRAY,
                            'DefaultValue':     0,
                            'SubNumber':        1,
                        }).to.throw(TypeError);
                    })
                });
                it('should not allow PDOMapping', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       ObjectType.ARRAY,
                            'PDOMapping':       false,
                            'SubNumber':        1,
                        }).to.throw(TypeError);
                    })
                });
                it('should not allow LowLimit', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       ObjectType.ARRAY,
                            'LowLimit':         null,
                            'SubNumber':        1,
                        }).to.throw(TypeError);
                    })
                });
                it('should not allow HighLimit', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       ObjectType.ARRAY,
                            'HighLimit':        null,
                            'SubNumber':        1,
                        }).to.throw(TypeError);
                    })
                });
            });
            describe('CompactSubObj is true', function() {
                it('should require DataType', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       ObjectType.ARRAY,
                            'AccessType':       AccessType.READ_WRITE,
                            'CompactSubObj':    true,
                        });
                    }).to.throw(TypeError);
                });
                it('should require AccessType', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       ObjectType.ARRAY,
                            'DataType':         DataType.UNSIGNED8,
                            'CompactSubObj':    true,
                        });
                    }).to.throw(TypeError);
                });
                it('should not allow SubNumber', function() {
                    return expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       ObjectType.ARRAY,
                            'DataType':         DataType.UNSIGNED8,
                            'AccessType':       AccessType.READ_WRITE,
                            'SubNumber':        1,
                            'CompactSubObj':    true,
                        }).to.throw(TypeError);
                    });
                });
            });
        });

        describe('ObjectType is DOMAIN', function() {
            it('should not allow PDOMapping', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'ARRAY',
                        'ObjectType':       ObjectType.ARRAY,
                        'PDOMapping':       false,
                    }).to.throw(TypeError);
                })
            });
            it('should not allow LowLimit', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'DOMAIN',
                        'ObjectType':       ObjectType.DOMAIN,
                        'LowLimit':         null,
                    }).to.throw(TypeError);
                })
            });
            it('should not allow HighLimit', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'DOMAIN',
                        'ObjectType':       ObjectType.DOMAIN,
                        'HighLimit':        null,
                    }).to.throw(TypeError);
                })
            });
            it('should not allow SubNumber', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'DOMAIN',
                        'ObjectType':       ObjectType.DOMAIN,
                        'SubNumber':        1,
                    }).to.throw(TypeError);
                })
            });
            it('should not allow CompactSubObj', function() {
                return expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'DOMAIN',
                        'ObjectType':       ObjectType.DOMAIN,
                        'CompactSubObj':    false,
                    }).to.throw(TypeError);
                })
            });
        });
    });

    describe('Remove entry', function() {
        let eds;

        beforeEach(function() {
            eds = new Eds();
            eds.addEntry(0x2000, {
                'ParameterName':    'Test entry',
                'ObjectType':       ObjectType.VAR,
                'DataType':         DataType.UNSIGNED8,
                'AccessType':       AccessType.READ_WRITE,
            });
            eds.addEntry(0x2001, {
                'ParameterName':    'Test entry',
                'ObjectType':       ObjectType.VAR,
                'DataType':         DataType.UNSIGNED8,
                'AccessType':       AccessType.READ_WRITE,
            });
            eds.addEntry(0x2002, {
                'ParameterName':    'Test entry',
                'ObjectType':       ObjectType.VAR,
                'DataType':         DataType.UNSIGNED8,
                'AccessType':       AccessType.READ_WRITE,
            });
        });

        afterEach(function() {
            delete eds;
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
});