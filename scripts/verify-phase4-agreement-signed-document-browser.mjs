import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { authorizeSignedAgreementDocumentRead } from '../src/api/evia/signedDocumentAccess.js';

// Real disposable SQL, bearer sessions and React UI. Only the last object-byte
// handler is a controlled local PDF fixture, not an R2 production assertion.
export async function verifyPhase4AgreementSignedDocumentClosure({
  browser, origin, pool, a, b, tokenA, call, createAuthRecord, issueAuthSession, storageProbe
}) {
  const lower = value => String(value || '').toLowerCase();
  const q = async (statement, args = {}) => {
    const request = pool.request();
    for (const [key, value] of Object.entries(args)) {request.input(key, value);}
    return (await request.query(statement)).recordset || [];
  };
  const createUser = async (tenantId, role) => {
    const email = 'agreement-closure-' + crypto.randomUUID() + '@example.invalid';
    const person = (await q(
      "INSERT INTO app_users (tenant_id, name, email, role, user_type) OUTPUT INSERTED.id VALUES (@tenantId, 'Agreement Closure', @email, @role, @role)",
      { tenantId, email, role }
    ))[0];
    const id = lower(person.id);
    await q("INSERT INTO tenant_memberships (tenant_id, app_user_id, role, status, is_default) VALUES (@tenantId, @id, @role, 'active', 1)",
      { tenantId, id, role });
    const authId = crypto.randomUUID();
    const record = await createAuthRecord({
      authId, appUserId: id, email, role,
      password: crypto.randomBytes(20).toString('base64url')
    });
    await q('UPDATE app_users SET auth_id = @authId WHERE id = @id AND tenant_id = @tenantId',
      { authId, id, tenantId });
    return { id, tenantId, authId, email, token: (await issueAuthSession(record)).accessToken };
  };
  const adminA = await createUser(a.tenantId, 'admin');
  const adminB = await createUser(b.tenantId, 'admin');
  const otherRenterA = await createUser(a.tenantId, 'rentee');
  const title = 'Phase4 retained document acceptance';
  const requestId = 'agreement-closure-' + crypto.randomUUID();
  const attemptId = crypto.randomUUID();
  const inserted = (await q(
    "INSERT INTO agreements (tenant_id, renteeid, propertyid, title, status, signature_status, eviasignreference, documenturl, pdfurl) OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, @title, 'signed', 'completed', @requestId, @original, @original)",
    { tenantId: a.tenantId, renteeId: a.renteeId, propertyId: a.propertyId,
      title, requestId, original: '/storage/documents/tenants/' + a.tenantId + '/agreements/original/draft.pdf' }
  ))[0];
  const agreementId = lower(inserted.id);
  const signedUrl = '/storage/documents/tenants/' + a.tenantId + '/agreements/' + agreementId +
    '/signed/staged/' + attemptId + '/Signed.pdf';
  const oldOriginal = '/storage/documents/tenants/' + a.tenantId + '/agreements/original/draft.pdf';
  await q('UPDATE agreements SET signed_document_url = @signedUrl WHERE id = @agreementId AND tenant_id = @tenantId',
    { signedUrl, agreementId, tenantId: a.tenantId });
  const proof = JSON.stringify({
    agreementId, attemptId, state: 'completed',
    signedDocumentUrl: signedUrl, auditTrailUrl: signedUrl.replace('Signed.pdf','audit_trail.pdf')
  });
  await q("INSERT INTO webhook_events (tenant_id, request_id, event_type, raw_data, processed) VALUES (@tenantId, @requestId, 'evia.archive.lease.v1', @proof, 0)",
    { tenantId: a.tenantId, requestId, proof });
  const hit = (path, token, tenantId) => call(path, { token, tenantId });
  const pdf = async (token, url = signedUrl, tenantId = a.tenantId) => {
    const response = await fetch(origin + url, {
      headers: { Authorization: 'Bearer ' + token, 'x-tenant-id': tenantId }
    });
    return { status: response.status, body: await response.text(), type: response.headers.get('content-type') };
  };
  const deny = async (token, url, status, tenantId) => {
    const before = storageProbe.reads();
    const response = await pdf(token, url, tenantId);
    assert.equal(response.status, status, 'document access status');
    assert.equal(storageProbe.reads(), before, 'denied document must not reach PDF byte transport');
  };
  const before = storageProbe.reads();
  await deny(adminA.token, signedUrl, 403, a.tenantId); // unprocessed publication
  await q("UPDATE webhook_events SET processed=1, processed_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND request_id=@requestId AND event_type='evia.archive.lease.v1'",
    { tenantId:a.tenantId, requestId });
  await deny(otherRenterA.token, signedUrl, 403, a.tenantId);
  await deny(adminB.token, signedUrl, 403, b.tenantId);
  await deny(adminA.token, signedUrl.replace('Signed.pdf','unpublished.pdf'), 403, a.tenantId);
  await deny(adminA.token, signedUrl.replace(attemptId,crypto.randomUUID()), 403, a.tenantId);
  const aAdminPdf = await pdf(adminA.token);
  assert.equal(aAdminPdf.status, 200);
  assert.ok(aAdminPdf.body.startsWith('%PDF-disposable-audit-test'));
  const ownerPdf = await pdf(tokenA);
  assert.equal(ownerPdf.status, 200);
  assert.ok(ownerPdf.body.startsWith('%PDF-disposable-audit-test'));

  const list = async (token, tenantId, query = '') =>
    hit('/api/mssql/agreements?pageSize=500' + query, token, tenantId);
  const foreignList = await list(otherRenterA.token, a.tenantId);
  assert.equal(foreignList.status, 200);
  assert.ok(!JSON.stringify(foreignList.payload).toLowerCase().includes(agreementId));
  const forcedList = await list(otherRenterA.token, a.tenantId, '&renteeId=' + a.renteeId);
  assert.ok(!JSON.stringify(forcedList.payload).toLowerCase().includes(agreementId));
  assert.equal((await hit('/api/mssql/agreements/' + agreementId, otherRenterA.token, a.tenantId)).status, 404);
  assert.equal((await hit('/api/mssql/agreements/' + agreementId, adminB.token, b.tenantId)).status, 404);
  const adminRead = await hit('/api/mssql/agreements/' + agreementId, adminA.token, a.tenantId);
  assert.equal(adminRead.status, 200);
  assert.equal(lower(adminRead.payload?.data?.signed_document_url), lower(signedUrl));

  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    await page.evaluateOnNewDocument((token, tenantId, id, email) => {
      localStorage.removeItem('dev_bypass_role');
      localStorage.setItem('khrental.activeTenantId', tenantId);
      localStorage.setItem('khrental.local.session', JSON.stringify({
        access_token: token, user: { id, email, role: 'admin' }
      }));
    }, adminA.token, a.tenantId, adminA.authId, adminA.email);
    await page.goto(origin + '/dashboard/agreements', {
      waitUntil: 'domcontentloaded', timeout: 45000
    });
    await page.waitForFunction(expected => document.body.innerText.includes(expected),
      { timeout: 30000 }, title);
    const fileResponses = [];
    page.on('response', response => {
      if (response.url().includes('/storage/documents/')) {
        fileResponses.push(response.status());
      }
    });
    const scope = await page.evaluate(title => {
      const card = [...document.querySelectorAll('div.border.rounded-lg')]
        .find(element => element.innerText.includes(title)
          && [...element.querySelectorAll('button')].some(b => b.textContent.includes('View Document')));
      if (!card) {return false;}
      [...card.querySelectorAll('button')]
        .find(b => b.textContent.includes('View Document')).click();
      return true;
    }, title);
    assert.equal(scope, true, 'routed admin card must expose retained signed PDF');
    await page.waitForFunction(() => {
      const frame = document.querySelector('iframe[title="Agreement Document Viewer"]');
      const ready = frame && String(frame.getAttribute('src') || '').startsWith('blob:');
      const problem = document.querySelector('[role="alert"]')?.textContent?.includes('Unable to retrieve');
      return ready || problem;
    }, { timeout: 30000 });
    const summary = await page.evaluate(() => ({
      blobLoaded: Boolean(document.querySelector('iframe[title="Agreement Document Viewer"][src^="blob:"]')),
      error: document.querySelector('[role="alert"]')?.textContent || null
    }));
    assert.equal(summary.blobLoaded, true,
      'authenticated signed PDF must load, not show an error: ' + JSON.stringify({
        error: summary.error, storageResponses: fileResponses
      }));
    const embedded = await page.evaluate(async () => {
      const frame = document.querySelector('iframe[title="Agreement Document Viewer"]');
      const download = [...document.querySelectorAll('a[download]')]
        .find(a => a.textContent.includes('Download'));
      const url = frame?.getAttribute('src');
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      return {
        url, downloadUrl: download?.getAttribute('href'),
        data: new TextDecoder().decode(buffer.slice(0, 28)),
        status: response.status, type: response.headers.get('content-type')
      };
    });
    assert.ok(embedded.url.startsWith('blob:'));
    assert.equal(embedded.downloadUrl, embedded.url, 'download must use authenticated bytes');
    assert.equal(embedded.status, 200);
    assert.ok(embedded.data.startsWith('%PDF-disposable-audit-test'),
      'rendered PDF bytes must be fetched through real-session storage');
    assert.equal(embedded.type, 'application/pdf');
    assert.notEqual(embedded.url, signedUrl, 'protected document must not use unauthenticated iframe');
    assert.notEqual(embedded.url, oldOriginal, 'signed document must never fall back to draft');
    await page.click('button[aria-label="Close document viewer"]');
    await page.waitForFunction(() => !document.querySelector('iframe[title="Agreement Document Viewer"]'));
    await page.waitForFunction(async old => {
      try { await fetch(old); return false; } catch (_error) { return true; }
    }, { timeout: 15000 }, embedded.url);
  } finally { await context.close(); }

  assert.ok(storageProbe.reads() >= before + 1);
  const malformed = await authorizeSignedAgreementDocumentRead({
    bucket: 'documents', path: 'tenants/' + a.tenantId + '/agreements/' + agreementId + '/signed/',
    tenantId: a.tenantId, user: { id: a.renteeId },
    membership: { tenant_id: a.tenantId, role: 'rentee', status: 'active' },
    loadSignedAgreement: async () => { throw new Error('Empty paths should be denied before SQL'); }
  });
  assert.equal(malformed.allowed, false);

  // A generic agreement write must never manufacture signing evidence, and
  // renter sessions cannot create, edit, manually sign or delete contracts.
  const change = (method, path, token, tenantId, body = {}) => call(path, {
    method, token, tenantId, body
  });
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const path = method === 'POST' ? '/api/mssql/agreements'
      : '/api/mssql/agreements/' + agreementId;
    const attempted = await change(method, path, otherRenterA.token, a.tenantId, {
      title: 'renter cannot alter agreement'
    });
    assert.equal(attempted.status, 403, method + ' must require agreement-management permission');
    assert.equal(attempted.payload?.code, 'AGREEMENT_MANAGEMENT_DENIED');
  }
  const foreignAttempt = await change('PUT', '/api/mssql/agreements/' + agreementId,
    adminB.token, b.tenantId, { title: 'wrong tenant' });
  assert.equal(foreignAttempt.status, 404);
  const cannotForge = [
    { status: 'signed' }, { signature_status: 'completed' },
    { signed_document_url: signedUrl }, { signature_pdf_url: signedUrl },
    { signatories_status: [{ status: 'completed', signed_at: new Date().toISOString() }] }
  ];
  for (const body of cannotForge) {
    const create = await change('POST', '/api/mssql/agreements', adminA.token, a.tenantId, {
      title: 'forged signature', renteeid: a.renteeId, propertyid: a.propertyId, ...body
    });
    assert.equal(create.status, 409);
    assert.equal(create.payload?.code, 'AGREEMENT_SIGNING_AUTHORITY_REQUIRED');
    const update = await change('PUT', '/api/mssql/agreements/' + agreementId,
      adminA.token, a.tenantId, body);
    assert.equal(update.status, 409);
    assert.equal(update.payload?.code, 'AGREEMENT_SIGNING_AUTHORITY_REQUIRED');
  }
  const immutable = await change('PUT', '/api/mssql/agreements/' + agreementId,
    adminA.token, a.tenantId, { notes: 'must not rewrite signed contract' });
  assert.equal(immutable.status, 409);
  assert.equal(immutable.payload?.code, 'SIGNED_AGREEMENT_IMMUTABLE');
  // Exercise the generic route with real SQL-backed sessions as well as the
  // repository compatibility endpoint above. These are disposable contracts.
  const draftId = crypto.randomUUID();
  const foreignDraftId = crypto.randomUUID();
  await q(`INSERT INTO agreements(id,tenant_id,renteeid,propertyid,status,notes)
    VALUES(@id,@tenantId,@renteeId,@propertyId,'draft','original')`,
    {id:draftId,tenantId:a.tenantId,renteeId:a.renteeId,propertyId:a.propertyId});
  await q(`INSERT INTO agreements(id,tenant_id,renteeid,propertyid,status,notes)
    VALUES(@id,@tenantId,@renteeId,@propertyId,'draft','foreign original')`,
    {id:foreignDraftId,tenantId:b.tenantId,renteeId:b.renteeId,propertyId:b.propertyId});
  const generic = (action, payload, id=draftId) => change('POST','/api/platform/query',adminA.token,a.tenantId,
    {table:'Agreements',action,payload,filters:[{column:'id',operator:'eq',value:id}]});
  try {
    for (const payload of [{Status:'active'},{STATUS:'closed'},{Signature_Status:'completed'},
      {Signed_Document_URL:signedUrl},{Signatories_Status:[{status:'completed'}]}]) {
      for (const action of ['insert','update','upsert']) {
        assert.equal((await generic(action,payload)).status,409,action+' cannot forge lifecycle state');
      }
      assert.equal((await change('PUT','/api/mssql/agreements/'+draftId,adminA.token,a.tenantId,payload)).status,409);
    }
    assert.equal((await generic('update',{status:'draft',Status:'active'})).status,400);
    assert.equal((await generic('update',{Tenant_ID:b.tenantId,notes:'override'})).status,403);
    assert.equal((await generic('update',{Notes:'must not change signed'},agreementId)).status,409);
    const mixed = await generic('upsert', [{id:draftId,notes:'must roll back'}, {id:agreementId,notes:'must deny'}]);
    assert.equal(mixed.status,409);
    assert.equal((await q('SELECT notes FROM agreements WHERE id=@id',{id:draftId}))[0].notes,'original');
    const bulkId = crypto.randomUUID();
    assert.equal((await generic('insert', [{id:bulkId,status:'draft'}, {Status:'signed'}])).status,409);
    assert.equal((await q('SELECT id FROM agreements WHERE id=@id',{id:bulkId})).length,0);
    assert.equal((await generic('delete',undefined,agreementId)).status,409);
    const rpc = await change('POST','/api/platform/rpc/update_agreement_status',adminA.token,a.tenantId,
      {agreementId:draftId,status:'active'});
    assert.equal(rpc.status,409);
    const signedRpc = await change('POST','/api/platform/rpc/update_agreement_status',adminA.token,a.tenantId,
      {agreementId,status:'draft'});
    assert.equal(signedRpc.status,409);
    const foreign = await generic('update',{Notes:'wrong tenant'},foreignDraftId);
    assert.equal(foreign.status,200);
    assert.equal((await q('SELECT notes FROM agreements WHERE id=@id',{id:foreignDraftId}))[0].notes,'foreign original');
    const allowed = await generic('update',{Status:'draft',Notes:'retained draft wording',Signed_Document_URL:null});
    assert.equal(allowed.status,200);
    assert.equal((await q('SELECT notes FROM agreements WHERE id=@id',{id:draftId}))[0].notes,'retained draft wording');
    console.log('PASS: real-session generic/repository agreement case authority, collision/tenant override denial, signed immutability, RPC denial, atomic bulk rollback and retained draft edits');
  } finally {
    await q('DELETE FROM agreements WHERE id IN (@draftId,@foreignDraftId)',{draftId,foreignDraftId});
  }
  const stillSigned = await hit('/api/mssql/agreements/' + agreementId, adminA.token, a.tenantId);
  assert.equal(stillSigned.status, 200);
  assert.equal(lower(stillSigned.payload.data.signed_document_url), lower(signedUrl));
  assert.equal(stillSigned.payload.data.notes || null, null);
  // The renter's actual View Document action must retain authenticated byte
  // transport after closure, instead of opening the protected URL anonymously.
  await q("UPDATE agreements SET status='closed' WHERE id=@agreementId AND tenant_id=@tenantId",
    {agreementId,tenantId:a.tenantId});
  const renterContext=await browser.createBrowserContext();
  const renterPage=await renterContext.newPage();
  try {
    await renterPage.evaluateOnNewDocument((token,tenantId,id,email)=>{
      localStorage.removeItem('dev_bypass_role');
      localStorage.setItem('khrental.activeTenantId',tenantId);
      localStorage.setItem('khrental.local.session',JSON.stringify({access_token:token,user:{id,email,role:'rentee'}}));
    },tokenA,a.tenantId,a.authId,a.email);
    for(const width of [1440,390]){
      await renterPage.setViewport({width,height:900});
      await renterPage.goto(origin+'/rentee/agreements',{waitUntil:'networkidle0',timeout:45000});
      await renterPage.waitForFunction(expected=>document.body.innerText.includes(expected),{timeout:30000},title);
      const clicked=await renterPage.evaluate(expected=>{
        const card=[...document.querySelectorAll('div.bg-white.rounded-lg.shadow-md')]
          .find(node=>node.innerText.includes(expected)&&[...node.querySelectorAll('button')].some(b=>b.textContent.trim()==='View Document'));
        const button=card&&[...card.querySelectorAll('button')].find(b=>b.textContent.trim()==='View Document');
        button?.click();return Boolean(button);
      },title);
      assert.equal(clicked,true,'closed renter agreement must retain its document action');
      await renterPage.waitForSelector('iframe[title="Agreement Document Viewer"][src^="blob:"]',{timeout:30000});
      const retained=await renterPage.evaluate(async()=>{
        const url=document.querySelector('iframe[title="Agreement Document Viewer"]').getAttribute('src');
        const download=[...document.querySelectorAll('a[download]')].find(a=>a.textContent.includes('Download'));
        return {url,download:download?.getAttribute('href'),bytes:await (await fetch(url)).text()};
      });
      assert.ok(retained.bytes.startsWith('%PDF-disposable-audit-test'));
      assert.equal(retained.download,retained.url);
      assert.ok(await renterPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await renterPage.click('button[aria-label="Close document viewer"]');
      await renterPage.waitForFunction(async old=>{try{await fetch(old);return false;}catch{return true;}},{timeout:15000},retained.url);
    }
  } finally {await renterContext.close();}
  console.log('PASS: signed-PDF bytes, real-session tenant isolation, immutable signing authority, closed-renter desktop/mobile access and browser cleanup');
}
