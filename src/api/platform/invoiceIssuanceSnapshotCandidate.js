import crypto from 'node:crypto';
import { normalizeIssuerProfile, normalizePropertyParties } from './invoiceMasterValidation.js';
import { normalizeInvoiceDocumentSnapshot } from './invoicePdfCandidate.js';
import { normalizeInvoiceDesign } from './invoiceDesign.js';

// Draft only. Call within the same tenant-authorized SERIALIZABLE transaction
// as an eventual invoice_issued event. No live router invokes this module.
const block=(field,message)=>{
  const e=new Error(message);e.status=409;
  e.code='INVOICE_ISSUANCE_SNAPSHOT_BLOCKED';e.details={field};throw e;
};
const has=v=>typeof v==='string' && v.trim().length>0;
const stored=(raw,field)=>{
  if(raw===undefined || raw===null || raw==='')return null;
  try {
    const value=typeof raw==='string'?JSON.parse(raw):raw;
    if(!value || typeof value!=='object' || Array.isArray(value))throw Error('object required');
    return value;
  }catch {block(field,'Invalid invoice master data requires administrator correction.');}
};
const contact=(mail,phone)=>has(mail)||has(phone);
const selectIssuer=row=>{
  let party;
  try {party=normalizePropertyParties(stored(row.invoice_party_overrides_json,'parties')||{});}
  catch {block('parties','Property issuer authority is invalid.');}
  if(party.issuerRole==='organization'){
    const raw=stored(row.invoice_issuer_profile_json,'issuer');
    if(!raw)block('issuer','Legal invoice issuer must be configured.');
    let issuer;
    try{issuer=normalizeIssuerProfile(raw);}
    catch{block('issuer','Legal issuer profile is invalid.');}
    if(!has(issuer.legalName)||!has(issuer.postalAddress)||
      !contact(issuer.supportEmail,issuer.supportPhone)){
      block('issuer','Legal issuer requires name, address and contact.');
    }
    return {role:'organization',legalName:issuer.legalName,
      postalAddress:issuer.postalAddress,
      contactEmail:issuer.supportEmail,contactPhone:issuer.supportPhone,
      logoPng:issuer.logoPng};
  }
  if(party.issuerAuthorityConfirmed!==true){
    block('parties','Alternative issuer requires explicit administrator authority.');
  }
  if(party.issuerRole==='owner'){
    if(!has(party.propertyOwnerName)||!has(party.propertyOwnerAddress)||
      !contact(party.propertyOwnerEmail,party.propertyOwnerPhone)){
      block('parties','Owner issuer profile is incomplete.');
    }
    return {role:'owner',legalName:party.propertyOwnerName,
      postalAddress:party.propertyOwnerAddress,
      contactEmail:party.propertyOwnerEmail,contactPhone:party.propertyOwnerPhone,
      authorityConfirmed:true};
  }
  if(party.issuerRole==='manager' && party.managementMode==='outsourced'){
    if(!has(party.externalManagerName)||!has(party.externalManagerAddress)||
      !contact(party.externalManagerEmail,party.externalManagerPhone)){
      block('parties','Outsourced manager issuer profile is incomplete.');
    }
    return {role:'manager',legalName:party.externalManagerName,
      postalAddress:party.externalManagerAddress,
      contactEmail:party.externalManagerEmail,contactPhone:party.externalManagerPhone,
      authorityConfirmed:true};
  }
  block('parties','Unsupported legal issuer role.');
};
const configuredBank=(row,prefix)=>{
  const value={
    bankName:row[prefix+'_bank_name'],
    branch:row[prefix+'_bank_branch'],
    accountNumber:row[prefix+'_bank_account_number'],
    beneficiaryName:row[prefix+'_bank_beneficiary_name']
  };
  return {value,any:Object.values(value).some(has),all:Object.values(value).every(has)};
};
const selectPayment=row=>{
  const unit=configuredBank(row,'unit');
  if(unit.any){
    if(!unit.all)block('unit.bank','Partial unit bank details cannot fall back to the property account.');
    return {source:'unit',...unit.value};
  }
  const property=configuredBank(row,'property');
  if(property.any){
    if(!property.all)block('property.bank','Complete property bank details and beneficiary.');
    return {source:'property',...property.value};
  }
  return null;
};
const toCents=(amount,field)=>{
  if(typeof amount!=='number' && typeof amount!=='string')
    block(field,'Invoice amount is not numeric.');
  const number=Number(amount),hundred=number*100;
  if(!Number.isFinite(number)||Math.abs(number)>1e12||
    !Number.isSafeInteger(Math.round(hundred))||
    Math.abs(hundred-Math.round(hundred))>0.000001)
    block(field,'Invoice amount must have exact cent precision.');
  return Math.round(hundred);
};
export const buildInvoiceIssuanceSnapshotCandidate=({
  invoice,masterRow,components,paymentReference
})=>{
  if(!invoice||!masterRow ||
     String(invoice.tenant_id||'').toLowerCase()!==String(masterRow.tenant_id||'').toLowerCase()||
     String(invoice.propertyid||'').toLowerCase()!==String(masterRow.property_id||'').toLowerCase()||
     String(invoice.renteeid||'').toLowerCase()!==String(masterRow.renter_id||'').toLowerCase()||
     !has(String(invoice.id||''))||!has(String(invoice.tenant_id||'')))
    block('scope','Issuer/property/renter invoice identities do not agree.');
  if(String(invoice.status||'').toLowerCase()==='draft')
    block('invoice.status','Cannot snapshot an unissued invoice.');
  if(!has(masterRow.property_name)||!has(masterRow.renter_name))
    block('parties','Property and renter names must be present.');
  if(!/^[0-9]{8}$/.test(paymentReference||'')||
    paymentReference!==masterRow.payment_reference)
    block('paymentReference','Issued reference must match the allocated reference.');
  if(!Array.isArray(components)||components.length<1||components.length>300)
    block('components','Issued invoice must contain 1-300 lines.');
  const lines=components.map((item,i)=>{
    if(!item || (!has(item.description)&&!has(item.component_type)))
      block('components','Every charge needs a description.');
    const amountCents=toCents(item.amount,'components');
    if(amountCents<0 && String(item.component_type||'').toLowerCase()!=='adjustment')
      block('components','Negative invoice charges require adjustment type.');
    return {description:String(item.description||item.component_type).trim(),amountCents};
  });
  const totalCents=toCents(invoice.totalamount,'invoice.totalamount');
  if(totalCents<=0||lines.reduce((sum,line)=>sum+line.amountCents,0)!==totalCents)
    block('invoice.totalamount','Issued invoice lines do not reconcile.');
  try {
    const documentSnapshot=normalizeInvoiceDocumentSnapshot({
      version:1,kind:'invoice_issued',
      tenantId:invoice.tenant_id,invoiceId:invoice.id,paymentReference,
      billingPeriod:invoice.billingperiod,issuedAt:invoice.issued_at,
      dueAt:invoice.duedate,issuer:selectIssuer(masterRow),
      renter:{name:masterRow.renter_name},
      property:{name:masterRow.property_name,address:masterRow.property_address||''},
      lines,totalCents,payment:selectPayment(masterRow),
      design:normalizeInvoiceDesign(
        stored(masterRow.invoice_issuer_profile_json,'issuer')?.design
      )
    });
    return {
      documentSnapshot,
      documentSnapshotSha256:crypto.createHash('sha256')
        .update(JSON.stringify(documentSnapshot)).digest('hex')
    };
  } catch(e) {
    if(e.code==='INVOICE_ISSUANCE_SNAPSHOT_BLOCKED')throw e;
    block('documentSnapshot','Issued document details are incomplete.');
  }
};

