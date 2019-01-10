const fs = require('fs-extra');
const path = require('path');
const {exec} = require('child_process');
const detectNewline = require('detect-newline');
const createModuleZero = require('../index');

jest.mock('child_process', () => ({exec: jest.fn()}));

describe('module-zero', () => {
    jest.setTimeout = 120000;
    const fixtures = path.resolve(__dirname, 'fixtures');
    const testModuleDirPath = path.resolve(__dirname, 'fixtures/test-module');
    const baseModuleInstalledCwd = path.join(testModuleDirPath, 'node_modules/base');
    const testModulePackageJSONPath = path.join(testModuleDirPath, 'package.json');
    const baseModuleFile2Path = path.join(baseModuleInstalledCwd, 'files/subfolder/file2.txt');
    const baseModuleBlock1Path = path.join(baseModuleInstalledCwd, 'blocks/.gitignore');
    const baseModuleBlock2Path = path.join(baseModuleInstalledCwd, 'blocks/subfolder/block2.js');
    const baseModuleBlock3Path = path.join(
        baseModuleInstalledCwd,
        'blocks/block-with-existing-content.js'
    );

    const testModuleFile1Path = path.join(testModuleDirPath, '/file1.txt');
    const testModuleFile2Path = path.join(testModuleDirPath, '/subfolder/file2.txt');
    const testModuleFile3Path = path.join(testModuleDirPath, '/subfolder/subfolder/file3.txt');
    const testModuleFile4Path = path.join(testModuleDirPath, 'file4.txt');
    const testModuleBlock1Path = path.join(testModuleDirPath, '/.gitignore');
    const testModuleBlock2Path = path.join(testModuleDirPath, '/subfolder/block2.js');
    const testModuleBlock3Path = path.join(testModuleDirPath, '/block-with-existing-content.js');

    beforeEach(() => {
        fs.copySync(path.join(fixtures, 'test-module-source'), path.join(fixtures, 'test-module'));
    });

    afterEach(() => {
        fs.removeSync(path.join(fixtures, 'test-module'));
        exec.mockReset();
    });

    it('should throw if no parent module is found', () => {
        expect(() => createModuleZero({})).toThrowError('module-zero: has no parent module');
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

                expect(exec.mock.calls[0][0]).toEqual(
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

                expect(exec.mock.calls[1][0]).toEqual(
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

                const block1Source = fs.readFileSync(baseModuleBlock1Path);
                let newlineChar = detectNewline(block1Source.toString());
                const expectedBlock1Content = `#! m0-start${newlineChar}#! THIS BLOCK WAS PROGRAMMATICALLY GENERATED. DO NOT MODIFY OR DELETE${newlineChar}${block1Source}${newlineChar}#! m0-end`;
                const block1Result = fs
                    .readFileSync(testModuleBlock1Path)
                    .toString()
                    .trim();

                const block2Source = fs.readFileSync(baseModuleBlock2Path);
                newlineChar = detectNewline(block2Source.toString());
                const expectedBlock2Content = `/*! m0-start */${newlineChar}/*! THIS BLOCK WAS PROGRAMMATICALLY GENERATED. DO NOT MODIFY OR DELETE */${newlineChar}${block2Source}${newlineChar}/*! m0-end */`;
                const block2Result = fs
                    .readFileSync(testModuleBlock2Path)
                    .toString()
                    .trim();

                expect(block1Result).toEqual(expectedBlock1Content);
                expect(block2Result).toEqual(expectedBlock2Content);
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
                    ['.gitignore', 'block-with-existing-content.js', 'subfolder/block2.js'].sort()
                );
            });

            it('should keep existing content intact', async () => {
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
                const expectedBlockContent = `/*! m0-start */${newlineChar}/*! THIS BLOCK WAS PROGRAMMATICALLY GENERATED. DO NOT MODIFY OR DELETE */${newlineChar}${blockSource}${newlineChar}/*! m0-end */${newlineChar}${newlineChar}const someExistingVar = 1;`;
                const blockResult = fs
                    .readFileSync(testModuleBlock3Path)
                    .toString()
                    .trim();

                expect(blockResult).toEqual(expectedBlockContent);
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
                fs.removeSync(baseModuleBlock3Path);

                await m0.createBlocks();

                const blockResult = fs
                    .readFileSync(testModuleBlock3Path)
                    .toString()
                    .trim();

                expect(blockResult).toEqual('const someExistingVar = 1;');
            });
        });
    });
});
