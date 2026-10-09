import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('unused config platform-client forwarding shim stays absent', () => {
  assert.equal(existsSync(new URL('../src/config/platformClient.js', import.meta.url)), false);
});

test('live platform client and script-local forwarding shim remain available', () => {
  assert.equal(existsSync(new URL('../src/services/platformClient.js', import.meta.url)), true);
  const scriptShim = readFileSync(new URL('../src/scripts/platformClient.js', import.meta.url), 'utf8');
  assert.match(scriptShim, /export \* from '\.\.\/services\/platformClient'/);
  assert.match(scriptShim, /export \{ default \} from '\.\.\/services\/platformClient'/);
});
