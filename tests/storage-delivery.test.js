import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStoragePath } from '../src/api/storage/index.js';

test('normalizeStoragePath preserves nested tenant object paths', () => {
  assert.equal(
    normalizeStoragePath('/tenants/FEEC0269-D580-49C3-A982-5B3ECBBB1A09/properties/1789547843116_j94ui11e.jpg'),
    'tenants/FEEC0269-D580-49C3-A982-5B3ECBBB1A09/properties/1789547843116_j94ui11e.jpg'
  );
});

test('normalizeStoragePath rejects path traversal', () => {
  assert.throws(() => normalizeStoragePath('../secret.txt'), /Invalid storage path/);
});
