'use strict';

/**
 * Creates (or with --overwrite, resets) a staff account in ca-crm-auth-<stage>-users.
 *
 *   cd backend
 *   assume CoderAnubhav95 --exec "node scripts/create-user.js --stage prod --email a@firm.in --name 'Asha Rao'"
 *   ... [--member] [--worker-id <uuid>] [--overwrite]
 *
 * The password is read from the terminal twice with echo off; it is never taken as an argument.
 * New accounts are admins unless --member is given.
 * --overwrite replaces name and password of an existing account, clears any temporary password and
 * keeps its userId, createdAt, role and Worker link. It also ends every session of that account:
 * sessionsValidAfter = now on the user (common auth refuses older sessions at once), then the
 * Sessions items are deleted (Sessions GSI byUserId) as cleanup. --member makes it a member; --worker-id replaces
 * the link. There is no flag to promote: use the Users screen.
 * --worker-id links the account to an existing ACTIVE Worker that is not linked to another account.
 * The user item and the WorkerLinks items are written in one transaction.
 */

const crypto = require('crypto');
const { SLUG, assertProfile, callerAccount } = require('./common');
const { hashPassword } = require('../services/auth/utils/password');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function parseArgs(argv) {
    const out = {
        stage: 'prod',
        region: 'ap-southeast-1',
        email: null,
        name: null,
        overwrite: false,
        member: false,
        workerId: null,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const [key, inline] = arg.startsWith('--') && arg.includes('=') ? arg.split(/=(.*)/s) : [arg, undefined];
        const value = () => (inline !== undefined ? inline : argv[++i]);
        if (key === '--stage') out.stage = value();
        else if (key === '--region') out.region = value();
        else if (key === '--email') out.email = value();
        else if (key === '--name') out.name = value();
        else if (key === '--overwrite') out.overwrite = true;
        else if (key === '--member') out.member = true;
        else if (key === '--worker-id') out.workerId = value();
        else if (key === '--password') throw new Error('The password is never accepted as an argument; you will be prompted');
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!out.stage || !out.region) throw new Error('--stage and --region need a value');
    out.email = (out.email || '').trim().toLowerCase();
    out.name = (out.name || '').trim();
    if (!out.email || out.email.length > 254 || !EMAIL.test(out.email)) throw new Error('--email must be a valid email');
    if (!out.name || out.name.length > 100) throw new Error('--name is required (1-100 characters)');
    if (out.workerId !== null) {
        out.workerId = String(out.workerId || '').trim();
        if (!UUID_V4.test(out.workerId)) throw new Error('--worker-id must be a lowercase UUID v4');
    }
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
    const linksTable = `${SLUG}-auth-${args.stage}-worker-links`;
    const workersTable = `${SLUG}-workers-${args.stage}-workers`;
    const sessionsTable = `${SLUG}-auth-${args.stage}-sessions`;
    console.log(`Account ${account}, region ${args.region}, table ${tableName}`);

    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const {
        DynamoDBDocumentClient,
        GetCommand,
        QueryCommand,
        DeleteCommand,
        TransactWriteCommand,
    } = require('@aws-sdk/lib-dynamodb');
    const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: args.region }));

    const existing = (await doc.send(new GetCommand({ TableName: tableName, Key: { email: args.email }, ConsistentRead: true })))
        .Item;
    if (existing && !args.overwrite) throw new Error(`An account for ${args.email} already exists (use --overwrite to reset it)`);

    const userId = existing ? existing.userId : crypto.randomUUID();
    // Users written before FR1 have no isAdmin and are admins; --overwrite keeps the role unless --member.
    const isAdmin = args.member ? false : existing ? existing.isAdmin !== false : true;
    const oldWorkerId = (existing && existing.workerId) || null;
    const workerId = args.workerId || oldWorkerId;

    if (args.workerId) {
        const worker = (
            await doc.send(new GetCommand({ TableName: workersTable, Key: { id: args.workerId }, ConsistentRead: true }))
        ).Item;
        if (!worker) throw new Error(`Worker ${args.workerId} not found`);
        if (worker.status === 'INACTIVE' && args.workerId !== oldWorkerId) throw new Error(`Worker ${args.workerId} is inactive`);
        const link = (
            await doc.send(new GetCommand({ TableName: linksTable, Key: { workerId: args.workerId }, ConsistentRead: true }))
        ).Item;
        if (link && link.userId !== userId) {
            const other = await doc.send(
                new QueryCommand({
                    TableName: tableName,
                    IndexName: 'byUserId',
                    KeyConditionExpression: 'userId = :id',
                    ExpressionAttributeValues: { ':id': link.userId },
                    ProjectionExpression: 'email',
                })
            );
            const otherEmail = (other.Items && other.Items[0] && other.Items[0].email) || `user ${link.userId}`;
            throw new Error(`Worker ${args.workerId} is already linked to ${otherEmail}`);
        }
    }

    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    const item = {
        email: args.email,
        userId,
        name: args.name,
        passwordHash,
        isAdmin,
        entity: 'USER',
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
    };
    if (workerId) item.workerId = workerId;
    // --overwrite ends every existing session of the account (checked on every request by common auth).
    if (existing) item.sessionsValidAfter = now;
    // passwordState / tempPasswordExpiresAt are left out: a full Put clears any temporary password.

    const items = [
        {
            Put: {
                TableName: tableName,
                Item: item,
                ...(existing
                    ? { ConditionExpression: 'userId = :me', ExpressionAttributeValues: { ':me': userId } }
                    : { ConditionExpression: 'attribute_not_exists(email)' }),
            },
        },
    ];
    if (workerId) {
        const linkItem = { workerId, userId, createdAt: now, updatedAt: now };
        items.push({
            Put: {
                TableName: linksTable,
                Item: linkItem,
                ConditionExpression: 'attribute_not_exists(workerId) OR userId = :me',
                ExpressionAttributeValues: { ':me': userId },
            },
        });
    }
    if (oldWorkerId && oldWorkerId !== workerId) {
        items.push({
            Delete: {
                TableName: linksTable,
                Key: { workerId: oldWorkerId },
                ConditionExpression: 'attribute_not_exists(workerId) OR userId = :me',
                ExpressionAttributeValues: { ':me': userId },
            },
        });
    }

    try {
        await doc.send(new TransactWriteCommand({ TransactItems: items }));
    } catch (err) {
        if (err.name === 'TransactionCanceledException') {
            const reasons = (err.CancellationReasons || []).map((r) => r && r.Code);
            if (reasons[0] === 'ConditionalCheckFailed') {
                throw new Error(existing ? 'The account was changed by someone else just now; run again' : 'The account was created by someone else just now');
            }
            if (reasons[1] === 'ConditionalCheckFailed') throw new Error(`Worker ${workerId} is already linked to another account`);
            if (reasons[2] === 'ConditionalCheckFailed') throw new Error('The old Worker link was changed by someone else just now; run again');
        }
        throw err;
    }
    let sessionsEnded = 0;
    if (existing) sessionsEnded = await deleteSessions(doc, { QueryCommand, DeleteCommand }, sessionsTable, userId);

    console.log(
        `${existing ? 'Updated' : 'Created'} account ${args.email} (userId ${userId}, ${isAdmin ? 'admin' : 'member'}, ` +
            `${workerId ? `worker ${workerId}` : 'no worker'})` +
            (existing ? `; all sessions ended (${sessionsEnded} deleted)` : '')
    );
}

/**
 * Deletes every Sessions item of a user (GSI byUserId), as services/auth/utils/sessions.js does.
 * Cleanup only: sessionsValidAfter already refuses them. Returns the number deleted.
 */
async function deleteSessions(doc, { QueryCommand, DeleteCommand }, sessionsTable, userId) {
    const hashes = [];
    let ExclusiveStartKey;
    do {
        const res = await doc.send(
            new QueryCommand({
                TableName: sessionsTable,
                IndexName: 'byUserId',
                KeyConditionExpression: 'userId = :id',
                ExpressionAttributeValues: { ':id': userId },
                ProjectionExpression: 'tokenHash',
                ExclusiveStartKey,
            })
        );
        for (const s of res.Items || []) if (s.tokenHash) hashes.push(s.tokenHash);
        ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    for (const tokenHash of new Set(hashes)) {
        await doc.send(new DeleteCommand({ TableName: sessionsTable, Key: { tokenHash } }));
    }
    return new Set(hashes).size;
}

main().catch((err) => {
    console.error(err.name === 'ConditionalCheckFailedException' ? 'The account was created by someone else just now' : err.message);
    process.exit(1);
});
