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

test('the production inventory reports only sanitized read-only evidence to issue 388', () => {
  assert.match(source, /issues: write/);
  assert.match(source, /id: redis_audit/);
  assert.match(source, /if: always\(\)/);
  assert.match(source, /INVENTORY_OUTCOME: \$\{\{ steps\.redis_audit\.outcome \}\}/);
  assert.match(source, /if \[ "\$INVENTORY_OUTCOME" = "success" \]/);
  assert.match(source, /Result: UNKNOWN/);
  assert.match(source, /No zero count or availability claim can be made/);
  assert.match(source, /gh issue comment 388 --repo "\$GITHUB_REPOSITORY" --body-file redis-audit-issue\.md/);
  assert.doesNotMatch(source, /gh issue (?:close|edit|delete)/);
  assert.doesNotMatch(source, /gh secret|gh variable|gh auth login/);
  assert.match(source, /Public signup remains OFF/);
});
