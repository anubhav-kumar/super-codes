#!/usr/bin/env node
'use strict';

/**
 * Root undeploy: frontend first, then backend. Destructive.
 *
 *   assume CoderAnubhav95 --exec "node undeploy.js --stage prod --yes"
 *
 * Without --yes each child script asks for confirmation on the terminal.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const ALLOWED_PROFILE = 'CoderAnubhav95';

for (const name of ['AWS_PROFILE', 'GRANTED_AWS_ROLE_PROFILE']) {
    const value = process.env[name];
    if (value && value !== ALLOWED_PROFILE) {
        console.error(`Refusing to run: ${name} is "${value}". Only "${ALLOWED_PROFILE}" may be used.`);
        process.exit(1);
    }
}

const args = process.argv.slice(2);
for (const part of ['frontend', 'backend']) {
    console.log(`\n==== Undeploying ${part} ====`);
    const res = spawnSync(process.execPath, [path.join(__dirname, part, 'undeploy.js'), ...args], {
        cwd: path.join(__dirname, part),
        stdio: 'inherit',
        env: process.env,
    });
    if (res.status !== 0) {
        console.error(`${part} undeploy failed (exit ${res.status}). Stopping.`);
        process.exit(1);
    }
}
console.log('\nUndeploy complete.');
