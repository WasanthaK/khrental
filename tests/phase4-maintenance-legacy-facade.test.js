import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = p => readFileSync(new URL(p,import.meta.url),'utf8');
const facade=source('../src/services/maintenanceService.js');
const compatibility=source('../src/services/maintenanceCompatibilityBoundary.js');
test('public facade never re-exports legacy generic SQL writes',()=>{
 assert.doesNotMatch(facade,/export \* from '\.\/maintenanceServiceLegacy/);
 assert.match(facade,/maintenanceCompatibilityBoundary/);
 assert.match(compatibility,/getAuthorizedMaintenanceDetail/);
 assert.match(compatibility,/listAuthorizedMaintenanceRequests/);
 assert.doesNotMatch(compatibility,/platformClient|deleteData|updateData|\.from\(/);
});
test('legacy caller-supplied tenant or role is never forwarded into authorized list',()=>{
 assert.match(compatibility,/getMaintenanceRequests = async \(_userId, _role\)/);
 assert.match(compatibility,/MAINTENANCE_GENERIC_MUTATION_DISABLED/);
 assert.match(compatibility,/addMaintenanceComment\(id/);
});
test('routed screens still use the canonical detail and list readers',()=>{
 for(const path of ['../src/pages/MaintenanceDetails.jsx','../src/pages/rentee/RenteeMaintenanceDetails.jsx']){
   assert.match(source(path),/getAuthorizedMaintenanceDetail/);
 }
 for(const path of ['../src/pages/MaintenanceList.jsx','../src/pages/rentee/RenteeMaintenance.jsx']){
   assert.match(source(path),/listAuthorizedMaintenanceRequests/);
 }
});
