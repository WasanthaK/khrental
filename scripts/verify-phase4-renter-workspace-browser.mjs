import assert from 'node:assert/strict';

const fixtureLabel = (own, a, b) => own.tenantId === a.tenantId ? 'A' : 'B';

/**
 * Genuine routed React acceptance for a SQL-backed renter session, with
 * two separate organizations. Read-only: never submits an agreement,
 * payment, maintenance update, document signature or external email.
 */
export async function verifyPhase4RenterWorkspaceBrowser({ browser, origin, a, b, tokenA, tokenB, seeded }) {
  const browse = async (own, token, route, { expected, forbidden, rejectEmpty } = {}) => {
    const page = await browser.newPage();
    try {
      await page.evaluateOnNewDocument((accessToken, tenantId, authId, email) => {
        localStorage.removeItem('dev_bypass_role');
        localStorage.setItem('khrental.activeTenantId', tenantId);
        localStorage.setItem('khrental.local.session', JSON.stringify({
          access_token: accessToken,
          user: { id: authId, email, role: 'rentee' }
        }));
      }, token, own.tenantId, own.authId, own.email);
      await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForFunction(
        ({ expectedText, emptyText }) => {
          const body = document.body.innerText;
          return body.includes(expectedText) ||
            (emptyText && body.includes(emptyText)) ||
            location.pathname === '/login' || location.pathname === '/unauthorized' ||
            body.includes('Error loading requests') ||
            body.includes('Failed to load maintenance request details');
        },
        { timeout: 30000 }, { expectedText: expected, emptyText: rejectEmpty }
      );

      const state = await page.evaluate(() => ({
        route: location.pathname,
        body: document.body.innerText.slice(0, 18000)
      }));
      // No credentials or real customer data: the browser uses disposable fixture tenants.
      const diag = 'route=' + state.route + ', visible=' + state.body.slice(-2500);
      assert.equal(state.route, route, 'authenticated renter must retain route: ' + diag);
      assert.ok(state.body.includes(expected), 'own fixture must render: ' + diag);
      assert.ok(!state.body.includes(forbidden), 'cross-tenant fixture must not render: ' + diag);
      if (rejectEmpty) assert.ok(!state.body.includes(rejectEmpty), 'own fixture must not appear empty: ' + diag);
      assert.ok(!state.body.includes('Error loading requests'), 'renter maintenance query failed: ' + diag);
      assert.ok(!state.body.includes('Failed to load maintenance request details'), 'own maintenance detail failed: ' + diag);
      return state;
    } finally {
      await page.close();
    }
  };

  for (const [own, foreign, token] of [[a, b, tokenA], [b, a, tokenB]]) {
    const ownLabel = fixtureLabel(own, a, b);
    const otherLabel = fixtureLabel(foreign, a, b);
    await browse(own, token, '/rentee/maintenance', {
      expected: 'Fixture ' + ownLabel,
      forbidden: 'Fixture ' + otherLabel,
      rejectEmpty: 'No maintenance requests found.'
    });
    await browse(own, token, '/rentee/maintenance/' + (own === a ? seeded.requestA : seeded.requestB), {
      expected: 'Fixture ' + ownLabel,
      forbidden: 'Fixture ' + otherLabel,
      rejectEmpty: 'Maintenance request not found'
    });
    await browse(own, token, '/rentee/agreements', {
      expected: 'Tenant ' + ownLabel + ' Property',
      forbidden: 'Tenant ' + otherLabel + ' Property',
      rejectEmpty: 'No agreements found.'
    });
  }

  // An arbitrary foreign identifier is not a valid navigation capability.
  // The actual details screen must show an error, not the other tenant's data.
  const denied = await browser.newPage();
  try {
    await denied.evaluateOnNewDocument((accessToken, tenantId, authId, email) => {
      localStorage.removeItem('dev_bypass_role');
      localStorage.setItem('khrental.activeTenantId', tenantId);
      localStorage.setItem('khrental.local.session', JSON.stringify({
        access_token: accessToken,
        user: { id: authId, email, role: 'rentee' }
      }));
    }, tokenA, a.tenantId, a.authId, a.email);
    await denied.goto(origin + '/rentee/maintenance/' + seeded.requestB,
      { waitUntil: 'domcontentloaded', timeout: 45000 });
    await denied.waitForFunction(
      () => document.body.innerText.includes('Failed to load maintenance request details')
        || location.pathname === '/unauthorized' || location.pathname === '/login',
      { timeout: 30000 }
    );
    const state = await denied.evaluate(() => ({
      route: location.pathname, body: document.body.innerText
    }));
    assert.ok(!state.body.includes('Fixture B'), 'foreign maintenance details must not leak');
    assert.ok(!state.body.includes('Tenant B Property'), 'foreign property name must not leak');
    assert.ok(state.body.includes('Failed to load maintenance request details')
      || state.route === '/unauthorized', 'denied lookup must not display success');
  } finally {
    await denied.close();
  }
  console.log('PASS: authenticated routed renter maintenance list/detail, agreement cards and foreign request denial for tenants A/B');
}
