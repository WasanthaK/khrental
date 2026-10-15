import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMaintenanceListScope, parseMaintenanceListPage } from '../src/api/platform/maintenanceListScope.js';
const source = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('renter only gets server actor-owned requests', () => {
  assert.deepEqual(buildMaintenanceListScope({actorId:'u',isRenter:true,canManage:true,isAdmin:true}),
    { predicate:'mr.renteeid = @actorId', params:{actorId:'u'} });
});
test('manager must have assigned properties and workers only their assignments', () => {
  assert.equal(buildMaintenanceListScope({actorId:'w',canManage:true}).predicate,'1 = 0');
  assert.match(buildMaintenanceListScope({actorId:'w',canManage:true,assignedPropertyIds:['p']}).predicate,/OPENJSON/);
  assert.equal(buildMaintenanceListScope({actorId:'w',canUpdateAssigned:true}).predicate,'(mr.assignedto = @actorId)');
  assert.throws(()=>buildMaintenanceListScope({actorId:'w'}),/permission/);
});
test('admin gets organizational list but tenant predicate remains mandatory', () => {
  assert.equal(buildMaintenanceListScope({actorId:'a',canManage:true,isAdmin:true}).predicate,'1 = 1');
  const router=source('../src/api/platform/maintenanceLifecycleRouter.js');
  assert.match(router,/WHERE mr.tenant_id=@tenantId AND \$\{scope.predicate\}/);
  assert.match(router,/AND maintenance_request_id IN/);
  assert.match(router,/ORDER BY mr.createdat DESC, mr.id DESC/);
  assert.match(router,/createTenantContextMiddleware/);
});
test('pagination invalid values rejected without database access', () => {
  for(const value of [{limit:101},{limit:0},{limit:-1},{offset:-1},{limit:'abc'},{offset:'1.2'}]){
    assert.throws(()=>parseMaintenanceListPage(value));
  }
  assert.deepEqual(parseMaintenanceListPage({}),{limit:100,offset:0});
});
test('routed pages no longer query the compatibility maintenance table',()=>{
 for(const p of ['../src/pages/MaintenanceList.jsx','../src/pages/rentee/RenteeMaintenance.jsx']){
  const code=source(p);
  assert.match(code,/listAuthorizedMaintenanceRequests\(\)/);
  assert.doesNotMatch(code,/from\('maintenance_requests'\)/);
  assert.match(code,/setMaintenanceRequests\(\[\]\)/);
 }
});
