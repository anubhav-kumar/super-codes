#!/usr/bin/env node
'use strict';

/**
 * Backend undeploy (backend-architecture.md section 15.3). DESTRUCTIVE.
 *
 *   assume CoderAnubhav95 --exec "node undeploy.js --stage prod --yes"
 *
 * 1. Resolve service stacks and the API Gateway stack (and its RestApiId).
 * 2. Empty S3 buckets owned by those stacks (skipping DeletionPolicy Retain).
 * 3. Delete the shared API stage.
 * 4. Delete service stacks in parallel and wait.
 * 5. Delete the API Gateway stack only if every service stack was deleted.
 */

const readline = require('readline');
const {
    CloudFormationClient,
    ListStackResourcesCommand,
    GetTemplateCommand,
    DeleteStackCommand,
    waitUntilStackDeleteComplete,
} = require('@aws-sdk/client-cloudformation');
const { S3Client } = require('@aws-sdk/client-s3');
const { APIGatewayClient, DeleteStageCommand } = require('@aws-sdk/client-api-gateway');
const {
    parseArgs,
    assertProfile,
    callerAccount,
    log,
    discoverServices,
    apiGatewayInfo,
    getStackOutputs,
    emptyBucket,
} = require('./scripts/common');

async function stackExists(cfn, stackName) {
    return (await getStackOutputs(cfn, stackName)) !== null;
}

async function ownedBuckets(cfn, stackName) {
    const tpl = await cfn.send(new GetTemplateCommand({ StackName: stackName, TemplateStage: 'Processed' }));
    const body = typeof tpl.TemplateBody === 'string' ? JSON.parse(tpl.TemplateBody) : tpl.TemplateBody;
    const resources = (body && body.Resources) || {};
    const buckets = [];
    let next;
    do {
        const page = await cfn.send(new ListStackResourcesCommand({ StackName: stackName, NextToken: next }));
        for (const r of page.StackResourceSummaries || []) {
            if (r.ResourceType !== 'AWS::S3::Bucket' || !r.PhysicalResourceId) continue;
            if (r.ResourceStatus === 'DELETE_COMPLETE') continue;
            const policy = resources[r.LogicalResourceId] && resources[r.LogicalResourceId].DeletionPolicy;
            buckets.push({ stackName, logicalId: r.LogicalResourceId, name: r.PhysicalResourceId, retain: policy === 'Retain' || policy === 'RetainExceptOnCreate' });
        }
        next = page.NextToken;
    } while (next);
    return buckets;
}

async function confirm(stage) {
    if (!process.stdin.isTTY) {
        console.error('Refusing to undeploy without --yes in a non-interactive shell.');
        process.exit(1);
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((r) => rl.question(`Type the stage name ("${stage}") to confirm deletion: `, r));
    rl.close();
    if (answer.trim() !== stage) {
        console.error('Not confirmed. Nothing was deleted.');
        process.exit(1);
    }
}

async function deleteStack(cfn, stackName, label) {
    log(label, `deleting stack ${stackName}`);
    await cfn.send(new DeleteStackCommand({ StackName: stackName }));
    await waitUntilStackDeleteComplete({ client: cfn, maxWaitTime: 3600 }, { StackName: stackName });
    log(label, `deleted ${stackName}`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const { stage, region } = args;
    assertProfile();
    const account = await callerAccount(region);

    const cfn = new CloudFormationClient({ region });
    const s3 = new S3Client({ region });
    const apigw = new APIGatewayClient({ region });

    const gateway = apiGatewayInfo();
    const gatewayStack = `${gateway.serviceName}-${stage}`;
    const gatewayOutputs = await getStackOutputs(cfn, gatewayStack);

    const services = [];
    for (const s of discoverServices()) {
        const stackName = `${s.serviceName}-${stage}`;
        if (await stackExists(cfn, stackName)) services.push({ ...s, stackName });
    }

    const stacks = [...services.map((s) => s.stackName), ...(gatewayOutputs ? [gatewayStack] : [])];
    const buckets = [];
    for (const st of stacks) buckets.push(...(await ownedBuckets(cfn, st)));

    console.log(`Backend UNDEPLOY: account ${account}, region ${region}, stage ${stage}`);
    console.log(`  Service stacks:    ${services.map((s) => s.stackName).join(', ') || '(none)'}`);
    console.log(`  API Gateway stack: ${gatewayOutputs ? gatewayStack : '(not found)'}`);
    for (const b of buckets) console.log(`  Bucket: ${b.name} (${b.stackName}/${b.logicalId})${b.retain ? ' RETAINED, will not be emptied' : ''}`);
    if (!stacks.length) {
        console.log('Nothing to delete.');
        return;
    }
    if (!args.yes) await confirm(stage);

    let failed = false;

    for (const b of buckets.filter((x) => !x.retain)) {
        try {
            await emptyBucket(s3, b.name, 'buckets');
        } catch (err) {
            if (err.name === 'NoSuchBucket') continue;
            failed = true;
            log('buckets', `FAILED to empty ${b.name}: ${err.message}`);
        }
    }
    if (failed) {
        console.error('Bucket emptying failed. No stacks were deleted.');
        process.exit(1);
    }

    if (gatewayOutputs && gatewayOutputs.RestApiId) {
        try {
            await apigw.send(new DeleteStageCommand({ restApiId: gatewayOutputs.RestApiId, stageName: stage }));
            log('api-gateway', `deleted stage ${stage} on ${gatewayOutputs.RestApiId}`);
        } catch (err) {
            if (err.name === 'NotFoundException') log('api-gateway', `stage ${stage} not found (ok)`);
            else {
                console.error(`Failed to delete stage ${stage}: ${err.message}`);
                process.exit(1);
            }
        }
    }

    const results = await Promise.all(
        services.map((s) =>
            deleteStack(cfn, s.stackName, s.name).then(
                () => ({ name: s.stackName, ok: true }),
                (err) => {
                    log(s.name, `FAILED: ${err.message}`);
                    return { name: s.stackName, ok: false };
                }
            )
        )
    );

    if (gatewayOutputs) {
        if (results.every((r) => r.ok)) {
            try {
                await deleteStack(cfn, gatewayStack, 'api-gateway');
                results.push({ name: gatewayStack, ok: true });
            } catch (err) {
                log('api-gateway', `FAILED: ${err.message}`);
                results.push({ name: gatewayStack, ok: false });
            }
        } else {
            log('api-gateway', `kept ${gatewayStack} because a service stack failed to delete`);
            results.push({ name: gatewayStack, ok: false });
        }
    }

    console.log('');
    console.log(`================ Undeploy summary (account ${account}, ${region}, stage ${stage}) ================`);
    for (const r of results) console.log(`  ${r.ok ? 'DELETED' : 'FAILED '} ${r.name}`);
    if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
});
