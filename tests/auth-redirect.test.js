import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReturnPath, getPostLoginPath,getExistingPropertyWorkspacePath } from '../src/utils/authRedirect.js';

test('existing property workspace navigation follows active membership, not email or a global role',()=>{
  const membership={tenant_id:'current-business',role:'admin',status:'active'};
  for(const email of ['owner-a@example.test','owner-b@example.test']){
    assert.equal(getExistingPropertyWorkspacePath({user:{id:'account',role:'authenticated',email},membership}),'/dashboard/properties');
  }
  assert.equal(getExistingPropertyWorkspacePath({user:{role:'admin'},membership:null}),null);
  assert.equal(getExistingPropertyWorkspacePath({user:{role:'admin'},membership:{...membership,status:'revoked'}}),null);
  assert.equal(getExistingPropertyWorkspacePath({user:{role:'authenticated'},membership:{...membership,role:'rentee'}}),null);
  assert.equal(getExistingPropertyWorkspacePath({user:{role:'staff'},membership:{...membership,role:'staff',permission_bundle:'read_only'}}),'/dashboard/properties');
});

test('protected tenant deep links survive the login round trip', () => {
  const state = {
    from: {
      pathname: '/portal/invoices',
      search: '',
      hash: ''
    }
  };

  assert.equal(getPostLoginPath(state, '/rentee'), '/portal/invoices');
});

test('return paths preserve query strings and hashes', () => {
  assert.equal(
    buildReturnPath({
      pathname: '/portal/invoices',
      search: '?status=pending',
      hash: '#latest'
    }),
    '/portal/invoices?status=pending#latest'
  );
});

test('missing or unsafe return paths use the supplied fallback', () => {
  assert.equal(getPostLoginPath(null, '/rentee'), '/rentee');
  assert.equal(getPostLoginPath({ from: { pathname: 'https://example.com' } }, '/rentee'), '/rentee');
  assert.equal(getPostLoginPath({ from: { pathname: '//example.com/path' } }, '/rentee'), '/rentee');
});
