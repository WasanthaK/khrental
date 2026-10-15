import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Actual React Accept Invite acceptance against the same disposable MSSQL
// database and authenticated Express routers as Phase 4's HTTP coverage.
// Fresh isolated browser contexts emulate two separate customers.
export async function verifyPhase4InvitationBrowser({ browser, origin, pool, a, b, call, pending }) {
  const lower = value => String(value || '').toLowerCase();
  const one = async (statement, params = {}) => {
    const request = pool.request();
    for (const [name, value] of Object.entries(params)) request.input(name, value);
    return (await request.query(statement)).recordset?.[0] || null;
  };
  const visit = async (page, token) => {
    // The token is ephemeral and must never be included in diagnostics.
    try {
      await page.goto(origin + '/accept-invite?token=' + encodeURIComponent(token),
        { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (_error) {
      throw new Error('Disposable invitation browser navigation failed');
    }
  };
  const open = async (token, { staleSession = false } = {}) => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    if (staleSession) {
      await page.evaluateOnNewDocument(tenantId => {
        localStorage.removeItem('dev_bypass_role');
        localStorage.setItem('khrental.activeTenantId', tenantId);
        localStorage.setItem('khrental.local.session', JSON.stringify({
          access_token: 'stale-invitation-fixture-session',
          user: { id: 'stale', email: 'stale@example.invalid', role: 'rentee' }
        }));
      }, b.tenantId);
    }
    await visit(page, token);
    return { page, context };
  };
  const close = async view => { if (view) await view.context.close(); };
  const verifyUnusable = async token => {
    let view;
    try {
      view = await open(token);
      await view.page.waitForFunction(() =>
        document.body.innerText.includes('Invitation unavailable:') &&
        !document.querySelector('form input[type="password"]'),
      { polling: 150, timeout: 30000 });
      assert.equal(await view.page.$('#password'), null,
        'used/revoked invitation must not display setup form');
    } finally { await close(view); }
  };

  // A revoked token must be rejected by the actual routed UI before account
  // setup, without creating an auth identity.
  await verifyUnusable(pending.revokedToken);

  const redeemViaScreen = async (target, expectedTenant, { staleSession = false } = {}) => {
    let view;
    try {
      view = await open(target.token, { staleSession });
      const page = view.page;
      await page.waitForSelector('#email', { timeout: 30000 });
      await page.waitForFunction(email =>
        document.querySelector('#email')?.value?.toLowerCase() === email.toLowerCase() &&
        document.body.innerText.includes('Complete Your Account Setup'),
      { polling: 150, timeout: 30000 }, target.email);
      const emailReadOnly = await page.$eval('#email',
        input => input.disabled && input.readOnly);
      assert.equal(emailReadOnly, true, 'invited identity cannot change bound email');

      const password = 'Acceptance-' + crypto.randomBytes(16).toString('base64url') + '!';
      await page.type('#password', password);
      await page.type('#confirmPassword', password);
      await page.click('button[type="submit"]');
      await page.waitForFunction(() =>
        location.pathname.startsWith('/rentee') &&
        Boolean(localStorage.getItem('khrental.local.session')),
      { polling: 250, timeout: 45000 });

      const stored = await page.evaluate(() => ({
        devBypass: localStorage.getItem('dev_bypass_role'),
        activeTenant: localStorage.getItem('khrental.activeTenantId'),
        session: JSON.parse(localStorage.getItem('khrental.local.session') || 'null')
      }));
      assert.equal(stored.devBypass, null, 'browser journey cannot use developer authority');
      assert.ok(stored.session?.access_token && stored.session?.user?.id,
        'successful setup must persist a server-issued authenticated session');
      assert.equal(lower(stored.session.user.email), lower(target.email));
      assert.equal(lower(stored.activeTenant), lower(expectedTenant),
        'routed renter portal must resolve the correct organization');

      const context = await call('/api/platform/auth/context', {
        token: stored.session.access_token, tenantId: expectedTenant
      });
      assert.equal(context.status, 200, 'new session must resolve authenticated context');
      assert.equal(lower(context.payload?.data?.tenantId), lower(expectedTenant));
      const otherTenant = lower(expectedTenant) === lower(a.tenantId) ? b.tenantId : a.tenantId;
      const foreign = await call('/api/platform/auth/context', {
        token: stored.session.access_token, tenantId: otherTenant
      });
      assert.equal(foreign.status, 403, 'new account cannot select foreign organization');
      assert.equal(foreign.payload?.code, 'TENANT_ACCESS_DENIED');

      const persisted = await one(
        'SELECT au.auth_id, i.accepted_at, (SELECT COUNT(*) FROM auth_users WHERE app_user_id = @id) AS account_count FROM app_users au JOIN user_invitations i ON i.app_user_id = au.id WHERE au.id = @id AND i.tenant_id = @tenantId AND i.accepted_at IS NOT NULL',
        { id: target.userId, tenantId: expectedTenant }
      );
      assert.ok(persisted?.auth_id && persisted?.accepted_at,
        'browser completion must atomically link the real account and accepted invitation');
      assert.equal(Number(persisted.account_count), 1);
      assert.equal(lower(persisted.auth_id), lower(stored.session.user.id));
      return { authId: stored.session.user.id, password };
    } finally { await close(view); }
  };

  const aResult = await redeemViaScreen(pending.a, a.tenantId, { staleSession: true });
  await verifyUnusable(pending.a.token);
  const bResult = await redeemViaScreen(pending.b, b.tenantId);
  await verifyUnusable(pending.b.token);
  assert.notEqual(lower(aResult.authId), lower(bResult.authId),
    'the two customer browser journeys must create independent credentials');
  for (const [target, value] of [[pending.a, aResult], [pending.b, bResult]]) {
    const login = await call('/api/platform/auth/sign-in', {
      method: 'POST', body: { email: target.email, password: value.password }
    });
    assert.equal(login.status, 200, 'browser-created password must work for subsequent sign-in');
    assert.equal(lower(login.payload?.data?.user?.id), lower(value.authId));
  }
  console.log('PASS: two real Accept Invite React browser account setups, single-use and revoked-token screens, session persistence, stale session isolation and foreign-tenant denial');
}
