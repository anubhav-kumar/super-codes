#!/usr/bin/env node
/**
 * Frontend undeploy (frontend-architecture.md section 11.3). DESTRUCTIVE.
 *
 *   assume CoderAnubhav95 --exec "node undeploy.js --stage prod --yes"
 *
 * Empties only buckets that are resources of the hosting stack, then deletes the stack.
 */

import readline from 'node:readline';
import {
    CloudFormationClient,
    ListStackResourcesCommand,
    DeleteStackCommand,
    waitUntilStackDeleteComplete,
} from '@aws-sdk/client-cloudformation';
import { S3Client } from '@aws-sdk/client-s3';
import { SLUG, parseArgs, assertProfile, callerAccount, log, getStackOutputs, emptyBucket } from './scripts/common.js';

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const { stage, region } = args;
    assertProfile();
    const account = await callerAccount(region);
    const stackName = `${SLUG}-frontend-${stage}`;
    const cfn = new CloudFormationClient({ region });

    if ((await getStackOutputs(cfn, stackName)) === null) {
        console.log(`Stack ${stackName} not found in ${region}. Nothing to delete.`);
        return;
    }

    // Buckets that are resources of this stack (site bucket + Serverless deployment bucket).
    const buckets = [];
    let next;
    do {
        const page = await cfn.send(new ListStackResourcesCommand({ StackName: stackName, NextToken: next }));
        for (const r of page.StackResourceSummaries || []) {
            if (r.ResourceType === 'AWS::S3::Bucket' && r.PhysicalResourceId && r.ResourceStatus !== 'DELETE_COMPLETE') {
                buckets.push(r.PhysicalResourceId);
            }
        }
        next = page.NextToken;
    } while (next);

    console.log(`Frontend UNDEPLOY: account ${account}, region ${region}, stage ${stage}`);
    console.log(`  Stack:   ${stackName}`);
    for (const b of buckets) console.log(`  Bucket:  ${b}`);

    if (!args.yes) {
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

    const s3 = new S3Client({ region });
    for (const b of buckets) {
        try {
            await emptyBucket(s3, b, 'buckets');
        } catch (err) {
            if (err.name !== 'NoSuchBucket') throw err;
        }
    }

    log('hosting', `deleting stack ${stackName} (CloudFront deletion can take several minutes)`);
    await cfn.send(new DeleteStackCommand({ StackName: stackName }));
    await waitUntilStackDeleteComplete({ client: cfn, maxWaitTime: 3600 }, { StackName: stackName });
    log('hosting', `deleted ${stackName}`);

    console.log('');
    console.log(`================ Frontend undeploy summary (account ${account}, ${region}, stage ${stage}) ================`);
    console.log(`  DELETED ${stackName}`);
}

main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
});
