import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Local-only provider substitute. Captures token links for disposable browser
// acceptance; never reaches a real mailbox or logs credentials.
export const createControlledResetMailbox = () => {
  const deliveries = [];
  const failures = new Map();
  let baseUrl = '';
  const normalized = value => String(value || '').trim().toLowerCase();
  return {
    setBaseUrl(value) { baseUrl = value; },
    getBaseUrl() { return baseUrl; },
    fail(email, type) { failures.set(normalized(email), type); },
    entries(email) { return deliveries.filter(item => item.email === normalized(email)); },
    async sendEmail({ to, subject, text, html }) {
      const email = normalized(to);
      assert.ok(subject && text && html, 'controlled email must include both content variants');
      const match = String(text).match(/https?:\/\/[^\s]+/);
      assert.ok(match, 'reset email must contain an actionable link');
      const url = new URL(match[0]);
      assert.equal(url.pathname, '/reset-password');
      assert.ok(url.searchParams.get('token'));
      deliveries.push({ email, link: url.toString() });
      const failure = failures.get(email);
      if (failure === 'throw') throw new Error('Controlled provider unavailable');
      if (failure === 'return') return { success: false };
      return { success: true, provider: 'controlled-disposable-mailbox', providerStatus: 202 };
    }
  };
};

export async function verifyPhase4PasswordRecoveryBrowser({
  browser, origin, pool, a, b, call, createAuthRecord, issueAuthSession, mailbox
}) {
  const guid = value => String(value || '').toLowerCase();
  const rows = async (statement, params = {}) => {
    const req = pool.request();
    for (const [name, value] of Object.entries(params)) req.input(name, value);
    return (await req.query(statement)).recordset || [];
  };
  const actor = async item => {
    const email = 'recovery-test-' + crypto.randomUUID() + '@example.invalid';
    const row = (await rows(
      "INSERT INTO app_users (tenant_id, name, email, role, user_type) OUTPUT INSERTED.id VALUES (@tenantId, 'Recovery Fixture', @email, 'rentee', 'rentee')",
      { tenantId: item.tenantId, email }
    ))[0];
    const id = guid(row.id);
    await rows("INSERT INTO tenant_memberships (tenant_id, app_user_id, role, status, is_default) VALUES (@tenantId, @id, 'rentee', 'active', 1)",
      { tenantId: item.tenantId, id });
    const authId = crypto.randomUUID();
    const password = 'Original-' + crypto.randomBytes(12).toString('base64url') + '!';
    const record = await createAuthRecord({
      authId, appUserId: id, email, role: 'rentee', password
    });
    await rows('UPDATE app_users SET auth_id = @authId WHERE id = @id AND tenant_id = @tenantId',
      { authId, id, tenantId: item.tenantId });
    return {
      email, id, authId,
      tenantId: item.tenantId,
      password,
      session: (await issueAuthSession(record)).accessToken
    };
  };
  const ownerA = await actor(a);
  const ownerB = await actor(b);
  const failureThrows = await actor(a);
  const failureReturns = await actor(a);
  const path = '/api/platform/auth/reset-password';
  const request = email => call(path, { method: 'POST', body: { email } });
  const checkRequest = value => {
    assert.equal(value.status, 200, 'password reset requests must preserve enumeration protection');
    assert.equal(value.payload?.data?.sent, true);
    assert.equal(value.payload?.data?.message,
      'If an account exists for that email, a password reset link has been sent.');
  };
  const lastMail = email => {
    const entries = mailbox.entries(email);
    assert.ok(entries.length > 0, 'controlled mailbox should capture one delivery');
    return entries[entries.length - 1];
  };
  const getToken = email => new URL(lastMail(email).link).searchParams.get('token');
  const hash = token => crypto.createHash('sha256').update(token).digest('hex');
  const signIn = (email, password) => call('/api/platform/auth/sign-in', {
    method: 'POST', body: { email, password }
  });
  const validate = token => call(path + '/validate?token=' + encodeURIComponent(token));
  const context = (token, tenantId) => call('/api/platform/auth/context', { token, tenantId });

  // The browser request mode must not disclose whether the account exists.
  const requestScreen = async email => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    try {
      await page.goto(origin + '/reset-password', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector('#email-address', { timeout: 30000 });
      await page.type('#email-address', email);
      await page.click('button[type="submit"]');
      await page.waitForFunction(() =>
        document.body.innerText.includes('If an account exists for that email'),
      { polling: 200, timeout: 30000 });
      return await page.evaluate(() => document.body.innerText.includes('If an account exists for that email'));
    } finally { await context.close(); }
  };
  const unknown = 'unknown-recovery-' + crypto.randomUUID() + '@example.invalid';
  const beforeUnknown = mailbox.entries(unknown).length;
  assert.equal(await requestScreen(unknown), true);
  assert.equal(mailbox.entries(unknown).length, beforeUnknown);
  assert.equal(await rows('SELECT id FROM password_reset_tokens WHERE email = @email', { email: unknown }).then(a => a.length), 0);
  assert.equal(await requestScreen(ownerA.email), true);
  const originalToken = getToken(ownerA.email);
  assert.equal((await validate(originalToken)).payload?.data?.valid, true);
  checkRequest(await request(ownerA.email));
  const activeToken = getToken(ownerA.email);
  assert.notEqual(originalToken, activeToken);
  assert.equal((await validate(originalToken)).payload?.data?.valid, false);
  assert.equal((await validate(activeToken)).payload?.data?.valid, true);

  // Invalid tokens must not render a password-entry form, including after
  // expiration, revocation, and one-time redemption.
  const assertBlockedForm = async token => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    try {
      await page.goto(origin + '/reset-password?token=' + encodeURIComponent(token),
        { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForFunction(() =>
        document.body.innerText.includes('This password reset link is invalid') &&
        !document.querySelector('#new-password'),
      { polling: 200, timeout: 30000 });
      assert.equal(await page.$('#new-password'), null);
    } finally { await context.close(); }
  };
  await assertBlockedForm(originalToken);

  checkRequest(await request(ownerB.email));
  const expiredToken = getToken(ownerB.email);
  await rows('UPDATE password_reset_tokens SET expires_at = DATEADD(MINUTE,-1,SYSUTCDATETIME()) WHERE token_hash = @hash',
    { hash: hash(expiredToken) });
  await assertBlockedForm(expiredToken);

  for (const [person, mode] of [[failureThrows, 'throw'], [failureReturns, 'return']]) {
    mailbox.fail(person.email, mode);
    checkRequest(await request(person.email));
    const token = getToken(person.email);
    const state = (await rows(
      'SELECT revoked_at FROM password_reset_tokens WHERE token_hash = @hash',
      { hash: hash(token) }
    ))[0];
    assert.ok(state?.revoked_at, 'unaccepted email delivery must revoke its reset token');
    await assertBlockedForm(token);
  }

  const browserContext = await browser.createBrowserContext();
  const page = await browserContext.newPage();
  let newPassword;
  try {
    // A stale local login must not hijack anonymous password recovery.
    await page.evaluateOnNewDocument(() => {
      if (sessionStorage.getItem('recovery.stale.seen')) return;
      sessionStorage.setItem('recovery.stale.seen', '1');
      localStorage.setItem('khrental.activeTenantId', 'some-other-tenant');
      localStorage.setItem('khrental.local.session', JSON.stringify({
        access_token: 'stale-recovery-browser-token',
        user: { id: 'stale', email: 'stale@example.invalid' }
      }));
    });
    await page.goto(origin + '/reset-password?token=' + encodeURIComponent(activeToken),
      { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('#new-password', { timeout: 30000 });
    newPassword = 'Updated-' + crypto.randomBytes(15).toString('base64url') + '!';
    await page.type('#new-password', newPassword);
    await page.type('#confirm-password', newPassword);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() =>
      document.body.innerText.includes('Your password has been updated') &&
      !document.querySelector('#new-password'),
    { polling: 200, timeout: 45000 });
    const storage = await page.evaluate(() => ({
      saved: localStorage.getItem('khrental.local.session'),
      pathname: location.pathname
    }));
    assert.equal(storage.pathname, '/reset-password');
    assert.equal(storage.saved, null, 'successful recovery must not leave a logged-in browser session');
  } finally { await browserContext.close(); }

  const used = (await rows(
    'SELECT used_at, revoked_at FROM password_reset_tokens WHERE token_hash = @hash',
    { hash: hash(activeToken) }
  ))[0];
  assert.ok(used?.used_at && !used?.revoked_at);
  await assertBlockedForm(activeToken);
  const replay = await call(path + '/redeem', { method: 'POST', body: {
    token: activeToken, password: 'Not-Allowed-Replay-Password!'
  } });
  assert.equal(replay.status, 400);
  assert.equal(replay.payload?.code, 'PASSWORD_RESET_USED');

  assert.equal((await context(ownerA.session, a.tenantId)).status, 401,
    'existing session must be invalid after recovery');
  assert.equal((await signIn(ownerA.email, ownerA.password)).status, 401,
    'old credential must stop working after recovery');
  const newLogin = await signIn(ownerA.email, newPassword);
  assert.equal(newLogin.status, 200);
  assert.equal(guid(newLogin.payload?.data?.user?.id), guid(ownerA.authId));
  assert.equal((await context(newLogin.payload.data.session.access_token, a.tenantId)).status, 200);
  const foreign = await context(newLogin.payload.data.session.access_token, b.tenantId);
  assert.equal(foreign.status, 403);
  assert.equal(foreign.payload?.code, 'TENANT_ACCESS_DENIED');
  assert.equal((await context(ownerB.session, b.tenantId)).status, 200,
    'recovery in organization A must not revoke independent B sessions');
  assert.equal((await signIn(ownerB.email, ownerB.password)).status, 200);
  console.log('PASS: real password recovery browser, revoked/expired/used token screens, controlled delivery failure, old-session revocation and two-tenant isolation');
}
