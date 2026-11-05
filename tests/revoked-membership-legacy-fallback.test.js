import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tenantContextInternals } from '../src/api/tenant/context.js';

const { selectActiveMembership } = tenantContextInternals;
const source = readFileSync(new URL('../src/api/tenant/context.js', import.meta.url), 'utf8');

const legacyUser = {
  id: 'user-1',
  role: 'admin',
  user_type: 'admin',
  tenant_id: 'tenant-old'
};

test('historical tenant pointer never grants access without an active membership', () => {
  const context = selectActiveMembership({
    requestedTenantId: null,
    memberships: [],
    user: legacyUser
  });
  assert.equal(context.tenantId, null);
  assert.equal(context.membership, null);
  assert.equal(context.resolution, 'none');
});

test('an explicit request for a tenant on a stale historical pointer fails closed', () => {
  assert.throws(() => selectActiveMembership({
    requestedTenantId: 'tenant-old',
    memberships: [],
    user: legacyUser
  }), (error) => error.status === 403 && error.code === 'TENANT_NOT_RESOLVED');
});

test('legacy fallback cannot be reenabled through stale caller argument', () => {
  const context = selectActiveMembership({
    requestedTenantId: null,
    memberships: [],
    user: legacyUser,
    allowLegacyTenantFallback: true
  });
  assert.equal(context.resolution, 'none');
  assert.equal(context.tenantId, null);
  assert.throws(() => selectActiveMembership({
    requestedTenantId: 'tenant-old',
    memberships: [],
    user: legacyUser,
    allowLegacyTenantFallback: true
  }), (error) => error.status === 403);
});

test('active membership still grants only its own tenant', () => {
  const context = selectActiveMembership({
    requestedTenantId: 'tenant-live',
    memberships: [{
      id: 'membership-1',
      tenant_id: 'tenant-live',
      role: 'rentee',
      status: 'active',
      is_default: true,
      tenant: { id: 'tenant-live', status: 'active' }
    }],
    user: legacyUser
  });
  assert.equal(context.tenantId, 'tenant-live');
  assert.equal(context.membership.role, 'rentee');
  assert.throws(() => selectActiveMembership({
    requestedTenantId: 'tenant-old',
    memberships: [{
      tenant_id: 'tenant-live', role: 'rentee', status: 'active',
      tenant: { id: 'tenant-live', status: 'active' }
    }],
    user: legacyUser
  }), (error) => error.status === 403 && error.code === 'TENANT_ACCESS_DENIED');
});

test('no legacy-user-tenant resolution or record-history compatibility branch remains', () => {
  assert.doesNotMatch(source, /legacy-user-tenant/);
  assert.doesNotMatch(source, /allowLegacyTenantFallback/);
  assert.doesNotMatch(source, /hasRecordedTenantMembership/);
  assert.match(source, /selectActiveMembership\(\{ requestedTenantId, memberships, user \}\)/);
});

test('ambiguous active memberships return only safe own organization choices, with no access grant',()=>{
  const memberships=['one','two'].map(tenant_id=>({id:'member-'+tenant_id,tenant_id,role:'rentee',status:'active',
    app_user_id:'private-actor',permission_bundle:null,tenant:{id:tenant_id,name:tenant_id,plan:'private-plan'}}));
  assert.throws(()=>selectActiveMembership({memberships,user:{id:'actor'},requestedTenantId:null}),error=>{
    assert.equal(error.status,409);
    assert.equal(error.code,'TENANT_SELECTION_REQUIRED');
    assert.deepEqual(error.details.memberships,memberships.map(({id,tenant_id,role,status,tenant})=>({
      id,tenant_id,role,status,tenant:{id:tenant.id,name:tenant.name}})));
    return true;
  });
  assert.equal(selectActiveMembership({memberships,user:{id:'actor'},requestedTenantId:'two'}).membership.role,'rentee');
  assert.throws(()=>selectActiveMembership({memberships,user:{id:'actor'},requestedTenantId:'foreign'}),
    error=>error.status===403&&error.code==='TENANT_ACCESS_DENIED');
});

test('browser selection state clears cached authority until server-confirmed organization choice',()=>{
  const auth=readFileSync(new URL('../src/hooks/useAuth.jsx',import.meta.url),'utf8');
  const start=auth.indexOf('  const normalizeTenantState =');
  const end=auth.indexOf('\n  const mergeTenantContext',start);
  const normalize=new Function(auth.slice(start,end)+';return normalizeTenantState;')();
  const choices=[{tenant_id:'a',role:'admin',status:'active'},{tenant_id:'b',role:'rentee',status:'active'}];
  const result=normalize({role:'authenticated',tenant_id:'old',tenantId:'old',membership:choices[0]},
    {resolution:'selection-required',memberships:choices});
  assert.equal(result.tenantId,null);assert.equal(result.tenant_id,null);assert.equal(result.membership,null);
  assert.equal(result.hasTenantAccess,false);assert.equal(result.tenantContextVerified,true);
  const selected=normalize(result,{resolution:'requested',tenantId:'b',membership:choices[1],memberships:choices});
  assert.equal(selected.membership.role,'rentee');assert.equal(selected.tenantId,'b');
});
