import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import sql from 'mssql';

/**
 * Owner-approved expired-organization access policy (17 November 2026),
 * proven over real HTTP against disposable Docker SQL Server only.
 *
 * Organization A is enrolled in management enforcement; organization B is not.
 * Every access-expanding writer is denied for A while expired or revoked
 * (403 MANAGEMENT_READ_ONLY, no row, membership, assignment, login or
 * invitation change) and succeeds while active or complimentary. Revocation,
 * demotion, assignment removal, profile edits and reads stay available after
 * expiry. Cross-organization requests stay denied, B is unaffected, and
 * client-supplied enforcement flags are ignored. Invitations use a counting
 * in-memory delivery: no email provider is contacted.
 */
export async function verifyAccessAdministrationExpiryAgainstDisposableSql({ pool, first, query }) {
  // Renter property/unit associations need their additive column.
  await pool.request().batch(fs.readFileSync(path.resolve('migrations/20260926_01_add_rentee_property_unit_associations.sql'), 'utf8'));
  const {createAuthRecord, issueAuthSession, createSessionAuthMiddleware} = await import('../src/api/auth/index.js');
  const {createMssqlRouter} = await import('../src/api/mssql/index.js');
  const {createPropertyAssignmentsRouter} = await import('../src/api/platform/propertyAssignmentsRouter.js');
  const {createInvitationRouter} = await import('../src/api/auth/invitationRouter.js');
  const {createPlatformRouter} = await import('../src/api/platform/router.js');
  const {BILLING_ACCOUNT, BILLING_PRICE} = await import('../src/api/managementBilling/contract.js');
  const id = value => String(value).toLowerCase();
  const unique = () => crypto.randomBytes(5).toString('hex');

  const organization = async label => {
    const tenant = await first(pool, "INSERT tenants(name,slug,status,[plan]) OUTPUT INSERTED.id VALUES(@label,@slug,'active','test')",
      {label, slug:`access-${unique()}`});
    const tenantId = id(tenant.id);
    const property = async name => id((await first(pool,
      "INSERT properties(tenant_id,name,status) OUTPUT INSERTED.id VALUES(@tenantId,@name,'available')", {tenantId, name})).id);
    const person = async (role, {membership = role, bundle = null, membershipStatus = 'active', userStatus = 'active', associations = '[]', login = false} = {}) => {
      const email = `access-${role}-${unique()}@example.invalid`;
      const authId = login ? crypto.randomUUID() : null;
      const user = await first(pool, `INSERT app_users(tenant_id,name,email,role,user_type,status,auth_id,associated_properties)
        OUTPUT INSERTED.id VALUES(@tenantId,@name,@email,@role,@role,@userStatus,@authId,@associations)`,
      {tenantId, name:`${label} ${role}`, email, role, userStatus, authId, associations});
      const appUserId = id(user.id);
      if (membership) {
        await query(pool, `INSERT tenant_memberships(tenant_id,app_user_id,role,permission_bundle,status,is_default)
          VALUES(@tenantId,@appUserId,@membership,@bundle,@membershipStatus,1)`, {tenantId, appUserId, membership, bundle, membershipStatus});
      }
      const token = login ? (await issueAuthSession(await createAuthRecord({authId, appUserId, email, role,
        password:crypto.randomBytes(24).toString('base64url')}))).accessToken : null;
      return {id:appUserId, email, token};
    };
    return {tenantId, property, person};
  };

  const A = await organization('Expired access organization');
  const B = await organization('Unenrolled access organization');
  const [p1, p2, p3] = [await A.property('A one'), await A.property('A two'), await A.property('A three')];
  const adminA = await A.person('admin', {login:true});
  const adminB = await B.person('admin', {login:true});
  const staff = await A.person('staff', {bundle:'maintenance'});
  const secondStaff = await A.person('staff', {bundle:'maintenance'});
  // Active staff reserved for the concurrency proof.
  const raceStaff = await A.person('staff', {bundle:'read_only'});
  const renter = await A.person('rentee', {associations:JSON.stringify([{propertyId:p1, unitId:null}])});
  const inactiveRenter = await A.person('rentee', {membershipStatus:'inactive'});
  const unlinked = await A.person('staff', {bundle:'read_only'});
  const dormant = await A.person('staff', {bundle:'read_only', userStatus:'inactive'});
  // No membership: a plain legacy user row that cleanup may delete outright.
  const removable = await A.person('staff', {membership:null});
  const foreignProperty = await B.property('B one');
  const assignment = async (propertyId, status) => id((await first(pool, `INSERT staff_property_assignments
    (tenant_id,propertyid,staff_user_id,status,assigned_by) OUTPUT INSERTED.id VALUES(@tenantId,@propertyId,@staffId,@status,@adminId)`,
  {tenantId:A.tenantId, propertyId, staffId:staff.id, status, adminId:adminA.id})).id);
  const activeAssignment = await assignment(p1, 'active');
  const inactiveAssignment = await assignment(p2, 'inactive');

  await query(pool, `INSERT dbo.management_billing_accounts(tenant_id,stripe_account_id,stripe_price_id,market,inventory_json)
    VALUES(@tenantId,@account,@price,'LK','[]')`, {tenantId:A.tenantId, account:BILLING_ACCOUNT, price:BILLING_PRICE});
  const states = {
    active:"subscription_status='active',initial_payment_verified=1,paid_through=DATEADD(DAY,1,SYSUTCDATETIME()),comp_type=NULL,comp_expires_at=NULL",
    complimentary:"subscription_status='pending',initial_payment_verified=0,paid_through=NULL,comp_type='ongoing',comp_expires_at=NULL",
    expired:"subscription_status='active',initial_payment_verified=1,paid_through=DATEADD(SECOND,-1,SYSUTCDATETIME()),comp_type=NULL,comp_expires_at=NULL",
    revoked:"subscription_status='pending',initial_payment_verified=0,paid_through=NULL,comp_type=NULL,comp_expires_at=NULL"
  };
  const setState = name => query(pool, `UPDATE dbo.management_billing_accounts SET grace_started_at=NULL,cancel_at_period_end=0,risk_hold=0,
    ${states[name]} WHERE tenant_id=@tenantId`, {tenantId:A.tenantId});

  const keys = ['MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED', 'MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS', 'MANAGEMENT_BILLING_SCHEMA_READY'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED:'true',
    MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS:A.tenantId, MANAGEMENT_BILLING_SCHEMA_READY:'true'});

  let invitationsSent = 0;
  // Optional in-process stall: lets the concurrency proof hold an expansion
  // in flight (inside the entitlement lock) until the test releases it.
  let invitationStall = null;
  const sendInvitation = async ({appUserId}) => {
    if (invitationStall) {invitationStall.entered(); await invitationStall.release;}
    invitationsSent += 1;
    return {expiresAt:'2030-01-01T00:00:00Z', delivery:{accepted:true},
      target:{appUserId, email:'fixture@example.invalid', name:'Fixture', intendedRole:'rentee', userType:'rentee'}};
  };
  const app = express();
  app.use(express.json());
  app.use(createSessionAuthMiddleware());
  app.use('/api/mssql', createMssqlRouter());
  app.use('/api/property-assignments', createPropertyAssignmentsRouter());
  app.use('/api/platform/auth', createInvitationRouter({sendInvitation}));
  app.use('/api/platform', createPlatformRouter());
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({error:error.message, code:error.code}));
  const server = await new Promise(resolve => {const listening = app.listen(0, '127.0.0.1', () => resolve(listening));});
  const call = async (method, route, body, who = adminA, tenantId = A.tenantId) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {method,
      headers:{'Content-Type':'application/json', Authorization:`Bearer ${who.token}`, 'x-tenant-id':tenantId},
      // Client-supplied enforcement flags must never matter.
      ...(body ? {body:JSON.stringify({...body, MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED:false})} : {})});
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = {text}; }
    return {status:response.status, json};
  };
  const rows = async (statement, params = {}) => JSON.stringify(await query(pool, statement, {tenantId:A.tenantId, ...params}));
  const snapshot = async () => ({
    users:await rows('SELECT * FROM app_users WHERE tenant_id=@tenantId ORDER BY id'),
    memberships:await rows('SELECT * FROM tenant_memberships WHERE tenant_id=@tenantId ORDER BY id'),
    assignments:await rows('SELECT * FROM staff_property_assignments WHERE tenant_id=@tenantId ORDER BY id'),
    allUsers:(await first(pool, 'SELECT COUNT(*) AS n FROM app_users')).n,
    allMemberships:(await first(pool, 'SELECT COUNT(*) AS n FROM tenant_memberships')).n,
    authUsers:(await first(pool, 'SELECT COUNT(*) AS n FROM auth_users')).n,
    invitationsSent
  });

  // Each expansion: the request plus a reset that restores the fixture after
  // an allowed run, so every state exercises the identical starting point.
  const reset = (statement, params = {}) => () => query(pool, statement, {tenantId:A.tenantId, ...params});
  const fresh = prefix => ({name:`${prefix} ${unique()}`, email:`${prefix.replace(/\W+/g, '-').toLowerCase()}-${unique()}@example.invalid`});
  const expansions = [
    ['add renter', () => call('POST', '/api/mssql/rentees', fresh('Added renter')), null],
    ['reactivate renter membership', () => call('PATCH', `/api/mssql/rentees/${inactiveRenter.id}/membership-status`, {status:'active'}),
      reset("UPDATE tenant_memberships SET status='inactive' WHERE tenant_id=@tenantId AND app_user_id=@userId", {userId:inactiveRenter.id})],
    ['extend renter property access', () => call('PUT', `/api/mssql/rentees/${renter.id}`,
      {associated_properties:[{propertyId:p1}, {propertyId:p2}]}),
    reset('UPDATE app_users SET associated_properties=@value WHERE id=@userId', {userId:renter.id, value:JSON.stringify([{propertyId:p1, unitId:null}])})],
    ['add team member', () => call('POST', '/api/mssql/team-members', {...fresh('Added staff'), permission_bundle:'read_only'}), null],
    ['grant wider team permissions', () => call('PUT', `/api/mssql/team-members/${staff.id}`, {permission_bundle:'finance'}),
      reset("UPDATE tenant_memberships SET permission_bundle='maintenance' WHERE tenant_id=@tenantId AND app_user_id=@userId", {userId:staff.id})],
    ['create property assignment', () => call('POST', '/api/property-assignments', {propertyId:p3, staffUserId:staff.id}),
      reset('DELETE FROM staff_property_assignments WHERE tenant_id=@tenantId AND propertyid=@propertyId', {propertyId:p3})],
    ['reactivate property assignment', () => call('PATCH', `/api/property-assignments/${inactiveAssignment}`, {status:'active'}),
      reset("UPDATE staff_property_assignments SET status='inactive' WHERE id=@assignmentId", {assignmentId:inactiveAssignment})],
    ['send invitation', () => call('POST', '/api/platform/auth/invitations', {appUserId:renter.id}), null],
    ['legacy add app user', () => call('POST', '/api/mssql/app-users', {...fresh('Legacy staff'), role:'staff', user_type:'staff'}), null],
    ['legacy widen app user role', () => call('PUT', `/api/mssql/app-users/${unlinked.id}`, {role:'manager', user_type:'manager'}),
      reset("UPDATE app_users SET role='staff',user_type='staff' WHERE id=@userId", {userId:unlinked.id})],
    ['legacy link login', () => call('POST', `/api/mssql/app-users/${unlinked.id}/link`, {authId:crypto.randomUUID()}),
      reset('UPDATE app_users SET auth_id=NULL WHERE id=@userId', {userId:unlinked.id})],
    ['generic app_users insert', () => call('POST', '/api/platform/query', {action:'insert', table:'app_users',
      payload:{...fresh('Generic user'), role:'rentee', user_type:'rentee'}}), null],
    ['generic app_users activation', () => call('POST', '/api/platform/query', {action:'update', table:'app_users',
      filters:[{column:'id', operator:'eq', value:dormant.id}], payload:{status:'active'}}),
    reset("UPDATE app_users SET status='inactive' WHERE id=@userId", {userId:dormant.id})]
  ];

  try {
    for (const state of ['expired', 'revoked']) {
      await setState(state);
      for (const [label, send] of expansions) {
        const before = await snapshot();
        const result = await send();
        assert.equal(result.status, 403, `${state} ${label}: ${JSON.stringify(result.json)}`);
        assert.equal(result.json.code, 'MANAGEMENT_READ_ONLY', `${state} ${label}`);
        assert.deepEqual(await snapshot(), before, `${state} ${label}: no user, membership, assignment, login or invitation change`);
      }
    }
    console.log('PASS: expired and revoked organizations cannot add/invite renters or staff, grant permissions, link logins, activate or extend access (13 writers, no writes)');

    for (const state of ['active', 'complimentary']) {
      await setState(state);
      for (const [label, send, undo] of expansions) {
        const result = await send();
        assert.ok([200, 201].includes(result.status), `${state} ${label}: ${result.status} ${JSON.stringify(result.json)}`);
        if (undo) {await undo();}
      }
    }
    assert.equal((await first(pool, "SELECT status FROM staff_property_assignments WHERE id=@id", {id:inactiveAssignment})).status, 'inactive');
    console.log('PASS: the identical access-expanding requests succeed under active and complimentary entitlement');

    // Retained reads and security cleanup after expiry.
    await setState('expired');
    for (const route of ['/api/mssql/rentees', `/api/mssql/rentees/${renter.id}`, '/api/mssql/team-members',
      `/api/mssql/team-members/${staff.id}`, '/api/property-assignments']) {
      assert.equal((await call('GET', route)).status, 200, `expired read ${route}`);
    }
    const cleanup = [
      ['renter profile correction', () => call('PUT', `/api/mssql/rentees/${renter.id}`, {name:'Corrected renter name'}),
        async () => assert.equal((await first(pool, 'SELECT name FROM app_users WHERE id=@id', {id:renter.id})).name, 'Corrected renter name')],
      ['renter property removal', () => call('PUT', `/api/mssql/rentees/${renter.id}`, {associated_properties:[]}),
        async () => assert.equal((await first(pool, 'SELECT associated_properties AS v FROM app_users WHERE id=@id', {id:renter.id})).v, '[]')],
      ['renter revocation', () => call('PATCH', `/api/mssql/rentees/${renter.id}/membership-status`, {status:'inactive'}),
        async () => assert.equal((await first(pool, 'SELECT status FROM tenant_memberships WHERE tenant_id=@t AND app_user_id=@u',
          {t:A.tenantId, u:renter.id})).status, 'inactive')],
      ['team demotion', () => call('PUT', `/api/mssql/team-members/${staff.id}`, {permission_bundle:'read_only'}),
        async () => assert.equal((await first(pool, 'SELECT permission_bundle AS v FROM tenant_memberships WHERE tenant_id=@t AND app_user_id=@u',
          {t:A.tenantId, u:staff.id})).v, 'read_only')],
      ['team revocation', () => call('PUT', `/api/mssql/team-members/${staff.id}`, {membership_status:'inactive'}),
        async () => assert.equal((await first(pool, 'SELECT status FROM tenant_memberships WHERE tenant_id=@t AND app_user_id=@u',
          {t:A.tenantId, u:staff.id})).status, 'inactive')],
      ['assignment ended', () => call('PATCH', `/api/property-assignments/${activeAssignment}`, {status:'inactive'}),
        async () => assert.equal((await first(pool, 'SELECT status FROM staff_property_assignments WHERE id=@id', {id:activeAssignment})).status, 'inactive')],
      ['assignment removed', () => call('DELETE', `/api/property-assignments/${activeAssignment}`),
        async () => assert.equal(await first(pool, 'SELECT id FROM staff_property_assignments WHERE id=@id', {id:activeAssignment}), null)],
      ['generic deactivation', () => call('POST', '/api/platform/query', {action:'update', table:'app_users',
        filters:[{column:'id', operator:'eq', value:unlinked.id}], payload:{status:'inactive'}}),
      async () => assert.equal((await first(pool, 'SELECT status FROM app_users WHERE id=@id', {id:unlinked.id})).status, 'inactive')],
      ['legacy user removal', () => call('DELETE', `/api/mssql/app-users/${removable.id}`),
        async () => assert.equal(await first(pool, 'SELECT id FROM app_users WHERE id=@id', {id:removable.id}), null)]
    ];
    for (const [label, send, effect] of cleanup) {
      const result = await send();
      assert.equal(result.status, 200, `expired ${label}: ${JSON.stringify(result.json)}`);
      if (label === 'team revocation') {
        // Truthful reply from the scoped readback, not a directory 404.
        assert.equal(id(result.json.data.id), staff.id);
        assert.equal(result.json.data.tenant_membership_status, 'inactive');
        assert.equal(result.json.data.active, false);
      }
      await effect();
    }
    console.log('PASS: after expiry, reads, profile correction, revocation, demotion, assignment end/removal and user removal remain available');

    // Team-member deactivation reply: repeat is an idempotent truthful no-op;
    // an inactive member cannot be reopened or edited through this route and
    // stays out of the directory; a rejected update leaves no partial write;
    // another organization cannot address the member.
    const teamCall = (memberId, body, who = adminA, tenantId = A.tenantId) =>
      call('PUT', `/api/mssql/team-members/${memberId}`, body, who, tenantId);
    for (const [label, send, status, code] of [
      ['repeat team revocation', () => teamCall(staff.id, {membership_status:'inactive'}), 200, null],
      ['inactive member reactivation', () => teamCall(staff.id, {membership_status:'active'}), 404, 'TEAM_MEMBER_NOT_FOUND'],
      ['inactive member permission grant', () => teamCall(staff.id, {permission_bundle:'finance'}), 404, 'TEAM_MEMBER_NOT_FOUND'],
      ['inactive member different revocation status', () => teamCall(staff.id, {membership_status:'suspended'}), 404, 'TEAM_MEMBER_NOT_FOUND'],
      ['foreign organization team revocation', () => teamCall(secondStaff.id, {membership_status:'inactive'}, adminB, B.tenantId), 404, 'TEAM_MEMBER_NOT_FOUND']
    ]) {
      const before = await snapshot();
      const result = await send();
      assert.equal(result.status, status, `${label}: ${JSON.stringify(result.json)}`);
      if (code) {assert.equal(result.json.code, code, label);}
      if (status === 200) {assert.equal(result.json.data.tenant_membership_status, 'inactive', label);}
      assert.deepEqual(await snapshot(), before, `${label}: no write`);
    }
    const directory = await call('GET', '/api/mssql/team-members');
    assert.equal(directory.status, 200);
    assert.ok(!directory.json.data.some(member => id(member.id) === staff.id), 'deactivated member stays out of the team directory');
    assert.ok(directory.json.data.some(member => id(member.id) === secondStaff.id), 'active member remains listed');
    console.log('PASS: team deactivation replies truthfully; repeat is idempotent; inactive members cannot be reopened or edited; foreign and rejected updates write nothing');

    // Cross-organization isolation and scope: B cannot act on A, and B (not
    // enrolled) keeps expanding its own access while A is expired.
    for (const [label, send, status] of [
      ['foreign session add renter', () => call('POST', '/api/mssql/rentees', fresh('Foreign renter'), adminB, A.tenantId), 403],
      ['foreign renter property grant', () => call('PUT', `/api/mssql/rentees/${renter.id}`, {associated_properties:[{propertyId:foreignProperty}]}, adminB, B.tenantId), 404],
      ['foreign assignment reactivation', () => call('PATCH', `/api/property-assignments/${inactiveAssignment}`, {status:'active'}, adminB, B.tenantId), 404]
    ]) {
      const before = await snapshot();
      const result = await send();
      assert.equal(result.status, status, `${label}: ${JSON.stringify(result.json)}`);
      assert.deepEqual(await snapshot(), before, `${label}: no writes`);
    }
    const unenrolled = await call('POST', '/api/mssql/rentees', fresh('Unenrolled renter'), adminB, B.tenantId);
    assert.equal(unenrolled.status, 201, JSON.stringify(unenrolled.json));
    console.log('PASS: cross-organization access administration stays denied; an unenrolled organization is unaffected');

    await setState('active');
    // Validation precedes every write: a rejected update changes nothing.
    const beforeRejected = await snapshot();
    const rejected = await call('PUT', `/api/mssql/team-members/${secondStaff.id}`, {name:'Must not persist', permission_bundle:'not-a-bundle'});
    assert.equal(rejected.status, 400, JSON.stringify(rejected.json));
    assert.equal(rejected.json.code, 'TEAM_PERMISSION_BUNDLE_INVALID');
    assert.deepEqual(await snapshot(), beforeRejected, 'rejected team update leaves no partial profile write');
    const activeDeactivation = await call('PUT', `/api/mssql/team-members/${secondStaff.id}`, {membership_status:'inactive'});
    assert.equal(activeDeactivation.status, 200, JSON.stringify(activeDeactivation.json));
    assert.equal(activeDeactivation.json.data.tenant_membership_status, 'inactive');
    assert.equal((await first(pool, 'SELECT status FROM tenant_memberships WHERE tenant_id=@t AND app_user_id=@u',
      {t:A.tenantId, u:secondStaff.id})).status, 'inactive');
    console.log('PASS: rejected team update writes nothing; team deactivation under an active entitlement replies 200 with the inactive membership');
    // Atomicity: entitlement decision and access expansion cannot interleave
    // with a billing-state change. Billing changes UPDATE the account row that
    // the decision locks (UPDLOCK, HOLDLOCK) until the expansion settles.
    const billingUpdate = statement => `UPDATE dbo.management_billing_accounts SET ${statement} WHERE tenant_id=@tenantId`;
    const lockTimeoutCode = async promise => {
      try {await promise; return null;} catch (error) {return error.number ?? error.originalError?.info?.number ?? error.code;}
    };
    // (1) Expansion in flight: a revocation cannot commit until it settles.
    await setState('active');
    let entered;
    let release;
    invitationStall = {entered:null, release:new Promise(resolve => {release = resolve;})};
    const inside = new Promise(resolve => {invitationStall.entered = resolve;});
    const inFlight = call('POST', '/api/platform/auth/invitations', {appUserId:renter.id});
    await inside;
    entered = true;
    const blocked = await lockTimeoutCode(pool.request().input('tenantId', sql.UniqueIdentifier, A.tenantId)
      .query(`SET LOCK_TIMEOUT 1500; ${billingUpdate("comp_type=NULL,subscription_status='pending',initial_payment_verified=0,paid_through=NULL")}`));
    assert.equal(blocked, 1222, 'revocation waits for the in-flight expansion (lock request timeout)');
    release();
    const admitted = await inFlight;
    invitationStall = null;
    assert.ok(entered);
    assert.equal(admitted.status, 201, `in-flight expansion admitted before revocation completes: ${JSON.stringify(admitted.json)}`);
    await setState('revoked');
    const afterRevocation = await call('POST', '/api/platform/auth/invitations', {appUserId:renter.id});
    assert.equal(afterRevocation.status, 403);
    assert.equal(afterRevocation.json.code, 'MANAGEMENT_READ_ONLY');

    // (2) Revocation in flight: expansions wait for it, then are denied with
    // no writes, for multi-statement repositories and direct SQL writers.
    await setState('active');
    const beforeRace = await snapshot();
    const revocation = new sql.Transaction(pool);
    await revocation.begin();
    await new sql.Request(revocation).input('tenantId', sql.UniqueIdentifier, A.tenantId)
      .query(billingUpdate("paid_through=DATEADD(SECOND,-1,SYSUTCDATETIME())"));
    const racing = [
      ['add renter', call('POST', '/api/mssql/rentees', fresh('Racing renter'))],
      ['add team member', call('POST', '/api/mssql/team-members', {...fresh('Racing staff'), permission_bundle:'read_only'})],
      ['create property assignment', call('POST', '/api/property-assignments', {propertyId:p3, staffUserId:raceStaff.id})],
      ['legacy add app user', call('POST', '/api/mssql/app-users', {...fresh('Racing legacy'), role:'staff', user_type:'staff'})]
    ];
    const settled = await Promise.race([
      Promise.all(racing.map(([, request]) => request)).then(() => 'settled'),
      new Promise(resolve => setTimeout(() => resolve('waiting'), 1200))
    ]);
    assert.equal(settled, 'waiting', 'expansions wait while the revocation holds the account row');
    await revocation.commit();
    for (const [label, request] of racing) {
      const result = await request;
      assert.equal(result.status, 403, `${label} after the concurrent expiry: ${JSON.stringify(result.json)}`);
      assert.equal(result.json.code, 'MANAGEMENT_READ_ONLY', label);
    }
    assert.deepEqual(await snapshot(), beforeRace, 'no expansion was written around the concurrent expiry');
    console.log('PASS: access expansion and billing revocation are serialized: an in-flight expansion blocks revocation (lock timeout 1222) and commits first; expansions racing a committed expiry wait and are denied with no writes');
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) {if (previous[key] === undefined) {delete process.env[key];} else {process.env[key] = previous[key];}}
  }
}
