#!/usr/bin/env node
/**
 * Deploy the ec2-stack.yaml CloudFormation template and print the SSH command
 * for connecting to the resulting EC2 instance.
 *
 * Requires: @aws-sdk/client-cloudformation (`npm install @aws-sdk/client-cloudformation`)
 * and AWS credentials configured in the environment (env vars, shared
 * credentials file, or an assumed role/profile).
 *
 *     node infra/deploy.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CloudFormationClient,
  DescribeStacksCommand,
  CreateStackCommand,
  UpdateStackCommand,
  DeleteStackCommand,
  waitUntilStackCreateComplete,
  waitUntilStackUpdateComplete,
  waitUntilStackDeleteComplete,
} = require('@aws-sdk/client-cloudformation');

// ---------------------------------------------------------------------------
// ASSUMED INPUTS — change these to suit your environment.
// ---------------------------------------------------------------------------
const CONFIG = {
  // CloudFormation
  stackName: 'housie-ec2',
  region: 'ap-south-1',
  templateFile: 'ec2-stack.yaml', // resolved relative to this script

  // Template parameters (must match Parameters in ec2-stack.yaml).
  // Anything left out here falls back to the template's own defaults.
  parameters: {
    InstanceType: 't3.micro',
    KeyPairName: 'UbuntuGPUKeyPair',
    SSHLocation: '0.0.0.0/0',
    // VpcCidr: '10.0.0.0/16',
    // PublicSubnetCidr: '10.0.1.0/24',
    AmiId: 'ami-09b8e07b064480ad8',
  },

  // SSH connection assumptions used only for printing the connect command.
  sshUser: 'ubuntu', // Ubuntu AMI default login user
  keyFile: 'UbuntuGPUKeyPair.pem', // local path to the private key
};

// Max time (seconds) to wait for a stack operation to settle.
const WAIT_SECONDS = 1800;
// ---------------------------------------------------------------------------

const toCfnParameters = (params) => Object.entries(params).map(
  ([ParameterKey, value]) => ({ ParameterKey, ParameterValue: String(value) }),
);

const expandHome = (p) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

async function stackExists(cfn, stackName) {
  let resp;
  try {
    resp = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      return false;
    }
    throw err;
  }
  const status = resp.Stacks[0].StackStatus;
  // A stack stuck in ROLLBACK_COMPLETE can only be deleted, not updated.
  if (status === 'ROLLBACK_COMPLETE') {
    console.log(`Stack '${stackName}' is in ROLLBACK_COMPLETE — deleting it first.`);
    await cfn.send(new DeleteStackCommand({ StackName: stackName }));
    await waitUntilStackDeleteComplete(
      { client: cfn, maxWaitTime: WAIT_SECONDS },
      { StackName: stackName },
    );
    return false;
  }
  return true;
}

async function deploy(cfn, stackName, templateBody, parameters) {
  const common = {
    StackName: stackName,
    TemplateBody: templateBody,
    Parameters: toCfnParameters(parameters),
    // The template creates IAM resources (the instance role/profile that grants
    // S3 deployment-bucket read access), so this capability is required.
    Capabilities: ['CAPABILITY_NAMED_IAM'],
  };

  let waiter;
  if (await stackExists(cfn, stackName)) {
    console.log(`Updating existing stack '${stackName}'...`);
    try {
      await cfn.send(new UpdateStackCommand(common));
    } catch (err) {
      if (err.message && err.message.includes('No updates are to be performed')) {
        console.log('No changes detected — stack is already up to date.');
        return;
      }
      throw err;
    }
    waiter = waitUntilStackUpdateComplete;
  } else {
    console.log(`Creating new stack '${stackName}'...`);
    await cfn.send(new CreateStackCommand(common));
    waiter = waitUntilStackCreateComplete;
  }

  console.log('Waiting for the stack operation to complete (this can take a few minutes)...');
  await waiter({ client: cfn, maxWaitTime: WAIT_SECONDS }, { StackName: stackName });
  console.log('Stack operation completed successfully.');
}

async function getOutputs(cfn, stackName) {
  const resp = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
  const outputs = resp.Stacks[0].Outputs || [];
  return Object.fromEntries(outputs.map((o) => [o.OutputKey, o.OutputValue]));
}

async function main() {
  const templatePath = path.join(__dirname, CONFIG.templateFile);
  const templateBody = fs.readFileSync(templatePath, 'utf-8');

  const cfn = new CloudFormationClient({ region: CONFIG.region });

  try {
    await deploy(cfn, CONFIG.stackName, templateBody, CONFIG.parameters);
  } catch (err) {
    console.error(`\nDeployment failed: ${err.message || err}`);
    process.exit(1);
  }

  const outputs = await getOutputs(cfn, CONFIG.stackName);

  // Prefer the public DNS name; fall back to the public IP.
  const host = outputs.PublicDnsName || outputs.PublicIp;
  if (!host) {
    console.error('\nStack deployed, but no PublicDnsName/PublicIp output was found.');
    process.exit(1);
  }

  const keyFile = expandHome(CONFIG.keyFile);
  const sshCommand = `ssh -i ${keyFile} ${CONFIG.sshUser}@${host}`;

  console.log(`\n${'='.repeat(60)}`);
  console.log('EC2 instance is ready. Connect with:');
  console.log(`\n    ${sshCommand}\n`);
  console.log('='.repeat(60));
}

main();
