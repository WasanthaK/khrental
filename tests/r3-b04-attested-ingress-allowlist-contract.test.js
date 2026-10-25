import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file = readFileSync(new URL('../.github/workflows/r3-b04-ingress-allowlist-accept.yml', import.meta.url), 'utf8');

test('R3 production ingress allowlist uses only observed exact private socket addresses', () => {
  assert.match(file, /clean\["peer"\] != spoof\["peer"\]/);
  assert.match(file, /clean\["rightmost"\] != spoof\["rightmost"\]/);
  assert.match(file, /ipaddress\.ip_address\(clean\["peer"\]\)/);
  assert.match(file, /10\.0\.0\.0\/8/);
  assert.match(file, /172\.16\.0\.0\/12/);
  assert.match(file, /192\.168\.0\.0\/16/);
  assert.match(file, /fc00::\/7/);
  assert.match(file, /not 1 <= len\(peers\) <= 2/);
  assert.match(file, /PUBLIC_SIGNUP_TRUSTED_INGRESS_PEERS="\$installed_peers"/);
  assert.match(file, /no overwrite/);
});

test('R3 no-spend, default-off pilot does not enable public signup or change SQL/replica pricing', () => {
  for (const flag of [
    'PUBLIC_SIGNUP_ENABLED=false', 'PUBLIC_SIGNUP_PILOT_APPROVED=false',
    'PUBLIC_SEEKER_CONTEXT_ENABLED=false',
    'VITE_PUBLIC_SIGNUP_UI_ENABLED=false',
    'VITE_PUBLIC_SEEKER_LANDING_ENABLED=false'
  ]) assert.ok(file.includes(flag));
  assert.match(file, /R3_EXACT_INGRESS_PEERS_CONFIGURED_AND_READY=PASS/);
  assert.match(file, /R3_TEMPORARY_PROBE_SECRET_REMOVED=PASS/);
  assert.doesNotMatch(file, /az sql db update|az containerapp scale|--min-replicas|--max-replicas|--scale-rule|GRANT DELETE/);
  assert.doesNotMatch(file, /curl.*\/api\/public-signup\/challenge/);
  assert.doesNotMatch(file, /curl.*\/api\/public-signup\/redeem/);
});
