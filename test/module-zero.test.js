const fs = require('fs-extra');
const path = require('path');
const {spawn} = require('child_process');
const detectNewline = require('detect-newline');
const createModuleZero = require('../index');

jest.mock('child_process', () => ({
    spawn: jest.fn().mockReturnValue({
        on: (ev, fn) => {
            // simulate success
            if (ev === 'close') {
                fn();
            }
        }
    })
}));

describe('module-zero', () => {
    const fixtures = path.resolve(__dirname, 'fixtures');
    const testModuleDirPath = path.resolve(__dirname, 'fixtures/test-module');
    const baseModuleInstalledCwd = path.join(testModuleDirPath, 'node_modules/base');
    const testModulePackageJSONPath = path.join(testModuleDirPath, 'package.json');
    const baseModuleFile2Path = path.join(baseModuleInstalledCwd, 'files/subfolder/file2.txt');
    // const baseModuleBlock1Path = path.join(baseModuleInstalledCwd, 'blocks/.gitignore');
    const baseModuleBlock2Path = path.join(baseModuleInstalledCwd, 'blocks/subfolder/block2.js');
    const baseModuleBlock3Path = path.join(
        baseModuleInstalledCwd,
        'blocks/block-with-existing-content.js'
    );
    const baseModuleBlock4Path = path.join(
        baseModuleInstalledCwd,
        'blocks/file-with-existing-content-blocks.js'
    );

    const testModuleFile1Path = path.join(testModuleDirPath, '/file1.txt');
    const testModuleFile2Path = path.join(testModuleDirPath, '/subfolder/file2.txt');
    const testModuleFile3Path = path.join(testModuleDirPath, '/subfolder/subfolder/file3.txt');
    const testModuleFile4Path = path.join(testModuleDirPath, 'file4.txt');
    // const testModuleBlock1Path = path.join(testModuleDirPath, '/.gitignore');
    const testModuleBlock2Path = path.join(testModuleDirPath, '/subfolder/block2.js');
    const testModuleBlock3Path = path.join(testModuleDirPath, '/block-with-existing-content.js');
    const testModuleBlock4Path = path.join(
        testModuleDirPath,
        '/file-with-existing-content-blocks.js'
    );

    beforeEach(() => {
        fs.copySync(path.join(fixtures, 'test-module-source'), path.join(fixtures, 'test-module'));
    });

    afterEach(() => {
        fs.removeSync(path.join(fixtures, 'test-module'));
        spawn.mockClear();
    });

    it('should throw if no parent module is found', () => {
        expect(() => createModuleZero({})).toThrow('module-zero: has no parent module');
    });

    describe('npm installed module-zero', () => {
        describe('Update parent module', () => {
            it('should copy specified files across', async () => {
                const m0 = createModuleZero({
                    files: '**/*',
                    cwd: baseModuleInstalledCwd
                });

                await m0.copyFiles();

                const results = [
                    fs.pathExistsSync(testModuleFile1Path),
                    fs.pathExistsSync(testModuleFile2Path),
                    fs.pathExistsSync(testModuleFile3Path)
                ];

                expect(results).toEqual([true, true, true]);
            });

            it('should record the copied files in the parent module package.json', async () => {
                const m0 = createModuleZero({
                    files: '**/*',
                    cwd: baseModuleInstalledCwd
                });

                await m0.copyFiles();

                const parentPackageJSON = fs.readJSONSync(testModulePackageJSONPath);

                expect(parentPackageJSON._m0.files /* eslint-disable-line */).toEqual([
                    'file1.txt',
                    'subfolder/file2.txt',
                    'subfolder/subfolder/file3.txt'
                ]);
            });

            it('should remove files no longer managed by module-zero', async () => {
                const m0 = createModuleZero({
                    files: '**/*',
                    cwd: baseModuleInstalledCwd
                });

                await m0.copyFiles();

                // simulate removal of base module file2.txt
                fs.removeSync(baseModuleFile2Path);

                await m0.copyFiles();

                // managed by m0
                const testModuleFile2Exits = fs.pathExistsSync(testModuleFile2Path);

                // not managed by m0
                const testModuleFile4Exits = fs.pathExistsSync(testModuleFile4Path);

                expect(testModuleFile2Exits).toEqual(false);
                expect(testModuleFile4Exits).toEqual(true);
            });

            it('should install specified devDependencies', async () => {
                const m0 = createModuleZero({
                    cwd: baseModuleInstalledCwd,
                    files: '**/*',
                    devDependencies: {
                        a: '0.0.0',
                        b: '0.0.1',
                        c: '0.1.1'
                    }
                });

                await m0.installDevDependencies();

                expect(spawn.mock.calls[0][0]).toEqual(
                    'npm install --save-dev a@0.0.0 b@0.0.1 c@0.1.1'
                );
            });

            it('should record the devDependencies in the parent module package.json', async () => {
                const m0 = createModuleZero({
                    cwd: baseModuleInstalledCwd,
                    files: '**/*',
                    devDependencies: {
                        a: '0.0.0',
                        b: '0.0.1',
                        c: '0.1.1'
                    }
                });

                await m0.installDevDependencies();

                const parentPackageJSON = fs.readJSONSync(testModulePackageJSONPath);

                expect(parentPackageJSON._m0.devDependencies /* eslint-disable-line */).toEqual({
                    a: '0.0.0',
                    b: '0.0.1',
                    c: '0.1.1'
                });
            });

            it('should remove devDependencies no longer managed by module zero', async () => {
                const m0 = createModuleZero({
                    cwd: baseModuleInstalledCwd,
                    files: '**/*',
                    devDependencies: {
                        a: '0.0.0',
                        b: '0.0.1',
                        c: '0.1.1'
                    }
                });

                await m0.installDevDependencies();

                // simulate another install with 'b' no longer required
                await m0.installDevDependencies({
                    a: '0.0.0',
                    c: '0.1.1'
                });

                const parentPackageJSON = fs.readJSONSync(testModulePackageJSONPath);

                expect(spawn.mock.calls[1][0]).toEqual(
                    'npm uninstall --save-dev b && npm install --save-dev a@0.0.0 c@0.1.1'
                );
                expect(parentPackageJSON._m0.devDependencies /* eslint-disable-line */).toEqual({
                    a: '0.0.0',
                    c: '0.1.1'
                });
            });

            it('should create manageable blocks in specified files', async () => {
                const m0 = createModuleZero({
                    cwd: baseModuleInstalledCwd,
                    blocks: {
                        src: '**/*',
                        commentStyles: {
                            '#': '#! m0',
                            '//': '//! m0',
                            '/**/': '/*! m0 */'
                        },
                        commentStyleMap: {
                            '.gitignore': '#',
                            '.js': '/**/'
                        }
                    }
                });

                await m0.createBlocks();

                const block2Source = fs.readFileSync(baseModuleBlock2Path);
                const newlineChar = detectNewline(block2Source.toString());
                const expectedBlock2ContentBlocks = [
                    `/*! m0-start */${newlineChar}function testFn(a, b, c) {${newlineChar}    return [a, b, c];${newlineChar}}${newlineChar}/*! m0-end */`,
                    `/*! m0-start */${newlineChar}module.export = testFn;${newlineChar}/*! m0-end */`
                ];
                const block2ContentBlocks = fs
                    .readFileSync(testModuleBlock2Path)
                    .toString()
                    .match(/\/\*! m0-start \*\/[^\uFDD1]*?\/\*! m0-end \*\//g);

                expect(block2ContentBlocks).toEqual(expectedBlock2ContentBlocks);
            });

            it('should record the files with blocks, in the parent module package.json', async () => {
                const m0 = createModuleZero({
                    cwd: baseModuleInstalledCwd,
                    blocks: {
                        src: '**/*',
                        commentStyles: {
                            '#': '#! m0',
                            '//': '//! m0',
                            '/**/': '/*! m0 */'
                        },
                        commentStyleMap: {
                            '.gitignore': '#',
                            '.js': '/**/'
                        }
                    }
                });

                await m0.createBlocks();

                const parentPackageJSON = fs.readJSONSync(testModulePackageJSONPath);

                expect(parentPackageJSON._m0.blocks.sort() /* eslint-disable-line */).toEqual(
                    [
                        '.gitignore',
                        'block-with-existing-content.js',
                        'file-with-existing-content-blocks.js',
                        'subfolder/block2.js'
                    ].sort()
                );
            });

            describe('Given the block destination file already exists and contains content', () => {
                describe('and the content contains no blocks', () => {
                    it('should insert blocks at the beginning of the file, keeping existing content intact', async () => {
                        const m0 = createModuleZero({
                            cwd: baseModuleInstalledCwd,
                            blocks: {
                                src: '**/*',
                                commentStyles: {
                                    '#': '#! m0',
                                    '//': '//! m0',
                                    '/**/': '/*! m0 */'
                                },
                                commentStyleMap: {
                                    '.gitignore': '#',
                                    '.js': '/**/'
                                }
                            }
                        });

                        await m0.createBlocks();

                        const blockSource = fs.readFileSync(baseModuleBlock3Path);
                        const newlineChar = detectNewline(blockSource.toString());
                        const expectedBlockContent = [
                            `/*! m0-start */${newlineChar}function testFn(a, b, c) {${newlineChar}    return [a, b, c];${newlineChar}}`,
                            `module.export = testFn;${newlineChar}/*! m0-end */`,
                            'const someExistingVar = 1;'
                        ].join(newlineChar + newlineChar);
                        const blockResult = fs
                            .readFileSync(testModuleBlock3Path)
                            .toString()
                            .trim();

                        expect(blockResult).toEqual(expectedBlockContent);
                    });
                });

                describe('and the content contains blocks', () => {
                    it('should replace the existing blocks, keeping existing content intact', async () => {
                        const m0 = createModuleZero({
                            cwd: baseModuleInstalledCwd,
                            blocks: {
                                src: '**/*',
                                commentStyles: {
                                    '#': '#! m0',
                                    '//': '//! m0',
                                    '/**/': '/*! m0 */'
                                },
                                commentStyleMap: {
                                    '.gitignore': '#',
                                    '.js': '/**/'
                                }
                            }
                        });

                        await m0.createBlocks();

                        const blockSource = fs.readFileSync(baseModuleBlock4Path);
                        const newlineChar = detectNewline(blockSource.toString());
                        const expectedBlockContent = [
                            `/*! m0-start */${newlineChar}function testFnA(a, b, c) {${newlineChar}    return [a, b, c];${newlineChar}}${newlineChar}/*! m0-end */`,
                            `/*! m0-start */${newlineChar}function testFnB(a, b, c) {${newlineChar}    return [a, b, c];${newlineChar}}${newlineChar}/*! m0-end */`,
                            `/*! m0-start */${newlineChar}function testFnC(a, b, c) {${newlineChar}    return [a, b, c];${newlineChar}}${newlineChar}/*! m0-end */`,
                            `/*! m0-start */${newlineChar}function testFnD(a, b, c) {${newlineChar}    return [a, b, c];${newlineChar}}${newlineChar}/*! m0-end */`,
                            `/*! m0-start */${newlineChar}const config = {${newlineChar}    testFnA,${newlineChar}    testFnB,${newlineChar}    testFnC,${newlineChar}    testFnD${newlineChar}};${newlineChar}/*! m0-end */`,
                            'function testFn5() {}',
                            'config.testFn5 = testFn5;',
                            `/*! m0-start */${newlineChar}module.export = config;${newlineChar}/*! m0-end */`
                        ].join(newlineChar + newlineChar);

                        const blockContent = fs
                            .readFileSync(testModuleBlock4Path)
                            .toString()
                            .trim();

                        expect(blockContent).toEqual(expectedBlockContent);
                    });
                });
            });

            it('should remove blocks from files no longer managed by module-zero', async () => {
                const m0 = createModuleZero({
                    cwd: baseModuleInstalledCwd,
                    blocks: {
                        src: '**/*',
                        commentStyles: {
                            '#': '#! m0',
                            '//': '//! m0',
                            '/**/': '/*! m0 */'
                        },
                        commentStyleMap: {
                            '.gitignore': '#',
                            '.js': '/**/'
                        }
                    }
                });

                await m0.createBlocks();

                // simulate removal of base module block-with-existing-content.js
                fs.removeSync(baseModuleBlock4Path);

                await m0.createBlocks();

                const blockResult = fs
                    .readFileSync(testModuleBlock4Path)
                    .toString()
                    .trim();
                const newlineChar = detectNewline(blockResult);
                const expectedContent = ['function testFn5() {}', 'config.testFn5 = testFn5;'].join(
                    newlineChar + newlineChar
                );

                expect(blockResult).toEqual(expectedContent);
            });
        });
    });
});
