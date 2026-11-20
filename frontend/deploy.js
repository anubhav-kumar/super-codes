#!/usr/bin/env node
/**
 * Frontend deploy (frontend-architecture.md section 11.2).
 *
 *   assume CoderAnubhav95 --exec "node deploy.js --stage prod"
 *
 * 1. Resolve the API base URL from the backend stack output ApiBaseUrl (or API_BASE_URL env override).
 * 2. Deploy the hosting stack (S3 + CloudFront) and read its outputs.
 * 3. Build with VITE_API_BASE_URL set only in the build child process.
 * 4. Upload dist/: assets and static files first, entry files last.
 * 5. Invalidate the entry files on CloudFront and wait.
 */

import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand, waitUntilInvalidationCompleted } from '@aws-sdk/client-cloudfront';
import { FRONTEND_DIR, SLUG, parseArgs, assertProfile, callerAccount, log, runServerless, getStackOutputs } from './scripts/common.js';

const DIST = path.join(FRONTEND_DIR, 'dist');

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
};

function isEntryFile(key) {
    return (
        key === 'index.html' ||
        key === 'sw.js' ||
        key === 'registerSW.js' ||
        key === 'manifest.webmanifest' ||
        /^workbox-[^/]+\.js$/.test(key)
    );
}

function cacheControlFor(key) {
    if (isEntryFile(key)) return 'no-cache';
    if (key.startsWith('assets/')) return 'public, max-age=31536000, immutable';
    return 'public, max-age=86400';
}

function listFiles(dir, base = dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listFiles(full, base));
        else out.push(path.relative(base, full).split(path.sep).join('/'));
    }
    return out;
}

async function uploadAll(s3, bucket, keys) {
    const queue = [...keys];
    const worker = async () => {
        while (queue.length) {
            const key = queue.shift();
            const ext = path.extname(key).toLowerCase();
            await s3.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: key,
                    Body: fs.readFileSync(path.join(DIST, key)),
                    ContentType: CONTENT_TYPES[ext] || 'application/octet-stream',
                    CacheControl: cacheControlFor(key),
                })
            );
            log('upload', `${key}  (${cacheControlFor(key)})`);
        }
    };
    await Promise.all(Array.from({ length: Math.min(8, keys.length) }, worker));
}

async function resolveApiBaseUrl(cfn, stage, region) {
    if (process.env.API_BASE_URL) {
        log('api', `using API_BASE_URL override: ${process.env.API_BASE_URL}`);
        return process.env.API_BASE_URL.replace(/\/+$/, '');
    }
    const stackName = `${SLUG}-api-gateway-${stage}`;
    const outputs = await getStackOutputs(cfn, stackName);
    if (!outputs || !outputs.ApiBaseUrl) {
        throw new Error(
            `Stack ${stackName} or its ApiBaseUrl output was not found in ${region}. ` +
                `Deploy the backend first for stage "${stage}" and region "${region}".`
        );
    }
    return outputs.ApiBaseUrl.replace(/\/+$/, '');
}

function run(cmd, args, env) {
    const res = spawnSync(cmd, args, { cwd: FRONTEND_DIR, stdio: 'inherit', env });
    if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${res.status})`);
}

async function main() {
    const { stage, region } = parseArgs(process.argv.slice(2));
    assertProfile();
    const account = await callerAccount(region);
    const stackName = `${SLUG}-frontend-${stage}`;
    console.log(`Frontend deploy: account ${account}, region ${region}, stage ${stage}, stack ${stackName}`);

    const cfn = new CloudFormationClient({ region });

    // 1. API base URL
    const apiBaseUrl = await resolveApiBaseUrl(cfn, stage, region);
    log('api', `ApiBaseUrl = ${apiBaseUrl}`);

    // 2. Hosting stack
    const { code } = await runServerless('hosting', path.join(FRONTEND_DIR, 'infra', 'hosting'), ['deploy', '--stage', stage, '--region', region]);
    if (code !== 0) throw new Error(`Hosting stack ${stackName} failed to deploy`);
    const outputs = await getStackOutputs(cfn, stackName);
    if (!outputs || !outputs.BucketName || !outputs.DistributionId || !outputs.SiteUrl) {
        throw new Error(`Stack ${stackName} is missing BucketName, DistributionId or SiteUrl outputs`);
    }

    // 3. Build
    if (!fs.existsSync(path.join(FRONTEND_DIR, 'node_modules'))) run('npm', ['ci']);
    fs.rmSync(DIST, { recursive: true, force: true });
    run('npm', ['run', 'build'], { ...process.env, VITE_API_BASE_URL: apiBaseUrl });

    // 4. Upload: everything except entry files, then entry files.
    const s3 = new S3Client({ region });
    const files = listFiles(DIST);
    const entries = files.filter(isEntryFile);
    const rest = files.filter((k) => !isEntryFile(k));
    log('upload', `pass 1: ${rest.length} assets/static files to ${outputs.BucketName}`);
    await uploadAll(s3, outputs.BucketName, rest);
    log('upload', `pass 2: ${entries.length} entry files`);
    await uploadAll(s3, outputs.BucketName, entries);

    // 5. Invalidate entry files.
    const cloudfront = new CloudFrontClient({ region });
    const paths = ['/', '/index.html', '/sw.js', '/registerSW.js', '/manifest.webmanifest'];
    const inv = await cloudfront.send(
        new CreateInvalidationCommand({
            DistributionId: outputs.DistributionId,
            InvalidationBatch: { CallerReference: `deploy-${Date.now()}`, Paths: { Quantity: paths.length, Items: paths } },
        })
    );
    log('cloudfront', `invalidation ${inv.Invalidation.Id} created, waiting`);
    await waitUntilInvalidationCompleted(
        { client: cloudfront, maxWaitTime: 1200 },
        { DistributionId: outputs.DistributionId, Id: inv.Invalidation.Id }
    );
    log('cloudfront', 'invalidation completed');

    console.log('');
    console.log(`================ Frontend (account ${account}, ${region}, stage ${stage}) ================`);
    console.log(`  Stack:     ${stackName}`);
    console.log(`  Bucket:    ${outputs.BucketName}`);
    console.log(`  API:       ${apiBaseUrl}`);
    console.log(`  Site URL:  ${outputs.SiteUrl}`);
}

main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
});
