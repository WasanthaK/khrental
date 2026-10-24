import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file = new URL('../.github/workflows/r3-b04-production-disabled-boundary.yml', import.meta.url);
const workflow = readFileSync(file, 'utf8');
const runtime = readFileSync(new URL('../src/api/auth/publicSignupRuntime.js', import.meta.url), 'utf8');

test('R3 public signed-out acceptance is default OFF, no request body or customer action', () => {
  for (const flag of [
    'PUBLIC_SIGNUP_ENABLED', 'PUBLIC_SIGNUP_PILOT_APPROVED',
    'PUBLIC_SEEKER_CONTEXT_ENABLED', 'VITE_PUBLIC_SIGNUP_UI_ENABLED',
    'VITE_PUBLIC_SEEKER_LANDING_ENABLED'
  ]) assert.ok(workflow.includes('field("'+flag+'") == "false"'), flag);
  assert.match(workflow, /PUBLIC_SIGNUP_DISABLED/);
  assert.match(workflow, /AUTH_CONTEXT_REQUIRED/);
  assert.match(workflow, /api\/public-signup\/\$endpoint/);
  assert.match(workflow, /api\/platform\/auth\/seeker-context/);
  assert.match(workflow, /R3_SIGNED_OUT_PRODUCTION_NEGATIVE_ACCEPTANCE=PASS/);
  assert.doesNotMatch(workflow, /--data|--data-binary|--data-raw|--form |--min-replicas|az sql db update|stripe\.com\/v1|sendgrid\.com\/v3/);
});

test('R3 live acceptance does not modify signup runtime gates or bypass them', () => {
  assert.match(runtime, /PUBLIC_SIGNUP_ENABLED/);
  assert.match(runtime, /PUBLIC_SIGNUP_PILOT_APPROVED/);
  assert.match(workflow, /latestReadyRevisionName/);
  assert.match(workflow, /build-info\.json/);
  assert.match(workflow, /no-mailbox/i);
});
