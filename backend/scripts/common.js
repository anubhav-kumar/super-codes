'use strict';

/**
 * Helpers shared by backend/deploy.js and backend/undeploy.js.
 * Credentials come only from the environment set up by `assume CoderAnubhav95`.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const SLUG = 'ca-crm';
const ALLOWED_PROFILE = 'CoderAnubhav95';
const BACKEND_DIR = path.resolve(__dirname, '..');

function parseArgs(argv) {
    const out = { stage: 'prod', region: 'ap-southeast-1', yes: false, json: false, positional: [] };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--stage') out.stage = argv[++i];
        else if (arg.startsWith('--stage=')) out.stage = arg.slice('--stage='.length);
        else if (arg === '--region') out.region = argv[++i];
        else if (arg.startsWith('--region=')) out.region = arg.slice('--region='.length);
        else if (arg === '--yes' || arg === '-y') out.yes = true;
        else if (arg === '--json') out.json = true;
        else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
        else out.positional.push(arg);
    }
    if (!out.stage || !out.region) throw new Error('--stage and --region need a value');
    return out;
}

function assertProfile() {
    for (const name of ['AWS_PROFILE', 'GRANTED_AWS_ROLE_PROFILE']) {
        const value = process.env[name];
        if (value && value !== ALLOWED_PROFILE) {
            console.error(`Refusing to run: ${name} is "${value}". Only "${ALLOWED_PROFILE}" may be used.`);
            process.exit(1);
        }
    }
}

async function callerAccount(region) {
    const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
    try {
        const id = await new STSClient({ region }).send(new GetCallerIdentityCommand({}));
        return id.Account;
    } catch (err) {
        console.error(`AWS credentials are missing or expired (${err.name || err.message}).`);
        console.error(`Run: assume ${ALLOWED_PROFILE} --exec "node deploy.js --stage prod"`);
        process.exit(1);
    }
}

function ts() {
    return new Date().toISOString().slice(11, 19);
}

function log(label, msg) {
    console.log(`${ts()} [${label}] ${msg}`);
}

/** Reads the `service:` name from a serverless.yml without a YAML dependency. */
function readServiceName(serverlessYmlPath) {
    const text = fs.readFileSync(serverlessYmlPath, 'utf8');
    const match = text.match(/^service:\s*['"]?([A-Za-z0-9-]+)['"]?\s*$/m);
    if (!match) throw new Error(`No "service:" name in ${serverlessYmlPath}`);
    return match[1];
}

function discoverServices() {
    const servicesDir = path.join(BACKEND_DIR, 'services');
    if (!fs.existsSync(servicesDir)) return [];
    return fs
        .readdirSync(servicesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && fs.existsSync(path.join(servicesDir, d.name, 'serverless.yml')))
        .map((d) => {
            const dir = path.join(servicesDir, d.name);
            return { name: d.name, dir, serviceName: readServiceName(path.join(dir, 'serverless.yml')) };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

function apiGatewayInfo() {
    const dir = path.join(BACKEND_DIR, 'infra', 'api-gateway');
    return { name: 'api-gateway', dir, serviceName: readServiceName(path.join(dir, 'serverless.yml')) };
}

/**
 * Runs the locally installed Serverless Framework v3 (backend/node_modules) in `cwd`.
 * Output lines are prefixed with the label. Resolves { code, output }.
 */
function runServerless(label, cwd, args) {
    const bin = require.resolve('serverless/bin/serverless.js', { paths: [BACKEND_DIR] });
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [bin, ...args], {
            cwd,
            env: { ...process.env, SLS_TELEMETRY_DISABLED: '1', SLS_NOTIFICATIONS_MODE: 'off' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        const pipe = (stream, target) => {
            let buf = '';
            stream.on('data', (chunk) => {
                const text = chunk.toString();
                output += text;
                buf += text;
                const lines = buf.split(/\r?\n/);
                buf = lines.pop();
                for (const line of lines) if (line.trim()) target.write(`${ts()} [${label}] ${line}\n`);
            });
            stream.on('end', () => {
                if (buf.trim()) target.write(`${ts()} [${label}] ${buf}\n`);
            });
        };
        pipe(child.stdout, process.stdout);
        pipe(child.stderr, process.stderr);
        child.on('error', (err) => resolve({ code: 1, output: `${output}\n${err.message}` }));
        child.on('close', (code, signal) => resolve({ code: signal ? 1 : code, output }));
    });
}

async function getStackOutputs(cfn, stackName) {
    const { DescribeStacksCommand } = require('@aws-sdk/client-cloudformation');
    try {
        const res = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
        const outputs = {};
        for (const o of res.Stacks[0].Outputs || []) outputs[o.OutputKey] = o.OutputValue;
        return outputs;
    } catch (err) {
        if (/does not exist/.test(err.message || '')) return null;
        throw err;
    }
}

/** Empties a bucket completely: versions, delete markers and incomplete multipart uploads. */
async function emptyBucket(s3, bucket, label) {
    const {
        ListObjectVersionsCommand,
        DeleteObjectsCommand,
        ListMultipartUploadsCommand,
        AbortMultipartUploadCommand,
    } = require('@aws-sdk/client-s3');

    let deleted = 0;
    let keyMarker;
    let versionIdMarker;
    do {
        const page = await s3.send(
            new ListObjectVersionsCommand({ Bucket: bucket, KeyMarker: keyMarker, VersionIdMarker: versionIdMarker })
        );
        const objects = [...(page.Versions || []), ...(page.DeleteMarkers || [])].map((v) => ({
            Key: v.Key,
            VersionId: v.VersionId,
        }));
        for (let i = 0; i < objects.length; i += 1000) {
            const batch = objects.slice(i, i + 1000);
            const res = await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch, Quiet: true } }));
            if (res.Errors && res.Errors.length) {
                throw new Error(`Failed to delete ${res.Errors.length} objects from ${bucket}: ${res.Errors[0].Message}`);
            }
            deleted += batch.length;
        }
        keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
        versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker);

    let aborted = 0;
    let uploadKeyMarker;
    let uploadIdMarker;
    do {
        const page = await s3.send(
            new ListMultipartUploadsCommand({ Bucket: bucket, KeyMarker: uploadKeyMarker, UploadIdMarker: uploadIdMarker })
        );
        for (const u of page.Uploads || []) {
            await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: u.Key, UploadId: u.UploadId }));
            aborted += 1;
        }
        uploadKeyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
        uploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined;
    } while (uploadKeyMarker);

    log(label, `emptied bucket ${bucket} (${deleted} object versions/markers, ${aborted} multipart uploads)`);
}

module.exports = {
    SLUG,
    ALLOWED_PROFILE,
    BACKEND_DIR,
    parseArgs,
    assertProfile,
    callerAccount,
    log,
    discoverServices,
    apiGatewayInfo,
    runServerless,
    getStackOutputs,
    emptyBucket,
};
