import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORM_BOOTSTRAP_OWNER_EMAIL,
  isBootstrapPlatformOwner
} from '../src/api/mssql/platformAdminRouter.js';

test('recognizes only the designated bootstrap platform owner email', () => {
  assert.equal(PLATFORM_BOOTSTRAP_OWNER_EMAIL, 'wweerakoone@gmail.com');
  assert.equal(isBootstrapPlatformOwner({ email: 'wweerakoone@gmail.com' }), true);
  assert.equal(isBootstrapPlatformOwner({ email: ' WWeerakoone@gmail.com ' }), true);
  assert.equal(isBootstrapPlatformOwner({ email: 'admin@example.com' }), false);
  assert.equal(isBootstrapPlatformOwner({}), false);
});
