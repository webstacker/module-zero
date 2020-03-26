'use strict';

const path = require('path');
const fs = require('fs-extra');
const writePkg = require('write-pkg');
const {spawn} = require('child_process');
const globby = require('globby');
const detectNewline = require('detect-newline');
const os = require('os');

function createModuleZero(spec) {
    const {
        files = '**/*',
        blocks = {src: '**/*', commentStyles: {}, commentStyleMap: {}},
        devDependencies,
        cwd = process.cwd()
    } = spec;

    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
    }

    function error(errorMessage) {
        return `module-zero: ${errorMessage}`;
    }

    function getParentPackage(parentDir) {
        try {
            return fs.readJsonSync(path.join(parentDir, 'package.json'));
        } catch (err) {
            throw Error(error('has no parent module'));
        }
    }

    const parentModuleDir = path.resolve(cwd, '../..');
    const parentPackageJSON = getParentPackage(parentModuleDir);
    parentPackageJSON._m0 = parentPackageJSON._m0 || {}; // eslint-disable-line

    // Create regexs for each comment style
    blocks.commentRegexp = {};

    Object.keys(blocks.commentStyleMap).forEach(fileExt => {
        const commentType = blocks.commentStyleMap[fileExt];
        const commentStyle = blocks.commentStyles[commentType];
        const openingComment = escapeRegExp(commentStyle.replace('m0', 'm0-start'));
        const closingComment = escapeRegExp(commentStyle.replace('m0', 'm0-end'));

        // http://unicode-table.com/en/search/?q=not+a+character
        blocks.commentRegexp[fileExt] = new RegExp(
            `${openingComment}[^\\uFDD1]*?${closingComment}`,
            'g'
        );
    });

    async function copyFiles(filesGlob = files, dest = parentModuleDir) {
        try {
            const filesDir = path.join(cwd, 'files');
            const copiedFilesRelativePaths = await globby(filesGlob, {
                dot: true,
                cwd: filesDir
            });

            // Ensure package.json output order is consistent regardless of resolved promise order
            copiedFilesRelativePaths.sort();

            const copyFilePromises = copiedFilesRelativePaths.map(relPath => {
                const source = path.join(filesDir, relPath);
                const destination = path.join(dest, relPath);

                return fs.copy(source, destination);
            });

            await Promise.all(copyFilePromises);

            // remove previously copied files that no longer exist
            const existingFiles = parentPackageJSON._m0.files; // eslint-disable-line

            if (existingFiles) {
                const fileToDelete = existingFiles.filter(
                    item => copiedFilesRelativePaths.indexOf(item) === -1
                );

                const promises = fileToDelete.map(relativeFilePath =>
                    fs.remove(path.resolve(dest, relativeFilePath))
                );

                await Promise.all(promises);
            }

            parentPackageJSON._m0.files = copiedFilesRelativePaths; // eslint-disable-line
            await writePkg(dest, parentPackageJSON, {normalize: false});

            return copiedFilesRelativePaths;
        } catch (err) {
            throw Error(error(err));
        }
    }

    function execCmd(cmd, workingDir = parentModuleDir) {
        const childProcess = spawn(cmd, [], {
            cwd: workingDir,
            shell: true,
            stdio: 'inherit'
        });

        return new Promise((resolve, reject) => {
            childProcess.on('close', code => {
                resolve(code);
            });

            childProcess.on('error', err => {
                reject(err);
            });
        });
    }

    async function installDevDependencies(
        devDependenciesLocal = devDependencies,
        dest = parentModuleDir
    ) {
        try {
            const npmCommands = [];
            const existingDevDependencies = parentPackageJSON._m0.devDependencies || {}; // eslint-disable-line
            const packagesToRemove = Object.keys(existingDevDependencies).filter(
                dependency => !Object.keys(devDependenciesLocal).includes(dependency)
            );
            const packagesToAdd = Object.keys(devDependenciesLocal).reduce(
                (acc, dependencyName) => {
                    const currentPackageVersion = existingDevDependencies[dependencyName];
                    const newPackageVersion = devDependenciesLocal[dependencyName];

                    if (currentPackageVersion !== newPackageVersion) {
                        acc.push(`${dependencyName}@${newPackageVersion}`);
                    }

                    return acc;
                },
                []
            );

            if (packagesToRemove.length > 0) {
                npmCommands.push(`npm uninstall --save-dev ${packagesToRemove.join(' ')}`);
            }

            if (packagesToAdd.length > 0) {
                npmCommands.push(`npm install --save-dev ${packagesToAdd.join(' ')}`);
            }

            parentPackageJSON._m0.devDependencies = devDependenciesLocal; // eslint-disable-line
            await writePkg(dest, parentPackageJSON, {normalize: false});

            if (npmCommands.length !== 0) {
                await execCmd(`${npmCommands.join(' && ')}`);
            }
        } catch (err) {
            throw Error(error(err));
        }
    }

    async function insertConfigBlockInFile(filePath, rxBlock, block) {
        await fs.ensureFile(filePath);

        const fileContent = await fs.readFile(filePath, 'utf8');
        // Replace new-line placeholder(s) with lf / crlf depending on system
        const newLineChar = detectNewline(fileContent.toString()) || detectNewline(block) || os.EOL;
        const blockWithNewLineTokensReplaced = block.replace(/{newLine}/g, newLineChar);
        const rxStartOfFile = /^/;
        const hasBlock = rxBlock.test(fileContent);
        let fileContentWithReplacement;

        // if it has block(s) replace each one
        if (hasBlock) {
            const sourceBlocks = blockWithNewLineTokensReplaced.match(rxBlock);

            if (sourceBlocks) {
                let i = 0;

                fileContentWithReplacement = fileContent.replace(rxBlock, () => {
                    const replacement = sourceBlocks[i];

                    i += 1;

                    return replacement;
                });
            } else {
                fileContentWithReplacement = fileContent.replace(
                    rxBlock,
                    blockWithNewLineTokensReplaced
                );
            }
        } else {
            fileContentWithReplacement = fileContent.replace(
                rxStartOfFile,
                blockWithNewLineTokensReplaced
            );
        }

        await fs.writeFile(filePath, fileContentWithReplacement, {
            encoding: 'utf8',
            flag: 'w'
        });

        return true;
    }

    async function removeBlocks(existingBlocks, blockFilePaths, dest) {
        const blocksToDelete = existingBlocks.filter(item => blockFilePaths.indexOf(item) === -1);

        const promises = blocksToDelete.map(async blockFilePath => {
            const fileExt = path.extname(blockFilePath) || path.basename(blockFilePath);
            const blockAbsoluteFilePath = path.join(dest, blockFilePath);

            await insertConfigBlockInFile(blockAbsoluteFilePath, blocks.commentRegexp[fileExt], '');
        });

        await Promise.all(promises);
    }

    async function createBlocks(srcGlob = blocks.src, dest = parentModuleDir) {
        try {
            const blockDirPath = path.join(cwd, 'blocks');
            const blockSrcFilePaths = await globby(srcGlob, {
                dot: true,
                cwd: blockDirPath
            });

            // Ensure package.json output order is consistent regardless of resolved promise order
            blockSrcFilePaths.sort();

            const blockDestFilePaths = blockSrcFilePaths.map(blockSrcFilePath =>
                blockSrcFilePath.replace('_m0_', '')
            );

            // remove previously created blocks that no longer exist
            const existingBlocks = parentPackageJSON._m0.blocks; // eslint-disable-line

            if (existingBlocks) {
                await removeBlocks(existingBlocks, blockDestFilePaths, dest);
            }

            parentPackageJSON._m0.blocks = blockDestFilePaths; // eslint-disable-line
            await writePkg(dest, parentPackageJSON, {normalize: false});

            const promises = blockSrcFilePaths.map(async (blockFilePath, index) => {
                const blockAbsoluteFilePath = path.join(blockDirPath, blockFilePath);
                const blockContent = await fs.readFile(blockAbsoluteFilePath, 'utf8');
                const extName = path.extname(blockFilePath) || path.basename(blockFilePath);
                const comment = [blockContent, '{newLine}'].join('');

                // replace existing content
                const destAbsoluteFilePath = path.join(dest, blockDestFilePaths[index]);

                const rxBlock = blocks.commentRegexp[extName];

                await insertConfigBlockInFile(destAbsoluteFilePath, rxBlock, comment);
            });

            await Promise.all(promises);

            return true;
        } catch (err) {
            throw Error(error(err));
        }
    }

    return Object.freeze({
        copyFiles,
        installDevDependencies,
        createBlocks
    });
}

module.exports = createModuleZero;
