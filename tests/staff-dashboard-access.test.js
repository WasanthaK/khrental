import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const dashboard = readFileSync(new URL('../src/pages/Dashboard.jsx', import.meta.url), 'utf8');
const effect = dashboard.slice(dashboard.indexOf('    let cancelled = false;'), dashboard.indexOf('\n  }, [user?.id'));
async function load(flags, failTable) {
  const calls = [];
  const state = {};
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const names = ['canViewProperties', 'canViewAgreements', 'canViewMaintenance', 'canViewInvoices', 'canViewTeam'];
  const run = new Function(...names, 'fetchData', 'fetchAppUsers', 'INVOICE_STATUS',
    'setLoading', 'setError', 'setActiveSection', 'setStats', 'setRecentInvoices', effect);
  run(...names.map(name => Boolean(flags[name])), async options => {
    calls.push(options.table);
    if (options.table === failTable) {return { error: new Error('Unavailable') };}
    return { count: 2, data: options.table === 'invoices' ? [{ status: 'paid' }] : [] };
  }, async () => { calls.push('team'); return []; },
  { PAID: 'paid', PENDING: 'pending', OVERDUE: 'overdue' },
  value => { if (!value) {finish();} }, value => { state.error = value; }, () => {},
  value => { state.stats = value; }, value => { state.recent = value; });
  await finished;
  return { calls, state };
}
test('maintenance staff loads permitted cards without invoice, agreement or team reads', async () => {
  const { calls, state } = await load({ canViewProperties: true, canViewMaintenance: true });
  assert.deepEqual(calls.sort(), ['maintenance_requests', 'properties']);
  assert.equal(state.error, null);
  assert.equal(state.stats.properties, 2);
  assert.deepEqual(state.recent, []);
});
test('read-only staff requests properties only; finance may request invoices', async () => {
  assert.deepEqual((await load({ canViewProperties: true })).calls, ['properties']);
  const finance = await load({ canViewProperties: true, canViewInvoices: true });
  assert.deepEqual(finance.calls, ['properties', 'invoices', 'invoices']);
  assert.equal(finance.state.stats.invoices.paid, 1);
});
test('authorized read failures remain visible rather than becoming false zero counts', async () => {
  const { state } = await load({ canViewProperties: true }, 'properties');
  assert.equal(state.error, 'Unavailable');
  assert.equal(state.stats, undefined);
});
test('invoice UI is hidden and workspace changes invalidate dashboard reads', () => {
  assert.equal((dashboard.match(/canViewInvoices && \(<button/g) || []).length, 2);
  assert.match(dashboard, /canViewInvoices && activeSection === 'invoices'/);
  assert.match(dashboard, /\[user\?\.id, activeTenantId,/);
  assert.match(dashboard, /canViewAgreements && renderStatCard/);
});
test('only GET status bypasses the legacy business guard, retaining authenticated handler', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const start = server.indexOf('const guardMssqlCompatibilityRoutes =');
  const end = server.indexOf("\n  app.use('/api/mssql'", start);
  const guard = new Function('resolveMssqlCompatibilityUser', server.slice(start, end) + '; return guardMssqlCompatibilityRoutes;');
  for (const [method, path, expected] of [
    ['GET', '/platform-admin/status', 'next'],
    ['POST', '/platform-admin/status', 'resolve'],
    ['GET', '/admin/tenants', 'resolve'],
    ['GET', '/platform-admin/status/extra', 'resolve']
  ]) {
    let reached;
    guard(() => { reached = 'resolve'; })({ method, path }, {}, () => { reached = 'next'; });
    assert.equal(reached, expected);
  }
  const router = readFileSync(new URL('../src/api/mssql/platformAdminRouter.js', import.meta.url), 'utf8');
  assert.match(router, /router.get\('\/platform-admin\/status', requireResolvedUser/);
  assert.match(router, /router.use\('\/admin', requireResolvedUser, requirePlatformAdmin\)/);
});
