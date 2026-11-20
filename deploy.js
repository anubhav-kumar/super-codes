#!/usr/bin/env node
'use strict';

/**
 * Root deploy: backend first, then frontend, then print the URLs.
 *
 *   assume CoderAnubhav95 --exec "node deploy.js --stage prod"
 *
 * Credentials come only from the environment set up by `assume CoderAnubhav95`.
 * This script never selects, sets or overrides an AWS profile or credentials.
 */

const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

const SLUG = 'ca-crm';
const ALLOWED_PROFILE = 'CoderAnubhav95';
const ROOT = __dirname;

function parseArgs(argv) {
    const out = { stage: 'prod', region: 'ap-southeast-1' };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--stage') out.stage = argv[++i];
        else if (arg.startsWith('--stage=')) out.stage = arg.slice('--stage='.length);
        else if (arg === '--region') out.region = argv[++i];
        else if (arg.startsWith('--region=')) out.region = arg.slice('--region='.length);
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!out.stage || !out.region) throw new Error('--stage and --region need a value');
    return out;
}

function assertProfile() {
    for (const name of ['AWS_PROFILE', 'GRANTED_AWS_ROLE_PROFILE']) {
        const value = process.env[name];
        if (value && value !== ALLOWED_PROFILE) {
            console.error(`Refusing to run: ${name} is "${value}". Only "${ALLOWED_PROFILE}" may be used.`);
            console.error(`Run: assume ${ALLOWED_PROFILE} --exec "node deploy.js --stage prod"`);
            process.exit(1);
        }
    }
}

function ensureInstalled(dir) {
    if (fs.existsSync(path.join(dir, 'node_modules'))) return;
    const hasLock = fs.existsSync(path.join(dir, 'package-lock.json'));
    const cmd = hasLock ? 'ci' : 'install';
    console.log(`Installing dependencies in ${path.relative(ROOT, dir) || '.'} (npm ${cmd})`);
    const res = spawnSync('npm', [cmd], { cwd: dir, stdio: 'inherit' });
    if (res.status !== 0) throw new Error(`npm ${cmd} failed in ${dir}`);
}

function runPrefixed(label, script, args) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [script, ...args], {
            cwd: path.dirname(script),
            env: process.env,
            stdio: ['inherit', 'pipe', 'pipe'],
        });
        const pipe = (stream, target) => {
            let buf = '';
            stream.on('data', (chunk) => {
                buf += chunk.toString();
                const lines = buf.split(/\r?\n/);
                buf = lines.pop();
                for (const line of lines) target.write(`[${label}] ${line}\n`);
            });
            stream.on('end', () => {
                if (buf) target.write(`[${label}] ${buf}\n`);
            });
        };
        pipe(child.stdout, process.stdout);
        pipe(child.stderr, process.stderr);
        child.on('error', (err) => {
            console.error(`[${label}] failed to start: ${err.message}`);
            resolve(1);
        });
        child.on('close', (code, signal) => resolve(signal ? 1 : code));
    });
}

async function stackOutputs(cfn, DescribeStacksCommand, stackName) {
    const res = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    const outputs = {};
    for (const o of res.Stacks[0].Outputs || []) outputs[o.OutputKey] = o.OutputValue;
    return outputs;
}

async function main() {
    const { stage, region } = parseArgs(process.argv.slice(2));
    assertProfile();

    ensureInstalled(ROOT);
    const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
    const { CloudFormationClient, DescribeStacksCommand } = require('@aws-sdk/client-cloudformation');

    let account;
    try {
        const id = await new STSClient({ region }).send(new GetCallerIdentityCommand({}));
        account = id.Account;
    } catch (err) {
        console.error(`AWS credentials are missing or expired (${err.name || err.message}).`);
        console.error(`Run: assume ${ALLOWED_PROFILE} --exec "node deploy.js --stage ${stage}"`);
        process.exit(1);
    }
    console.log(`Deploying ${SLUG}: account ${account}, region ${region}, stage ${stage}`);

    ensureInstalled(path.join(ROOT, 'backend'));
    ensureInstalled(path.join(ROOT, 'frontend'));

    const args = ['--stage', stage, '--region', region];

    const backendCode = await runPrefixed('backend', path.join(ROOT, 'backend', 'deploy.js'), args);
    if (backendCode !== 0) {
        console.error(`Backend deployment failed (exit ${backendCode}). Frontend not deployed.`);
        process.exit(1);
    }

    const frontendCode = await runPrefixed('frontend', path.join(ROOT, 'frontend', 'deploy.js'), args);
    if (frontendCode !== 0) {
        console.error(`Frontend deployment failed (exit ${frontendCode}).`);
        process.exit(1);
    }

    const cfn = new CloudFormationClient({ region });
    const api = await stackOutputs(cfn, DescribeStacksCommand, `${SLUG}-api-gateway-${stage}`);
    const site = await stackOutputs(cfn, DescribeStacksCommand, `${SLUG}-frontend-${stage}`);
    if (!api.ApiBaseUrl || !site.SiteUrl) throw new Error('Missing ApiBaseUrl or SiteUrl stack output');

    console.log('');
    console.log(`================ ${SLUG} deployed (account ${account}, ${region}, stage ${stage}) ================`);
    console.log(`  API:       ${api.ApiBaseUrl}`);
    console.log(`  Health:    ${api.ApiBaseUrl}/health`);
    console.log(`  Frontend:  ${site.SiteUrl}`);
}

main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
});
