'use strict';

const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { database } = require('common');
const { getPayments } = require('./invoice');

const PAYMENT_COUNTER = 'PAYMENT';
const OPTIONAL_FIELDS = ['link', 'expiryDate', 'paymentDate', 'transactionReference'];

function paymentNumber(seq) {
    return `PAY-${String(seq).padStart(4, '0')}`;
}

/** Builds a new Payments item. Null optional fields are left out (absent attributes). */
function buildNewPaymentItem(invoiceId, seq, fields, createdDate, now) {
    const item = {
        invoiceId,
        id: fields.id,
        paymentNumber: paymentNumber(seq),
        paymentSeq: seq,
        amountPaise: fields.amountPaise,
        createdDate,
        status: fields.status,
        createdAt: now,
        updatedAt: now,
    };
    for (const attr of OPTIONAL_FIELDS) {
        if (fields[attr] !== null && fields[attr] !== undefined) item[attr] = fields[attr];
    }
    return item;
}

async function getPayment(invoiceId, id, { consistent = false } = {}) {
    const res = await database.doc.send(
        new GetCommand({ TableName: process.env.PAYMENTS_TABLE, Key: { invoiceId, id }, ConsistentRead: consistent })
    );
    return res.Item || null;
}

/** Increments the PAYMENT counter and returns the new sequence number (first call gives 1). */
async function nextPaymentSeq() {
    const res = await database.doc.send(
        new UpdateCommand({
            TableName: process.env.COUNTERS_TABLE,
            Key: { name: PAYMENT_COUNTER },
            UpdateExpression: 'ADD #seq :one',
            ExpressionAttributeNames: { '#seq': 'seq' },
            ExpressionAttributeValues: { ':one': 1 },
            ReturnValues: 'UPDATED_NEW',
        })
    );
    return Number(res.Attributes.seq);
}

/**
 * Updates the editable fields of an existing payment with UpdateItem. paymentNumber, paymentSeq,
 * createdDate and createdAt never change. REMOVEs optional fields that are null.
 * Returns the full new item, or null when the payment does not exist.
 */
async function updatePaymentItem(invoiceId, id, fields, now) {
    const set = { amountPaise: fields.amountPaise, status: fields.status, updatedAt: now };
    const remove = [];
    for (const attr of OPTIONAL_FIELDS) {
        if (fields[attr] !== null && fields[attr] !== undefined) set[attr] = fields[attr];
        else remove.push(attr);
    }

    const names = { '#id': 'id' };
    const values = {};
    const setParts = Object.entries(set).map(([attr, value], i) => {
        names[`#s${i}`] = attr;
        values[`:s${i}`] = value;
        return `#s${i} = :s${i}`;
    });
    const removeParts = remove.map((attr, i) => {
        names[`#r${i}`] = attr;
        return `#r${i}`;
    });

    let expression = `SET ${setParts.join(', ')}`;
    if (removeParts.length) expression += ` REMOVE ${removeParts.join(', ')}`;

    try {
        const res = await database.doc.send(
            new UpdateCommand({
                TableName: process.env.PAYMENTS_TABLE,
                Key: { invoiceId, id },
                UpdateExpression: expression,
                ConditionExpression: 'attribute_exists(#id)',
                ExpressionAttributeNames: names,
                ExpressionAttributeValues: values,
                ReturnValues: 'ALL_NEW',
            })
        );
        return res.Attributes;
    } catch (err) {
        if (err && err.name === 'ConditionalCheckFailedException') return null;
        throw err;
    }
}

/**
 * Recomputes the invoice's receivedPaise as the sum of its PAID payments (consistent read) and
 * writes it with UpdateItem (SET receivedPaise, updatedAt only). Two simultaneous payment writes
 * on one invoice can leave a stale sum until the next payment write (accepted, backend plan F-07).
 */
async function recomputeReceived(invoiceId, now) {
    const payments = await getPayments(invoiceId, { consistent: true });
    const receivedPaise = payments
        .filter((p) => p.status === 'PAID')
        .reduce((sum, p) => sum + (Number(p.amountPaise) || 0), 0);
    try {
        await database.doc.send(
            new UpdateCommand({
                TableName: process.env.INVOICES_TABLE,
                Key: { id: invoiceId },
                UpdateExpression: 'SET receivedPaise = :received, updatedAt = :now',
                ConditionExpression: 'attribute_exists(id)',
                ExpressionAttributeValues: { ':received': receivedPaise, ':now': now },
            })
        );
    } catch (err) {
        if (!(err && err.name === 'ConditionalCheckFailedException')) throw err;
    }
    return receivedPaise;
}

module.exports = { buildNewPaymentItem, getPayment, nextPaymentSeq, updatePaymentItem, recomputeReceived };