// All statements bind tenantId and invoiceId and run on caller's transaction.
// This helper does not itself grant permissions; the caller must check access.
export const captureInvoiceIssuanceSnapshotCandidate=async ({
  transaction,sql,tenantId,invoiceId,paymentReference
})=>{
  if(!transaction||!sql||typeof sql.Request!=='function')
    block('transaction','Authorized SQL transaction required.');
  const query=async (statement)=>{
    const req=new sql.Request(transaction);
    req.input('tenantId',tenantId).input('invoiceId',invoiceId);
    return (await req.query(statement)).recordset||[];
  };
  const master=(await query([
    'SELECT TOP 1 i.tenant_id,i.id AS invoice_id,i.propertyid,i.renteeid,',
    'p.id AS property_id,p.name AS property_name,p.address AS property_address,',
    'au.id AS renter_id,au.name AS renter_name,',
    't.invoice_issuer_profile_json,p.invoice_party_overrides_json,',
    'p.bank_name AS property_bank_name,p.bank_branch AS property_bank_branch,',
    'p.bank_account_number AS property_bank_account_number,',
    'p.bank_beneficiary_name AS property_bank_beneficiary_name,',
    'u.bank_name AS unit_bank_name,u.bank_branch AS unit_bank_branch,',
    'u.bank_account_number AS unit_bank_account_number,',
    'u.bank_beneficiary_name AS unit_bank_beneficiary_name,',
    'refs.payment_reference FROM dbo.invoices i WITH(UPDLOCK,HOLDLOCK)',
    'INNER JOIN dbo.properties p ON p.id=i.propertyid AND p.tenant_id=i.tenant_id',
    'INNER JOIN dbo.app_users au ON au.id=i.renteeid AND au.tenant_id=i.tenant_id',
    'INNER JOIN dbo.tenant_settings t ON t.tenant_id=i.tenant_id',
    'LEFT JOIN dbo.agreements a ON a.id=i.agreementid AND a.tenant_id=i.tenant_id',
    'LEFT JOIN dbo.property_units u ON u.id=a.unitid AND u.propertyid=p.id AND u.tenant_id=i.tenant_id',
    'INNER JOIN dbo.invoice_payment_references refs ON refs.invoice_id=i.id AND refs.tenant_id=i.tenant_id',
    'WHERE i.id=@invoiceId AND i.tenant_id=@tenantId'
  ].join(' ')))[0];
  if(!master)block('scope','Tenant-owned invoice master data is unavailable.');
  const invoice=(await query([
    'SELECT TOP 1 id,tenant_id,propertyid,renteeid,status,totalamount,',
    'billingperiod,issued_at,duedate FROM dbo.invoices WITH(UPDLOCK,HOLDLOCK)',
    'WHERE id=@invoiceId AND tenant_id=@tenantId'
  ].join(' ')))[0];
  if(!invoice)block('scope','Issued invoice no longer exists under this tenant.');
  const components=await query([
    'SELECT description,component_type,amount FROM dbo.invoice_components',
    'WHERE tenant_id=@tenantId AND invoice_id=@invoiceId',
    'ORDER BY createdat,id'
  ].join(' '));
  return buildInvoiceIssuanceSnapshotCandidate({
    invoice,masterRow:master,components,paymentReference
  });
};
