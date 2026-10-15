import assert from 'node:assert/strict';

const lower = x => String(x || '').toLowerCase();

/**
 * Use the actual routed renter/staff React inbox with SQL-backed bearer
 * sessions. All fixtures are disposable, with no outbound email or SMS.
 */
export async function verifyPhase4NotificationInboxBrowser({
  browser, origin, pool, a, b, tokenA, tokenB, seeded, staffResult
}) {
  const open = async ({ item, token, role, path }) => {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((accessToken, tenantId, authId, email, userRole) => {
      localStorage.removeItem('dev_bypass_role');
      localStorage.setItem('khrental.activeTenantId', tenantId);
      localStorage.setItem('khrental.local.session', JSON.stringify({
        access_token: accessToken, user: { id: authId, email, role: userRole }
      }));
    }, token, item.tenantId, item.authId, item.email, role);
    await page.goto(origin + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
    return page;
  };

  const notificationRead = async id => {
    const req = pool.request();
    req.input('id', id);
    const result = await req.query('SELECT is_read FROM notifications WHERE id = @id');
    return Boolean(result.recordset[0]?.is_read);
  };

  const renterA = await open({
    item: a, token: tokenA, role: 'rentee', path: '/rentee/notifications'
  });
  try {
    const requestSelector = 'article[data-request-id="' + staffResult.requestId + '"]';
    await renterA.waitForSelector(requestSelector, { timeout: 30000 });
    const cards = await renterA.$$eval(requestSelector, elements =>
      elements.map(item => ({
        id: item.getAttribute('data-notification-id'),
        title: item.innerText,
        link: item.querySelector('a[href]')?.getAttribute('href') || null
      }))
    );
    assert.ok(cards.some(row => row.title.includes('Maintenance work completed')));
    assert.ok(cards.every(row => row.link === '/rentee/maintenance/' + staffResult.requestId));
    const foreignVisible = await renterA.evaluate(id =>
      document.body.innerText.includes(id), seeded.requestB
    );
    assert.equal(foreignVisible, false, 'renter A must not see tenant B request');

    const mark = await renterA.$(requestSelector + ' button[aria-label^="Mark notification"]');
    assert.ok(mark, 'renter A must have at least one unread lifecycle notification');
    const notificationId = await renterA.evaluate(element =>
      element.closest('article').getAttribute('data-notification-id'), mark
    );
    assert.equal(await notificationRead(notificationId), false);
    await mark.click();
    await renterA.waitForFunction(noticeId => {
      const item = document.querySelector('article[data-notification-id="' + noticeId + '"]');
      return item && item.innerText.includes('Read') && !item.innerText.includes('Mark as read');
    }, { timeout: 30000, polling: 200 }, notificationId);
    assert.equal(await notificationRead(notificationId), true,
      'actual browser mark-as-read must persist in SQL');
  } finally {
    await renterA.close();
  }

  const manager = await open({
    item: { ...a, ...staffResult.manager }, token: staffResult.manager.token,
    role: 'staff', path: '/dashboard/notifications'
  });
  try {
    const selector = 'article[data-request-id="' + staffResult.requestId + '"]';
    await manager.waitForSelector(selector, { timeout: 30000 });
    const visible = await manager.evaluate(() => document.body.innerText);
    assert.ok(visible.includes('New maintenance request'));
    assert.ok(!visible.includes(seeded.requestB), 'manager must not see tenant B notices');
    const href = await manager.$eval(selector + ' a[href]', node => node.getAttribute('href'));
    assert.equal(href, '/dashboard/maintenance/' + staffResult.requestId);
  } finally {
    await manager.close();
  }

  const renterB = await open({
    item: b, token: tokenB, role: 'rentee', path: '/rentee/notifications'
  });
  try {
    try {
      await renterB.waitForFunction(expected =>
        [...document.querySelectorAll('article[data-notification-id]')].some(node =>
          node.getAttribute('data-notification-id').toLowerCase() === expected.toLowerCase()
        ), { timeout: 30000, polling: 200 }, seeded.notificationB
      );
    } catch (error) {
      const state = await renterB.evaluate(() => ({
        route: location.pathname,
        text: document.body.innerText.slice(-2500),
        ids: [...document.querySelectorAll('article[data-notification-id]')]
          .map(node => node.getAttribute('data-notification-id'))
      }));
      throw new Error('Tenant B own inbox item missing: ' + JSON.stringify(state), { cause: error });
    }
    const visible = await renterB.evaluate(() => document.body.innerText);
    assert.ok(!visible.includes(staffResult.requestId), 'tenant B UI must not expose tenant A');
    assert.ok(!visible.includes(seeded.requestA), 'tenant B UI must not render foreign request');
    assert.ok(await renterB.$('h1'), 'renter B notification workspace should render');
  } finally {
    await renterB.close();
  }
  console.log('PASS: real renter/manager notification inbox screens, owner read-state and cross-tenant isolation');
}
