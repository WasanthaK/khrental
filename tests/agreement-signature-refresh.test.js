import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('agreement list refreshes pending signature cards without SignalR', () => {
  const source = fs.readFileSync(new URL('../src/pages/AgreementList.jsx', import.meta.url), 'utf8');

  assert.match(source, /window\.setInterval\(refresh, 30000\)/);
  assert.match(source, /window\.addEventListener\('focus', refresh\)/);
  assert.match(source, /document\.addEventListener\('visibilitychange', refresh\)/);
  assert.match(source, /fetchAgreements\(\{ background: true \}\)/);
  assert.match(source, /pending_signature/);
  assert.match(source, /in_progress/);
});

test('MSSQL mode does not rely on the legacy realtime subscription', () => {
  const source = fs.readFileSync(new URL('../src/components/agreements/AgreementActions.jsx', import.meta.url), 'utf8');

  assert.match(source, /if \(isMssqlApiEnabled\(\)\) \{[\s\S]*return undefined;/);
});


test('agreement details captures temporary Evia diagnostics without relying on production console output', () => {
  const detailsSource = fs.readFileSync(new URL('../src/pages/AgreementDetails.jsx', import.meta.url), 'utf8');
  const serviceSource = fs.readFileSync(new URL('../src/services/eviaSignService.js', import.meta.url), 'utf8');
  const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(detailsSource, /captureEviaDiagnosticSnapshot/);
  assert.match(detailsSource, /Temporary Evia Diagnostics/);
  assert.match(serviceSource, /\/api\/evia\/diagnostics\/poll/);
  assert.match(serverSource, /app\.post\('\/api\/evia\/diagnostics\/poll'/);
  assert.match(serverSource, /eventType: 'client_status_poll'/);
  assert.match(serverSource, /PERMISSIONS\.AGREEMENTS_MANAGE/);
  assert.doesNotMatch(serverSource, /providerPoll[\s\S]{0,500}(?:authToken|accessToken|callbackToken)/);
});
