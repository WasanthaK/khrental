// Enforced on both modern and compatibility mutation surfaces. Protect
// audited invoice master data even for global tenant administrators: changes
// must use the dedicated tenant-scoped invoice-master API.
export const INVOICE_MASTER_PROTECTED_COLUMNS = Object.freeze({
  tenant_settings: ['invoice_issuer_profile_json'],
  properties: [
    'bank_beneficiary_name', 'billing_contact_name', 'billing_contact_email',
    'billing_contact_phone', 'invoice_party_overrides_json'
  ],
  property_units: ['bank_beneficiary_name']
});
export const assertDedicatedInvoiceMasterMutation = ({table,action,payload}) => {
  const prohibited=INVOICE_MASTER_PROTECTED_COLUMNS[String(table||'').toLowerCase()];
  if(!prohibited || !['insert','update','upsert','post','put','patch'].includes(String(action||'').toLowerCase())) return;
  const rows=Array.isArray(payload)?payload:[payload];
  if(rows.some(row => row && typeof row==='object' && Object.keys(row).some(k=>prohibited.includes(k.toLowerCase())))){
    const error=new Error('Invoice master data must be changed using the audited administrator API.');
    error.status=403;
    error.code='INVOICE_MASTER_DEDICATED_API_REQUIRED';
    throw error;
  }
};
