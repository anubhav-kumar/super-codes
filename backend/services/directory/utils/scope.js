'use strict';

/**
 * Member client scope for the directory routes (F-55). A member sees only the clients of orders
 * their linked Worker is assigned to: each order's clientId (person or company by clientType) and
 * its receivedFromId (always a person). Admins see everything.
 */

const scope = require('common/scope');

/**
 * null for an admin (no scope). For a member: { orderIds, personIds, companyIds } (Sets), all empty
 * when no Worker is linked.
 */
async function loadClientScope(user) {
    if (!scope.isMember(user)) return null;
    const orderIds = await scope.visibleOrderIds(user);
    const { personIds, companyIds } = await scope.visibleClients(user, orderIds);
    return { orderIds, personIds, companyIds };
}

/** True when the caller may open this person (always true for an admin, i.e. s === null). */
function canOpenPerson(s, id) {
    return s === null || s.personIds.has(id);
}

/** True when the caller may open this company (always true for an admin, i.e. s === null). */
function canOpenCompany(s, id) {
    return s === null || s.companyIds.has(id);
}

module.exports = { loadClientScope, canOpenPerson, canOpenCompany };
