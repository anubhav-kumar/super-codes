'use strict';

/**
 * Creates (or with --overwrite, resets) a staff account in ca-crm-auth-<stage>-users.
 *
 *   cd backend
 *   assume CoderAnubhav95 --exec "node scripts/create-user.js --stage prod --email a@firm.in --name 'Asha Rao'"
 *
 * The password is read from the terminal twice with echo off; it is never taken as an argument.
 * --overwrite replaces name and password of an existing account and keeps its userId.
 */

const crypto = require('crypto');
const { SLUG, assertProfile, callerAccount } = require('./common');
const { hashPassword } = require('../services/auth/utils/password');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseArgs(argv) {
    const out = { stage: 'prod', region: 'ap-southeast-1', email: null, name: null, overwrite: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const [key, inline] = arg.startsWith('--') && arg.includes('=') ? arg.split(/=(.*)/s) : [arg, undefined];
        const value = () => (inline !== undefined ? inline : argv[++i]);
        if (key === '--stage') out.stage = value();
        else if (key === '--region') out.region = value();
        else if (key === '--email') out.email = value();
        else if (key === '--name') out.name = value();
        else if (key === '--overwrite') out.overwrite = true;
        else if (key === '--password') throw new Error('The password is never accepted as an argument; you will be prompted');
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!out.stage || !out.region) throw new Error('--stage and --region need a value');
    out.email = (out.email || '').trim().toLowerCase();
    out.name = (out.name || '').trim();
    if (!out.email || out.email.length > 254 || !EMAIL.test(out.email)) throw new Error('--email must be a valid email');
    if (!out.name || out.name.length > 100) throw new Error('--name is required (1-100 characters)');
    return out;
}

/** Reads one line from the TTY without echoing it. */
function promptHidden(question) {
    return new Promise((resolve, reject) => {
        const { stdin, stdout } = process;
        if (!stdin.isTTY) {
            reject(new Error('A terminal is required to type the password'));
            return;
        }
        stdout.write(question);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');
        let input = '';
        const done = (err) => {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener('data', onData);
            stdout.write('\n');
            if (err) reject(err);
            else resolve(input);
        };
        const onData = (chunk) => {
            for (const ch of chunk) {
                if (ch === '\r' || ch === '\n' || ch === '\u0004') return done();
                if (ch === '\u0003') return done(new Error('Cancelled'));
                if (ch === '\u007f' || ch === '\b') input = input.slice(0, -1);
                else input += ch;
            }
            return undefined;
        };
        stdin.on('data', onData);
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    assertProfile();

    const password = await promptHidden('Password (min 8 characters): ');
    if (password.length < 8 || password.length > 200) throw new Error('Password must be 8-200 characters');
    const again = await promptHidden('Repeat password: ');
    if (again !== password) throw new Error('Passwords do not match');

    const account = await callerAccount(args.region);
    const tableName = `${SLUG}-auth-${args.stage}-users`;
    console.log(`Account ${account}, region ${args.region}, table ${tableName}`);

    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
    const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: args.region }));

    const existing = (await doc.send(new GetCommand({ TableName: tableName, Key: { email: args.email }, ConsistentRead: true })))
        .Item;
    if (existing && !args.overwrite) throw new Error(`An account for ${args.email} already exists (use --overwrite to reset it)`);

    const now = new Date().toISOString();
    const item = {
        email: args.email,
        userId: existing ? existing.userId : crypto.randomUUID(),
        name: args.name,
        passwordHash: await hashPassword(password),
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
    };
    await doc.send(
        new PutCommand({
            TableName: tableName,
            Item: item,
            ...(existing ? {} : { ConditionExpression: 'attribute_not_exists(email)' }),
        })
    );
    console.log(`${existing ? 'Updated' : 'Created'} account ${args.email} (userId ${item.userId})`);
}

main().catch((err) => {
    console.error(err.name === 'ConditionalCheckFailedException' ? 'The account was created by someone else just now' : err.message);
    process.exit(1);
});
