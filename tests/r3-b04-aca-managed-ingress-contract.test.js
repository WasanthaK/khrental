import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const runtime = readFileSync(new URL('../src/api/auth/publicSignupRuntime.js', import.meta.url), 'utf8');
const guard = readFileSync(new URL('../src/api/auth/publicSignupIngressGuard.js', import.meta.url), 'utf8');
const job = readFileSync(new URL('../.github/workflows/r3-b04-aca-managed-ingress-accept.yml', import.meta.url), 'utf8');

test('R3 managed ingress requires explicit server-only production mode, not client headers', () => {
  assert.match(runtime, /config.NODE_ENV === 'production'/);
  assert.match(runtime, /config.PUBLIC_SIGNUP_INGRESS_MODE === 'azure-container-apps-http'/);
  assert.match(runtime, /azureManagedHttpIngress: acaMode/);
  assert.match(guard, /req\?\.headers\?\.\['x-forwarded-proto'\] !== 'https'/);
  assert.match(guard, /xffOccurrences\.length !== 1/);
  assert.match(guard, /hops\[hops.length - 1\]/);
  assert.doesNotMatch(guard, /req\.ip|req\.ips|app\.set\(['"]trust proxy/);
});

test('R3 independent OIDC acceptance requires exactly Azure-managed HTTPS HTTP ingress', () => {
  for (const field of [
    '$ing.external == true',
    '$ing.transport == "auto"',
    '$ing.targetPort == 5174',
    '$ing.allowInsecure == false',
    '$ing.additionalPortMappings',
    'app.quixo.homes',
    'latestReadyRevisionName',
    'build-info.json',
    'R3_ACA_MANAGED_HTTP_INGRESS_TOPOLOGY=PASS',
    'R3_ACA_MANAGED_INGRESS_ASSERTED_READY_DISABLED=PASS'
  ]) assert.ok(job.includes(field), field);
  for (const f of [
    'PUBLIC_SIGNUP_ENABLED=false',
    'PUBLIC_SIGNUP_PILOT_APPROVED=false',
    'PUBLIC_SEEKER_CONTEXT_ENABLED=false',
    'VITE_PUBLIC_SIGNUP_UI_ENABLED=false',
    'VITE_PUBLIC_SEEKER_LANDING_ENABLED=false'
  ]) assert.ok(job.includes(f), f);
  assert.match(job, /PUBLIC_SIGNUP_INGRESS_MODE=azure-container-apps-http/);
  assert.doesNotMatch(job, /az sql db update|az containerapp scale|--min-replicas|GRANT DELETE|trust proxy=true/);
});
