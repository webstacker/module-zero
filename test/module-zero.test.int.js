'use strict';

const fs = require('fs-extra');
const path = require('path');
const {spawn} = require('child_process');
const moduleZeroVersion = require('../package.json').version;

function execCmd(cmd, workingDir) {
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

describe('module-zero', () => {
    const fixtures = path.resolve(__dirname, 'fixtures');
    const baseConfigModuleDirPath = path.resolve(__dirname, 'fixtures/base-config');
    const myModuleDirPath = path.resolve(__dirname, 'fixtures/my-module');
    const myModuleGitIgnoreFilePath = path.join(myModuleDirPath, '.gitignore');

    beforeEach(async () => {
        fs.copySync(path.join(fixtures, 'base-config-source'), path.join(fixtures, 'base-config'));
        fs.copySync(path.join(fixtures, 'my-module-source'), path.join(fixtures, 'my-module'));
        await execCmd('npm pack ../../', fixtures);
        await execCmd(
            `npm install ../module-zero-${moduleZeroVersion}.tgz`,
            baseConfigModuleDirPath
        );
        await execCmd('npm pack ./base-config/', fixtures);
        await execCmd('npm install ../base-config-0.0.0.tgz', myModuleDirPath);
    }, 5 * 60000);

    afterEach(() => {
        fs.removeSync(path.join(fixtures, 'base-config'));
        fs.removeSync(path.join(fixtures, 'my-module'));
        fs.removeSync(path.join(fixtures, `module-zero-${moduleZeroVersion}.tgz`));
        fs.removeSync(path.join(fixtures, `base-config-0.0.0.tgz`));
    });

    it('should copy across .gitignore', () => {
        expect(fs.pathExistsSync(myModuleGitIgnoreFilePath)).toEqual(true);
    });
});
