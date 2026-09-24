import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const activeServiceSource = readFileSync(
  new URL('../src/services/eviaSignService.js', import.meta.url),
  'utf8'
);
const legacyServiceSource = readFileSync(
  new URL('../src/services/eviaSignServiceLegacy.js', import.meta.url),
  'utf8'
);
const agreementActionsSource = readFileSync(
  new URL('../src/components/agreements/AgreementActions.jsx', import.meta.url),
  'utf8'
);

test('active signing service delegates document send to the proven type-3 AutoStamp implementation', () => {
  assert.match(
    activeServiceSource,
    /sendDocumentForSignature as sendDocumentWithProvenAutoStamp/
  );
  assert.match(
    activeServiceSource,
    /export async function sendDocumentForSignature\(params\) \{\s*return sendDocumentWithProvenAutoStamp\(params\);\s*\}/
  );
  assert.doesNotMatch(
    activeServiceSource,
    /createAndSendV2SignatureRequest\(\{/
  );
});

test('proven AutoStamp payload keeps marker placement metadata required by KH Rentals', () => {
  assert.match(legacyServiceSource, /\?type=3/);
  assert.match(legacyServiceSource, /Identifier": signatory\.textMarker \|\| `For \$\{index === 0 \? 'Landlord' : 'Tenant'\}:`/);
  assert.match(legacyServiceSource, /"Color": "#7c95f4"/);
  assert.match(legacyServiceSource, /"Order": 1/);
  assert.match(legacyServiceSource, /"X_offset": 0/);
  assert.match(legacyServiceSource, /"Y_offset": -50/);
  assert.match(legacyServiceSource, /"StampSize": \{\s*"Height": 50,\s*"Width": 100\s*\}/);
  assert.match(legacyServiceSource, /"Type": "signature"/);
});

test('agreement signing supplies the exact landlord and tenant marker identifiers', () => {
  assert.match(agreementActionsSource, /textMarker: 'For Landlord:'/);
  assert.match(agreementActionsSource, /textMarker: 'For Tenant:'/);
  assert.match(agreementActionsSource, /sendDocumentForSignature\(signatureData\)/);
});

test('V2 OAuth and secured webhook model remain separate from signature placement repair', () => {
  assert.match(activeServiceSource, /EVIA_AUTHORIZATION_URL/);
  assert.match(activeServiceSource, /\/api\/evia\/token/);
  assert.match(activeServiceSource, /getSignatureStatus/);
  assert.match(activeServiceSource, /V2 OAuth/);
});
