import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const api=read('../src/api/platform/invoiceMasterAdminRouter.js');
const server=read('../server.js');
const props=read('../src/pages/PropertyForm.jsx');
const units=read('../src/components/properties/PropertyUnitForm.jsx');
test('admin and active tenant membership gate every route',()=>{
  assert.match(api,/requireUser:true,requireTenant:true/);
  assert.match(api,/isAdminRole/);
  assert.match(api,/hasActiveTenantMembership/);
  assert.match(api,/req\.user\?\.is_dev_bypass/);
  assert.match(server,/createInvoiceMasterAdminRouter\(\)/);
});
test('all writes require transaction and audit',()=>{
  assert.match(api,/sql\.ISOLATION_LEVEL\.SERIALIZABLE/);
  assert.match(api,/invoice_master_data_audit/);
  assert.match(api,/recordAudit\(tx,req,'issuer'/);
  assert.match(api,/recordAudit\(tx,req,'property_billing'/);
  assert.match(api,/recordAudit\(tx,req,'unit_billing'/);
  assert.match(api,/await tx\.rollback\(\)/);
  assert.doesNotMatch(api,/UPDATE dbo\.invoices/);
});
test('all property/unit writes enforce tenant, property and unit identities',()=>{
  assert.match(api,/WHERE tenant_id=@tenantId AND id=@propertyId/);
  assert.match(api,/WHERE tenant_id=@tenantId AND propertyid=@propertyId AND id=@unitId/);
});
test('billing save is independent from generic property and unit saves',()=>{
  assert.match(props,/PropertyInvoiceBilling propertyId=\{id\}/);
  assert.match(props,/isEditMode && canEditInvoiceMaster/);
  assert.match(units,/UnitInvoiceBilling propertyId=\{propertyId\} unitId=\{unit\.id\}/);
  assert.match(units,/isEditMode && canEditInvoiceMaster/);
  assert.doesNotMatch(props,/propertyData\.bank_beneficiary_name/);
  assert.doesNotMatch(units,/processedData\.bank_beneficiary_name/);
});
test('payloads are allowlisted and complete',()=>{
  assert.match(api,/normalizeIssuerProfile\(req\.body\)/);
  assert.match(api,/normalizePropertyBilling\(req\.body\)/);
  assert.match(api,/normalizeUnitBilling\(req\.body\)/);
  assert.match(api,/requireComplete\(req\.body/);
});

test('generic and legacy paths cannot bypass audited invoice master updates',()=>{
  const modern=read('../src/api/platform/authorization.js');
  const legacy=read('../server.js');
  const guard=read('../src/api/platform/invoiceMasterMutationGuard.js');
  assert.match(modern,/assertDedicatedInvoiceMasterMutation\(/);
  assert.match(legacy,/assertDedicatedInvoiceMasterMutation\(/);
  assert.match(guard,/INVOICE_MASTER_DEDICATED_API_REQUIRED/);
});
