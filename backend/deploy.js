#!/usr/bin/env node
'use strict';

/**
 * Backend deploy (backend-architecture.md section 15.2).
 *
 *   assume CoderAnubhav95 --exec "node deploy.js --stage prod"                 # API Gateway + all services
 *   assume CoderAnubhav95 --exec "node deploy.js --stage prod health"          # API Gateway + named services
 *
 * Phase 1: deploy the shared API Gateway stack and wait.
 * Phase 2: deploy the selected services in parallel (retrying API Gateway throttling/conflicts).
 * Phase 3: print the API Gateway outputs read from CloudFormation.
 */

const {
    parseArgs,
    assertProfile,
    callerAccount,
    log,
    discoverServices,
    apiGatewayInfo,
    runServerless,
    getStackOutputs,
} = require('./scripts/common');

const RETRYABLE = /TooManyRequestsException|ConflictException|Too Many Requests|Rate exceeded/i;
const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deployUnit(unit, stage, region) {
    const stackName = `${unit.serviceName}-${stage}`;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        log(unit.name, `deploying stack ${stackName} (attempt ${attempt}/${MAX_ATTEMPTS})`);
        const { code, output } = await runServerless(unit.name, unit.dir, ['deploy', '--stage', stage, '--region', region]);
        if (code === 0) {
            log(unit.name, `deployed ${stackName}`);
            return { unit, stackName, ok: true };
        }
        if (attempt < MAX_ATTEMPTS && RETRYABLE.test(output)) {
            const wait = 5000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 2000);
            log(unit.name, `API Gateway throttling/conflict, retrying in ${Math.round(wait / 1000)}s`);
            await sleep(wait);
            continue;
        }
        log(unit.name, `FAILED ${stackName} (exit ${code})`);
        return { unit, stackName, ok: false };
    }
    return { unit, stackName, ok: false };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const { stage, region } = args;
    assertProfile();

    const all = discoverServices();
    const unknown = args.positional.filter((n) => !all.some((s) => s.name === n));
    if (unknown.length) {
        console.error(`Unknown service(s): ${unknown.join(', ')}. Known: ${all.map((s) => s.name).join(', ') || '(none)'}`);
        process.exit(1);
    }
    const selected = args.positional.length ? all.filter((s) => args.positional.includes(s.name)) : all;

    const account = await callerAccount(region);
    const gateway = apiGatewayInfo();
    const gatewayStack = `${gateway.serviceName}-${stage}`;
    console.log(`Backend deploy: account ${account}, region ${region}, stage ${stage}`);
    console.log(`  API Gateway stack: ${gatewayStack}`);
    console.log(`  Services: ${selected.map((s) => s.name).join(', ') || '(none)'}`);

    // Phase 1
    const gw = await deployUnit(gateway, stage, region);
    const results = [];
    if (gw.ok) {
        // Phase 2
        results.push(...(await Promise.all(selected.map((s) => deployUnit(s, stage, region)))));
    } else {
        console.error('API Gateway stack failed. No services were deployed.');
    }

    console.log('');
    console.log(`================ Deployment summary (account ${account}, ${region}, stage ${stage}) ================`);
    for (const r of [gw, ...results]) {
        console.log(`  ${r.ok ? 'OK  ' : 'FAIL'} ${r.unit.name.padEnd(14)} ${r.stackName}${r.ok ? '' : '   (see log above)'}`);
    }

    // Phase 3
    const { CloudFormationClient } = require('@aws-sdk/client-cloudformation');
    const outputs = await getStackOutputs(new CloudFormationClient({ region }), gatewayStack);
    if (outputs) {
        const api = {
            stack: gatewayStack,
            apiHost: outputs.ApiHost,
            apiBaseUrl: outputs.ApiBaseUrl,
            routes: results.filter((r) => r.ok).map((r) => ({ service: r.unit.name, url: `${outputs.ApiBaseUrl}/${r.unit.name}` })),
        };
        console.log('');
        console.log('================ API Gateway ================');
        console.log(`  Host:      ${api.apiHost}`);
        console.log(`  Base URL:  ${api.apiBaseUrl}`);
        console.log('  Routes:');
        for (const r of api.routes) console.log(`    ${r.service.padEnd(12)} ${r.url}`);
        if (args.json) console.log(JSON.stringify(api));
    }

    if (!gw.ok || results.some((r) => !r.ok)) process.exit(1);
}

main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
});
