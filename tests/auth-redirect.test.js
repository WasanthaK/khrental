import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReturnPath, getPostLoginPath,getExistingPropertyWorkspacePath,getTenantSwitchLandingPath } from '../src/utils/authRedirect.js';

test('tenant switching selects the verified membership portal independently of global role', () => {
  for (const role of ['admin', 'authenticated', 'rentee']) {
    const user = { role, tenantContextVerified: true };
    assert.equal(getTenantSwitchLandingPath({...user,membership:{tenant_id:'next',status:'active',role:'admin'}},'NEXT'),'/dashboard');
    assert.equal(getTenantSwitchLandingPath({...user,membership:{tenant_id:'next',status:'active',role:'rentee'}},'next'),'/rentee');
    assert.equal(getTenantSwitchLandingPath({...user,membership:{tenant_id:'next',status:'active',role:'staff'}},'next'),'/dashboard');
  }
});

test('tenant switch navigation refuses missing, unverified, revoked or mismatched membership results', () => {
  const valid = {tenantContextVerified:true,role:'admin',membership:{tenant_id:'next',status:'active',role:'admin'}};
  for (const result of [null,{role:'admin'}, {...valid,tenantContextVerified:false}, {...valid,tenantContextVerified:undefined}, {...valid,membership:null}, {...valid,membership:{...valid.membership,status:'revoked'}}, {...valid,membership:{...valid.membership,tenant_id:'previous'}}]) {
    assert.equal(getTenantSwitchLandingPath(result,'next'),null);
  }
  assert.equal(getTenantSwitchLandingPath(valid,''),null);
  assert.equal(getTenantSwitchLandingPath({...valid,membership:{...valid.membership,role:undefined}},'next'),null);
  assert.equal(getTenantSwitchLandingPath({...valid,membership:{...valid.membership,role:'unknown'}},'next'),null);
});

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


test('failed workspace lookup cannot choose a cached owner workspace',()=>{
  assert.equal(getExistingPropertyWorkspacePath({user:{id:'account',role:'admin',tenantContextVerified:false},membership:{tenant_id:'old',status:'active',role:'admin'}}),null);
});
