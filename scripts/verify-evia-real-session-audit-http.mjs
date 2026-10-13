import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { revokeAccessToken } from '../src/api/auth/index.js';

// Executed ONLY inside the disposable Docker SQL Server billing acceptance.
// Real SQL session validation, real tenant middleware and real publication
// reads are retained. Only the final object-byte transport is instrumented;
// this test must never download a production document or call an external API.
export const createAuditHttpStorageProbe = () => {
  let reads = 0;
  return {
    reads: () => reads,
    deliveryHandler: (_req, res) => {
      reads++;
      res.setHeader('Content-Type', 'application/pdf');
      res.send(Buffer.from('%PDF-disposable-audit-test'));
    }
  };
};

export const verifyEviaRealSessionAuditHttp = async ({
  pool, a, b, origin, tokenA, tokenB, createAuthRecord, issueAuthSession, probe
}) => {
  const q = async (statement, params = {}) => {
    const request = pool.request();
    for (const [name, value] of Object.entries(params)) request.input(name, value);
    return (await request.query(statement)).recordset || [];
  };
  const id = value => String(value || '').toLowerCase();
  const unique = () => crypto.randomBytes(7).toString('hex');
  const register = async (item, role, bundle = null) => {
    const email = 'audit-http-' + unique() + '@example.invalid';
    const [person] = await q(
      'INSERT INTO dbo.app_users (tenant_id, name, email, role, user_type) OUTPUT INSERTED.id VALUES (@tenantId, @name, @email, @role, @role)',
      { tenantId: item.tenantId, name: 'Disposable audit ' + role, email, role }
    );
    const appUserId = id(person.id);
    await q(
      'INSERT INTO dbo.tenant_memberships (tenant_id, app_user_id, role, status, permission_bundle, is_default) VALUES (@tenantId, @appUserId, @role, @status, @bundle, 1)',
      { tenantId: item.tenantId, appUserId, role, status: 'active', bundle }
    );
    const authId = crypto.randomUUID();
    const record = await createAuthRecord({
      authId, appUserId, email, role,
      password: crypto.randomBytes(26).toString('base64url')
    });
    const linked = await q(
      'UPDATE dbo.app_users SET auth_id = @authId OUTPUT INSERTED.id WHERE id = @appUserId AND tenant_id = @tenantId',
      { authId, appUserId, tenantId: item.tenantId }
    );
    assert.equal(linked.length, 1);
    const session = await issueAuthSession(record);
    return { token: session.accessToken };
  };

  const adminA = await register(a, 'admin');
  const adminB = await register(b, 'admin');
  const staffA = await register(a, 'staff', 'property_operations');
  const callbackRequestId = 'audit-http-fixture-' + unique();
  const attemptId = crypto.randomUUID();
  const [agreement] = await q([
    'INSERT INTO dbo.agreements',
    '  (tenant_id, renteeid, propertyid, status, signature_status, eviasignreference)',
    "  OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, 'signed', 'completed', @requestId)"
  ].join('\n'), {
    tenantId: a.tenantId, renteeId: a.renteeId, propertyId: a.propertyId,
    requestId: callbackRequestId
  });
  const agreementId = id(agreement.id);
  const prefix = '/storage/documents/tenants/' + a.tenantId
    + '/agreements/' + agreementId + '/signed/staged/' + attemptId + '/';
  const auditUrl = prefix + 'audit_trail.pdf';
  const signedUrl = prefix + 'Signed.pdf';
  const proof = JSON.stringify({
    agreementId, attemptId, state: 'completed',
    signedDocumentUrl: signedUrl, auditTrailUrl: auditUrl
  });
  await q(
    'UPDATE dbo.agreements SET signed_document_url = @signedUrl WHERE id = @agreementId AND tenant_id = @tenantId',
    { signedUrl, agreementId, tenantId: a.tenantId }
  );

  const hit = async (url, headers = {}) => {
    const response = await fetch(origin + url, { headers, redirect: 'manual' });
    return { status: response.status, body: await response.text() };
  };
  const bearer = token => ({ authorization: 'Bearer ' + token });
  const cookie = token => ({ cookie: 'khrental_storage_session=' + encodeURIComponent(token) });
  const deny = async (url, headers, expectedStatus) => {
    const before = probe.reads();
    const response = await hit(url, headers);
    assert.equal(response.status, expectedStatus, 'unexpected storage response ' + response.status);
    assert.equal(probe.reads(), before, 'denied request must never read audit bytes');
  };
  try {
    // Real SQL token lookup and tenant-member resolution, never identity headers.
    await deny(auditUrl, {}, 401);
    await deny(auditUrl, bearer('invalid-session-' + unique()), 401);
    await deny(auditUrl, cookie('invalid-session-' + unique()), 401);
    await deny(auditUrl, bearer(tokenA), 403);
    await deny(auditUrl, bearer(tokenB), 403);
    await deny(auditUrl, bearer(staffA.token), 403);
    await deny(auditUrl, bearer(adminB.token), 403);
    await deny(auditUrl, bearer(adminA.token), 403); // no publication

    await q(
      "INSERT INTO dbo.webhook_events (tenant_id, request_id, event_type, raw_data, processed) VALUES (@tenantId, @requestId, 'evia.archive.lease.v1', @rawData, 0)",
      { tenantId: a.tenantId, requestId: callbackRequestId, rawData: proof }
    );
    await deny(auditUrl, cookie(adminA.token), 403); // unprocessed lease
    await q(
      "UPDATE dbo.webhook_events SET processed = 1, processed_at = SYSUTCDATETIME() WHERE tenant_id = @tenantId AND request_id = @requestId AND event_type = 'evia.archive.lease.v1'",
      { tenantId: a.tenantId, requestId: callbackRequestId }
    );
    await deny(auditUrl.replace(attemptId, crypto.randomUUID()), bearer(adminA.token), 403);
    await deny(auditUrl, { ...bearer(adminB.token), 'x-tenant-id': a.tenantId }, 403);
    for (const headers of [bearer(adminA.token), cookie(adminA.token), { ...bearer(adminA.token), 'x-tenant-id': b.tenantId }]) {
      const before = probe.reads();
      const response = await hit(auditUrl, headers);
      assert.equal(response.status, 200);
      assert.equal(response.body, '%PDF-disposable-audit-test');
      assert.equal(probe.reads(), before + 1);
    }
    await revokeAccessToken(adminA.token);
    await deny(auditUrl, bearer(adminA.token), 401);
  } finally {
    await Promise.allSettled([
      revokeAccessToken(adminA.token), revokeAccessToken(adminB.token),
      revokeAccessToken(staffA.token)
    ]);
  }
};
