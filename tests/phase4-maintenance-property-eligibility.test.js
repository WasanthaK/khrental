import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { maintenancePropertiesFromTenancies } from '../src/services/maintenancePropertyEligibility.js';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('active tenancy properties alone become selectable, duplicates collapse', () => {
 const a={agreement_status:'active',property_id:'ABC',property_name:'Home'};
 const result=maintenancePropertiesFromTenancies({tenancies:[a,{...a,property_id:'abc'}]});
 assert.deepEqual(result,[{id:'ABC',name:'Home',address:null}]);
});
test('missing or malformed tenancy projection fails closed',()=>{
 for (const data of [null,{}, {tenancies:null},{tenancies:[{property_id:'x',property_name:'Wrong',agreement_status:'closed'}]},{tenancies:[{property_id:'x',agreement_status:'active'}]}]) {
   assert.throws(()=>maintenancePropertiesFromTenancies(data));
 }
 assert.deepEqual(maintenancePropertiesFromTenancies({tenancies:[]}),[]);
});
test('maintenance selector uses server tenancy identity, resets on tenant switch, and no generic property transport',()=>{
 const form=read('../src/components/maintenance/MaintenanceRequestForm.jsx');
 assert.match(form,/getMyTenancySummary\(\)/);
 assert.match(form,/maintenancePropertiesFromTenancies\(data\)/);
 assert.match(form,/activeTenantId/);
 assert.match(form,/cancelled = true/);
 assert.match(form,/properties\.some\(p => p\.id === formData\.propertyid\)/);
 assert.doesNotMatch(form,/from\('properties'\)|fetchAppUser|associated_property_ids/);
 const server=read('../src/api/platform/tenancyOnboardingRouter.js');
 assert.match(server,/a\.renteeid = @renteeId/);
 assert.match(server,/a\.tenant_id = @tenantId/);
 assert.match(server,/a\.status = 'active'/);
});
