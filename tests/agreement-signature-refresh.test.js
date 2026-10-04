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


test('agreement form send flow uses secure agreement-bound Evia callback', () => {
  const source = fs.readFileSync(new URL('../src/components/agreements/AgreementFormContainer.jsx', import.meta.url), 'utf8');

  assert.match(source, /getEviaAgreementCallbackUrl/);
  assert.match(source, /callbackUrl = await getEviaAgreementCallbackUrl\(agreement\.id\)/);
  assert.match(source, /callbackUrl,/);
  assert.match(source, /callbackTypes: \[0\]/);
  assert.doesNotMatch(source, /VITE_EVIA_WEBHOOK_URL/);
  assert.doesNotMatch(source, /webhookUrl,/);
});
