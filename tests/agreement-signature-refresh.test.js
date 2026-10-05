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


test('signature progress counter prefers recorded completed signers over pending agreement status', () => {
  const source = fs.readFileSync(new URL('../src/components/ui/SignatureProgressTracker.jsx', import.meta.url), 'utf8');

  const completedBranch = source.indexOf('} else if (completed > 0) {');
  const pendingBranch = source.indexOf("status === 'pending'");
  assert.ok(completedBranch >= 0, 'completed signer branch is present');
  assert.ok(pendingBranch >= 0, 'pending status branch is present');
  assert.ok(completedBranch < pendingBranch, 'completed signer count is evaluated before pending status');
  assert.match(source, /label: `\$\{completed\} of \$\{total\} Signed`/);
});


test('completed agreement view reconciles and opens retained signed document instead of unsigned original', () => {
  const cardSource = fs.readFileSync(new URL('../src/components/agreements/AgreementSummaryCard.jsx', import.meta.url), 'utf8');
  const actionsSource = fs.readFileSync(new URL('../src/components/agreements/AgreementActions.jsx', import.meta.url), 'utf8');
  const serviceSource = fs.readFileSync(new URL('../src/services/eviaSignService.js', import.meta.url), 'utf8');
  const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(cardSource, /reconcileEviaSignedDocument/);
  assert.match(cardSource, /const documentUrlToView = isSignatureComplete[\s\S]*\? signedDocumentUrl[\s\S]*: \(signedDocumentUrl \|\| agreement\.pdfurl \|\| agreement\.documenturl\)/);
  assert.match(cardSource, /await reconcileEviaSignedDocument\(agreement\.id\)/);
  assert.match(actionsSource, /const viewDocumentUrl = isSignatureComplete \? retainedSignedDocumentUrl : agreement\.documenturl/);
  assert.doesNotMatch(actionsSource, /window\.open\(agreement\.documenturl/);
  assert.match(serviceSource, /\/api\/evia\/agreements\/\$\{encodeURIComponent\(agreementId\)\}\/signed-document/);
  assert.match(serverSource, /app\.post\('\/api\/evia\/agreements\/:agreementId\/signed-document'/);
  assert.match(serverSource, /PERMISSIONS\.AGREEMENTS_MANAGE/);
  assert.match(serverSource, /retrieveAndStoreEviaCompletedDocuments/);
});
