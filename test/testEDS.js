const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { EDS } = require('../index');
const fs = require('fs');

const expect = chai.expect;
chai.use(chaiAsPromised);


describe('EDS', function() {
    it('should be constructable', function() {
        new EDS.EDS();
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
            const saveFile = new EDS.EDS();
            const loadFile = new EDS.EDS();
            const date = new Date(0);

            saveFile.fileName = 'Test file';
            saveFile.creationDate = date;
            saveFile.baudRates = [500000];
            saveFile.save(testFile);

            loadFile.load(testFile);
            expect(loadFile.fileName).to.equal('Test file');
            expect(loadFile.baudRates).to.include(500000);
            expect(loadFile.creationDate.getTime()).to.equal(date.getTime());
        });
    });

    describe('Add entry', function() {
        let eds;

        beforeEach(function() {
            eds = new EDS.EDS();
        });

        afterEach(function() {
            delete eds;
        });

        it('should require ParameterName', function() {
            expect(() => {
                eds.addEntry(0x2000, {
                    'ParameterName':    '',
                    'DataType':         EDS.dataTypes.UNSIGNED8,
                    'AccessType':       EDS.accessTypes.READ_WRITE,
                });
            }).to.throw(TypeError);
        });

        it('should not allow an unknown ObjectType', function() {
            expect(() => {
                eds.addEntry(0x2000, {
                    'ParameterName':    'DataObject',
                    'ObjectType':       -1,
                    'DataType':         EDS.dataTypes.UNSIGNED8,
                    'AccessType':       EDS.accessTypes.READ_WRITE,
                });
            }).to.throw(TypeError);
        });

        describe('ObjectType is DEFTYPE or VAR', function() {
            it('should be constructable', function() {
                eds.addEntry(0x2000, {
                    'ParameterName':    'VAR',
                    'ObjectType':       EDS.objectTypes.VAR,
                    'DataType':         EDS.dataTypes.UNSIGNED8,
                    'AccessType':       EDS.accessTypes.READ_WRITE,
                });
            });
            it('should require DataType', function() {
                expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'VAR',
                        'ObjectType':       EDS.objectTypes.VAR,
                        'AccessType':       EDS.accessTypes.READ_WRITE,
                    });
                }).to.throw(TypeError);
            });
            it('should require AccessType', function() {
                expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'VAR',
                        'ObjectType':       EDS.objectTypes.VAR,
                        'DataType':         EDS.dataTypes.UNSIGNED8,
                    });
                }).to.throw(TypeError);
            });
            it('should not allow SubNumber', function() {
                expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'VAR',
                        'ObjectType':       EDS.objectTypes.VAR,
                        'DataType':         EDS.dataTypes.UNSIGNED8,
                        'AccessType':       EDS.accessTypes.READ_WRITE,
                        'SubNumber':        1,
                    }).to.throw(TypeError);
                })
            });
            it('should not allow CompactSubObj', function() {
                expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'VAR',
                        'ObjectType':       EDS.objectTypes.VAR,
                        'DataType':         EDS.dataTypes.UNSIGNED8,
                        'AccessType':       EDS.accessTypes.READ_WRITE,
                        'CompactSubObj':    true, // Not allowed
                    }).to.throw(TypeError);
                })
            });
            it('should emit on value update', function(done) {
                const obj = eds.addEntry(0x2000, {
                    'ParameterName':    'VAR',
                    'ObjectType':       EDS.objectTypes.VAR,
                    'DataType':         EDS.dataTypes.UNSIGNED8,
                    'AccessType':       EDS.accessTypes.READ_WRITE,
                });

                obj.addListener('update', () => { done(); });
                obj.value = 1;
            });
        });

        describe('ObjectType is DEFSTRUCT, ARRAY, or RECORD', function() {
            describe('CompactSubObj is false', function() {
                it('should be constructable', function() {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'ARRAY',
                        'ObjectType':       EDS.objectTypes.ARRAY,
                        'SubNumber':        1,
                    });
                });
                it('should require SubNumber', function() {
                    expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       EDS.objectTypes.ARRAY,
                        });
                    }).to.throw(TypeError);
                });
                it('should not allow DataType', function() {
                    expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       EDS.objectTypes.ARRAY,
                            'DataType':         EDS.dataTypes.UNSIGNED8,
                            'SubNumber':        1,
                        }).to.throw(TypeError);
                    })
                });
                it('should not allow AccessType', function() {
                    expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       EDS.objectTypes.ARRAY,
                            'AccessType':       EDS.accessTypes.READ_WRITE,
                            'SubNumber':        1,
                        }).to.throw(TypeError);
                    })
                });
                it('should not allow DefaultValue', function() {
                    expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       EDS.objectTypes.ARRAY,
                            'DefaultValue':     0,
                            'SubNumber':        1,
                        }).to.throw(TypeError);
                    })
                });
                it('should not allow PDOMapping', function() {
                    expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       EDS.objectTypes.ARRAY,
                            'PDOMapping':       false,
                            'SubNumber':        1,
                        }).to.throw(TypeError);
                    })
                });
                it('should not allow LowLimit', function() {
                    expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       EDS.objectTypes.ARRAY,
                            'LowLimit':         null,
                            'SubNumber':        1,
                        }).to.throw(TypeError);
                    })
                });
                it('should not allow HighLimit', function() {
                    expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       EDS.objectTypes.ARRAY,
                            'HighLimit':        null,
                            'SubNumber':        1,
                        }).to.throw(TypeError);
                    })
                });
            });
            describe('CompactSubObj is true', function() {
                it('should be constructable', function() {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'ARRAY',
                        'ObjectType':       EDS.objectTypes.ARRAY,
                        'DataType':         EDS.dataTypes.UNSIGNED8,
                        'AccessType':       EDS.accessTypes.READ_WRITE,
                        'CompactSubObj':    true,
                    });
                });
                it('should require DataType', function() {
                    expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       EDS.objectTypes.ARRAY,
                            'AccessType':       EDS.accessTypes.READ_WRITE,
                            'CompactSubObj':    true,
                        });
                    }).to.throw(TypeError);
                });
                it('should require AccessType', function() {
                    expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       EDS.objectTypes.ARRAY,
                            'DataType':         EDS.dataTypes.UNSIGNED8,
                            'CompactSubObj':    true,
                        });
                    }).to.throw(TypeError);
                });
                it('should not allow SubNumber', function() {
                    expect(() => {
                        eds.addEntry(0x2000, {
                            'ParameterName':    'ARRAY',
                            'ObjectType':       EDS.objectTypes.ARRAY,
                            'DataType':         EDS.dataTypes.UNSIGNED8,
                            'AccessType':       EDS.accessTypes.READ_WRITE,
                            'SubNumber':        1,
                            'CompactSubObj':    true,
                        }).to.throw(TypeError);
                    });
                });
            });
        });

        describe('ObjectType is DOMAIN', function() {
            it('should be constructable', function() {
                eds.addEntry(0x2000, {
                    'ParameterName':    'DOMAIN',
                    'ObjectType':       EDS.objectTypes.DOMAIN,
                });
            });
            it('should not allow PDOMapping', function() {
                expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'ARRAY',
                        'ObjectType':       EDS.objectTypes.ARRAY,
                        'PDOMapping':       false,
                    }).to.throw(TypeError);
                })
            });
            it('should not allow LowLimit', function() {
                expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'DOMAIN',
                        'ObjectType':       EDS.objectTypes.DOMAIN,
                        'LowLimit':         null,
                    }).to.throw(TypeError);
                })
            });
            it('should not allow HighLimit', function() {
                expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'DOMAIN',
                        'ObjectType':       EDS.objectTypes.DOMAIN,
                        'HighLimit':        null,
                    }).to.throw(TypeError);
                })
            });
            it('should not allow SubNumber', function() {
                expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'DOMAIN',
                        'ObjectType':       EDS.objectTypes.DOMAIN,
                        'SubNumber':        1,
                    }).to.throw(TypeError);
                })
            });
            it('should not allow CompactSubObj', function() {
                expect(() => {
                    eds.addEntry(0x2000, {
                        'ParameterName':    'DOMAIN',
                        'ObjectType':       EDS.objectTypes.DOMAIN,
                        'CompactSubObj':    false,
                    }).to.throw(TypeError);
                })
            });
        });
    });

    describe('Remove entry', function() {
        let eds;

        beforeEach(function() {
            eds = new EDS.EDS();
            eds.addEntry(0x2000, {
                'ParameterName':    'Test entry 1',
                'ObjectType':       EDS.objectTypes.VAR,
                'DataType':         EDS.dataTypes.UNSIGNED8,
                'AccessType':       EDS.accessTypes.READ_WRITE,
            });
            eds.addEntry(0x2001, {
                'ParameterName':    'Test entry 2',
                'ObjectType':       EDS.objectTypes.VAR,
                'DataType':         EDS.dataTypes.UNSIGNED8,
                'AccessType':       EDS.accessTypes.READ_WRITE,
            });
        });

        afterEach(function() {
            delete eds;
        });

        it('should remove an entry', function() {
            eds.removeEntry(0x2000);

            /* Index lookup. */
            expect(eds.getEntry(0x2000)).to.equal(undefined);

            /* Name lookup. */
            expect(eds.getEntry('Test entry 1')).to.equal(undefined);
        });

        it('should throw if an entry does not exist', function() {
            expect(() => {
                eds.removeEntry(0x2003);
            }).to.throw(ReferenceError);
        });
    });
});