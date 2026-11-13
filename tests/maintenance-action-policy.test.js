import test from 'node:test';
import assert from 'node:assert/strict';
import { canActOnMaintenance } from '../src/utils/maintenanceActionPolicy.js';

const request = { propertyid: 'property-a', assignedto: 'APP-A' };
test('workspace administrator can act when the global profile role is authenticated', () => {
  assert.equal(canActOnMaintenance({user:{role:'authenticated'},membership:{role:'admin'},request}),true);
});
test('active membership overrides a legacy global admin role', () => {
  for (const role of ['rentee','finance_staff']) {
    assert.equal(canActOnMaintenance({user:{role:'admin',profileId:'app-a'},membership:{role},request}),false);
  }
});
test('maintenance workers need the assigned application identity, never the auth ID', () => {
  const membership={role:'staff',permission_bundle:'maintenance'};
  assert.equal(canActOnMaintenance({user:{id:'auth-a',profileId:'app-a'},membership,request}),true);
  assert.equal(canActOnMaintenance({user:{id:'APP-A'},membership,request}),false);
  assert.equal(canActOnMaintenance({user:{profileId:'app-b'},membership,request}),false);
  assert.equal(canActOnMaintenance({user:{profileId:'app-a'},membership,request:{...request,assignedto:null}}),false);
});
test('property operations managers need property scope', () => {
  const user={role:'authenticated'},membership={role:'staff',permission_bundle:'property_operations'};
  assert.equal(canActOnMaintenance({user,membership,request}),false);
  assert.equal(canActOnMaintenance({user,membership:{...membership,assignedPropertyIds:['PROPERTY-A']},request}),true);
});
test('missing account or request has no actions', () => {
  assert.equal(canActOnMaintenance({membership:{role:'admin'},request}),false);
  assert.equal(canActOnMaintenance({user:{role:'admin'}}),false);
});
