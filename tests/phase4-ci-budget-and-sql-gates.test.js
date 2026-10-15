import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const packageJson = JSON.parse(src('../package.json'));
const suite = packageJson.scripts['test:authorization'];
const eviaWebhook = src('../.github/workflows/test-evia-webhook.yml');
const eviaV2 = src('../.github/workflows/test-evia-oauth-v2.yml');
const eviaConfigure = src('../.github/workflows/configure-evia-webhook.yml');
const deploy = src('../.github/workflows/deploy-container-apps.yml');
const disposable = src('../scripts/test-billing-two-tenant-sqlserver.mjs');

test('central PR-head authorization suite retains all Evia tests before narrowing workflow triggers', () => {
  for (const file of [
    'tests/evia-webhook.test.js',
    'tests/evia-completed-documents.test.js',
    'tests/evia-oauth-v2.test.js',
    'tests/evia-signing-v2.test.js',
    'tests/evia-storage-retention.test.js',
    'tests/evia-audit-http.test.js'
  ]) {
    assert.ok(suite.split(' ').includes(file), 'central PR-head gate must still run ' + file);
  }
  assert.match(deploy, /- run: npm run test:authorization/);
  assert.match(deploy, /- run: npm run build/);
});

test('Evia-specific workflow paths preserve changes to Evia implementation but avoid routine server edits', () => {
  for (const workflow of [eviaWebhook, eviaV2]) {
    assert.match(workflow, /pull_request:/);
    assert.match(workflow, /push:/);
    assert.doesNotMatch(workflow, /^\s+- 'server\.js'$/m);
  }
  assert.match(eviaWebhook, /'src\/api\/evia\/\*\*'/);
  assert.match(eviaWebhook, /'src\/api\/storage\/\*\*'/);
  assert.match(eviaV2, /'src\/api\/evia\/oauthV2\.js'/);
  assert.match(eviaV2, /'src\/services\/eviaSignService\.js'/);
  assert.match(eviaV2, /'Dockerfile'/);
  assert.doesNotMatch(eviaWebhook, /^\s+- 'src\/api\/platform\/router\.js'$/m);
});

test('Evia webhook credentials remain production-only, manually dispatchable and deploy-provisioned on real Evia changes', () => {
  assert.match(eviaConfigure, /workflow_dispatch:/);
  assert.match(eviaConfigure, /environment: Production/);
  assert.match(eviaConfigure, /'src\/api\/evia\/\*\*'/);
  assert.match(eviaConfigure, /'\.github\/workflows\/configure-evia-webhook\.yml'/);
  assert.doesNotMatch(eviaConfigure, /^\s+- 'server\.js'$/m);
  assert.match(eviaConfigure, /EVIA_WEBHOOK_HMAC_SECRET/);
  assert.match(eviaConfigure, /az containerapp secret set/);
});

test('main deployment avoids non-runtime-only commits without weakening PR-head gates or production acceptance', () => {
  const mainPush = deploy.slice(deploy.indexOf('  push:'), deploy.indexOf('  workflow_dispatch:'));
  assert.match(deploy, /pull_request:\s*\n\s*branches: \[main\]/);
  for (const ignore of [
    "'**/*.md'", "'docs/**'", "'tests/**'", "'.github/workflows/**'",
    "'scripts/test-billing-two-tenant-sqlserver.mjs'",
    "'scripts/verify-phase4-maintenance-notification-http.mjs'",
    "'scripts/verify-phase4-renter-workspace-browser.mjs'",
    "'scripts/verify-phase4-payment-lifecycle-http.mjs'",
    "'scripts/verify-phase4-staff-maintenance-http.mjs'",
    "'scripts/verify-phase4-notification-inbox-browser.mjs'"
  ]) {
    assert.ok(mainPush.includes(ignore), 'avoid main rollout for non-runtime-only paths: ' + ignore);
  }
  assert.match(deploy, /if: github\.event_name != 'pull_request'/);
  assert.match(deploy, /Latest revision is ready|Public build fingerprint/);
});

test('disposable SQL tenant contract proof covers notification reads, marks and recipients plus maintenance images', () => {
  assert.match(disposable, /verifyMaintenanceNotificationIsolationAgainstDisposableSql\(pool, a, b\)/);
  assert.match(disposable, /listOwnNotificationPage\(/);
  assert.match(disposable, /markOwnNotificationRead\(/);
  assert.match(disposable, /requireNotificationTenantRecipient\(/);
  assert.match(disposable, /maintenance_request_images/);
  assert.match(disposable, /authorizeMaintenanceImageAttachment\(/);
  assert.match(disposable, /normalizeMaintenanceImageUrl\(/);
  assert.match(disposable, /const docker = args => execFileSync\('docker'/);
  assert.match(disposable, /'127\.0\.0\.1'/);
});
