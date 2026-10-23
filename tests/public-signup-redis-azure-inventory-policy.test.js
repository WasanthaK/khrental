import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../.github/workflows/audit-b04-azure-redis-readonly.yml', import.meta.url), 'utf8'
);

test('Azure Redis inventory uses only existing production OIDC and read-only commands', () => {
  assert.match(source, /name: Audit B04 Azure Redis availability \(read-only\)/);
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /environment: Production/);
  assert.match(source, /uses: azure\/login@v2/);
  assert.match(source, /az redisenterprise list --resource-group/);
  assert.match(source, /az redis list --resource-group/);
  assert.match(source, /az containerapp show --name/);
  assert.match(source, /--query 'properties\.environmentId'/);
  assert.match(source, /B04_REDIS_AZURE_INVENTORY_OK/);
  // No cloud resources, credentials or existing users may be mutated.
  assert.doesNotMatch(source, /az (?:redisenterprise|redis|containerapp|group|keyvault|rest) (?:create|delete|update|set|patch|put|regenerate|list-keys)/);
  assert.doesNotMatch(source, /az (?:containerapp secret|containerapp exec|deployment group create)/);
  assert.doesNotMatch(source, /list-keys|show-keys|adminKeys|accessKeys|primaryKey|secretref/);
  assert.doesNotMatch(source, /curl |Invoke-WebRequest/);
  assert.doesNotMatch(source, /echo.*\$\{\{\s*secrets\./);
});

test('inventory does not claim resource absence outside the approved production group', () => {
  assert.match(source, /A zero count applies only to this resource group/);
  assert.match(source, /not proof of same-VNet reachability/i);
  assert.match(source, /resource metadata only/);
});

test('subscription-wide scan uses only read-only resource metadata operations', () => {
  assert.match(source, /az resource list --subscription/);
  assert.match(source, /--resource-type Microsoft\.Cache\/redisEnterprise/);
  assert.match(source, /--resource-type Microsoft\.Cache\/Redis/);
  assert.match(source, /--query location -o tsv/);
  assert.match(source, /B04_REDIS_SUBSCRIPTION_INVENTORY_OK/);
  assert.doesNotMatch(source, /az resource (?:create|update|delete|invoke-action)/);
  assert.doesNotMatch(source, /az redisenterprise (?:create|update|delete)/);
  assert.doesNotMatch(source, /az redis (?:create|update|delete)/);
  assert.doesNotMatch(source, /(?:list-keys|connectionString|primaryKey|secondaryKey)/i);
});
