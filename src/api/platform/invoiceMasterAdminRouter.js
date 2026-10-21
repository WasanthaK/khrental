import crypto from 'node:crypto';
import express from 'express';
import { createInvoiceDocumentPdfCandidate } from './invoicePdfCandidate.js';
import { getMssqlPool, sql } from '../mssql/pool.js';
import { runSingleQuery } from '../mssql/query.js';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { isAdminRole, hasActiveTenantMembership } from './permissionEngine.js';
import {
  normalizeIssuerProfile, normalizePropertyBilling, normalizeUnitBilling,
  editableFieldsChanged
} from './invoiceMasterValidation.js';

const problem = (status, code, message) => Object.assign(new Error(message),{status,code});
const parse = value => {
  if(value == null || value === '') return null;
  try {
    const parsed=typeof value === 'string'?JSON.parse(value):value;
    if(!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Invalid JSON object');
    return parsed;
  } catch {
    throw problem(409,'INVALID_INVOICE_PROFILE','Stored invoice profile requires administrator repair.');
  }
};
const nullable = value => String(value || '').trim() || null;
const requireComplete = (body, keys) => {
  if(!body || typeof body !== 'object' || Array.isArray(body) ||
    keys.some(k=>!Object.prototype.hasOwnProperty.call(body,k)))
    throw problem(400,'INVOICE_PROFILE_INCOMPLETE','Load and submit the complete invoice profile.');
};
const assertAdmin = req => {
  if(req.user?.is_dev_bypass || !req.user?.id ||
      !isAdminRole({user:req.user,membership:req.membership}) ||
      !hasActiveTenantMembership({membership:req.membership,tenantId:req.tenantId}))
    throw problem(403,'INVOICE_MASTER_ADMIN_REQUIRED','An active organization administrator is required.');
};
const txQuery = async(tx,statement,values={}) => {
  const r=new sql.Request(tx);
  Object.entries(values).forEach(([k,v])=>r.input(k,v));
  return (await r.query(statement)).recordset || [];
};
const txFirst=async(tx,statement,values)=> (await txQuery(tx,statement,values))[0] || null;
const transaction = async fn => {
  const tx=new sql.Transaction(await getMssqlPool());
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const data=await fn(tx);
    await tx.commit();
    return data;
  } catch(e) { await tx.rollback().catch(()=>{}); throw e; }
};
const hash = record => crypto.createHash('sha256').update(JSON.stringify(record ?? null)).digest('hex');
const recordAudit = async(tx,req,kind,id,previous,current) => {
  const fields=editableFieldsChanged(previous||{},current);
  if(!fields.length) return false;
  await txQuery(tx,`INSERT INTO dbo.invoice_master_data_audit
    (tenant_id,actor_user_id,resource_kind,resource_id,changed_fields_json,previous_hash,current_hash)
    VALUES(@tenantId,@actorId,@kind,@id,@fields,@previous,@current)`,{
    tenantId:req.tenantId,actorId:req.user.id,kind,id:id||null,
    fields:JSON.stringify(fields),
    previous:previous===null?null:hash(previous),current:hash(current)
  });
  return true;
};
const normalProperty = row => ({
  beneficiaryName:row.bank_beneficiary_name||'',
  billingContactName:row.billing_contact_name||'',
  billingContactEmail:row.billing_contact_email||'',
  billingContactPhone:row.billing_contact_phone||'',
  parties:parse(row.invoice_party_overrides_json)||{}
});
const respond=(res,data)=>res.json({data,error:null});

export const createInvoiceMasterAdminRouter = () => {
  const router=express.Router();
  router.use(createTenantContextMiddleware({
    requireUser:true,requireTenant:true,auditLabel:'invoice-master-admin'
  }));
  router.use((req,res,next)=>{try{assertAdmin(req);next();}catch(e){next(e);}});


  // Read-only preview using synthetic financial and renter data. No production
  // invoice ID, reference, payment account, mail, or storage mutation.
  router.post('/preview',async(req,res,next)=>{
    try {
      const profile=normalizeIssuerProfile(req.body?.profile||{});
      const previewSnapshot={
        version:1,kind:'invoice_issued',
        tenantId:'11111111-1111-4111-8111-111111111111',
        invoiceId:'22222222-2222-4222-8222-222222222222',
        paymentReference:'00000000',billingPeriod:'SAMPLE MONTH',
        issuedAt:'2026-01-01T00:00:00Z',dueAt:'2026-01-14T00:00:00Z',
        issuer:{role:'organization',legalName:profile.legalName||'SAMPLE BUSINESS',
          postalAddress:profile.postalAddress||'Sample billing address',
          contactEmail:profile.supportEmail,contactPhone:profile.supportPhone,
          logoPng:profile.logoPng},
        renter:{name:'SAMPLE RENTER'},
        property:{name:'SAMPLE PROPERTY',address:'Sample property address'},
        lines:[{description:'Sample monthly rent',amountCents:4500000},
          {description:'Sample water service',amountCents:125000}],
        totalCents:4625000,payment:null,design:profile.design
      };
      const pdf=await createInvoiceDocumentPdfCandidate(previewSnapshot,{preview:true});
      respond(res,{content:pdf.content,type:pdf.type,pageCount:pdf.pageCount,
        filename:'SAMPLE-invoice-design.pdf',isSample:true});
    } catch(e) {next(e);}
  });

  router.get('/issuer',async(req,res,next)=>{
    try{
      const row=await runSingleQuery(
        'SELECT invoice_issuer_profile_json FROM dbo.tenant_settings WHERE tenant_id=@tenantId',
        {tenantId:req.tenantId});
      respond(res,parse(row?.invoice_issuer_profile_json)||{});
    }catch(e){next(e);}
  });
  router.put('/issuer',async(req,res,next)=>{
    try{
      requireComplete(req.body,['legalName','postalAddress','supportEmail','supportPhone','website']);
      const input=normalizeIssuerProfile(req.body);
      const data=await transaction(async tx=>{
        const old=await txFirst(tx,
          'SELECT invoice_issuer_profile_json FROM dbo.tenant_settings WITH(UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId',
          {tenantId:req.tenantId});
        const previous=parse(old?.invoice_issuer_profile_json);
        const fields=editableFieldsChanged(previous||{},input);
        if(fields.length){
          if(old) await txQuery(tx,
            'UPDATE dbo.tenant_settings SET invoice_issuer_profile_json=@value WHERE tenant_id=@tenantId',
            {tenantId:req.tenantId,value:JSON.stringify(input)});
          else await txQuery(tx,
            'INSERT INTO dbo.tenant_settings(tenant_id,invoice_issuer_profile_json) VALUES(@tenantId,@value)',
            {tenantId:req.tenantId,value:JSON.stringify(input)});
          await recordAudit(tx,req,'issuer',null,previous,input);
        }
        return input;
      });
      respond(res,data);
    }catch(e){next(e);}
  });

  router.get('/properties/:propertyId/billing',async(req,res,next)=>{
    try{
      const row=await runSingleQuery(`SELECT TOP 1 bank_beneficiary_name,billing_contact_name,
        billing_contact_email,billing_contact_phone,invoice_party_overrides_json
        FROM dbo.properties WHERE tenant_id=@tenantId AND id=@propertyId`,
        {tenantId:req.tenantId,propertyId:req.params.propertyId});
      if(!row)throw problem(404,'PROPERTY_NOT_FOUND','Property not found in this organization.');
      respond(res,normalProperty(row));
    }catch(e){next(e);}
  });
  router.put('/properties/:propertyId/billing',async(req,res,next)=>{
    try{
      requireComplete(req.body,
        ['beneficiaryName','billingContactName','billingContactEmail','billingContactPhone','parties']);
      const input=normalizePropertyBilling(req.body);
      const data=await transaction(async tx=>{
        const values={tenantId:req.tenantId,propertyId:req.params.propertyId};
        const row=await txFirst(tx,`SELECT TOP 1 bank_beneficiary_name,billing_contact_name,
          billing_contact_email,billing_contact_phone,invoice_party_overrides_json
          FROM dbo.properties WITH(UPDLOCK,HOLDLOCK)
          WHERE tenant_id=@tenantId AND id=@propertyId`,values);
        if(!row)throw problem(404,'PROPERTY_NOT_FOUND','Property not found in this organization.');
        const previous=normalProperty(row);
        if(editableFieldsChanged(previous,input).length){
          await txQuery(tx,`UPDATE dbo.properties SET bank_beneficiary_name=@beneficiary,
            billing_contact_name=@contactName,billing_contact_email=@contactEmail,
            billing_contact_phone=@contactPhone,invoice_party_overrides_json=@parties,
            updatedat=SYSUTCDATETIME()
            WHERE tenant_id=@tenantId AND id=@propertyId`,{
            ...values,beneficiary:nullable(input.beneficiaryName),
            contactName:nullable(input.billingContactName),
            contactEmail:nullable(input.billingContactEmail),
            contactPhone:nullable(input.billingContactPhone),parties:JSON.stringify(input.parties)
          });
          await recordAudit(tx,req,'property_billing',req.params.propertyId,previous,input);
        }
        return input;
      });
      respond(res,data);
    }catch(e){next(e);}
  });

  router.get('/properties/:propertyId/units/:unitId/billing',async(req,res,next)=>{
    try{
      const row=await runSingleQuery(`SELECT TOP 1 bank_beneficiary_name FROM dbo.property_units
        WHERE tenant_id=@tenantId AND propertyid=@propertyId AND id=@unitId`,
        {tenantId:req.tenantId,propertyId:req.params.propertyId,unitId:req.params.unitId});
      if(!row)throw problem(404,'UNIT_NOT_FOUND','Unit not found in this property.');
      respond(res,{beneficiaryName:row.bank_beneficiary_name||''});
    }catch(e){next(e);}
  });
  router.put('/properties/:propertyId/units/:unitId/billing',async(req,res,next)=>{
    try{
      requireComplete(req.body,['beneficiaryName']);
      const input=normalizeUnitBilling(req.body);
      const data=await transaction(async tx=>{
        const values={tenantId:req.tenantId,propertyId:req.params.propertyId,unitId:req.params.unitId};
        const row=await txFirst(tx,`SELECT TOP 1 bank_beneficiary_name
          FROM dbo.property_units WITH(UPDLOCK,HOLDLOCK)
          WHERE tenant_id=@tenantId AND propertyid=@propertyId AND id=@unitId`,values);
        if(!row)throw problem(404,'UNIT_NOT_FOUND','Unit not found in this property.');
        const previous={beneficiaryName:row.bank_beneficiary_name||''};
        if(editableFieldsChanged(previous,input).length){
          await txQuery(tx,`UPDATE dbo.property_units SET
            bank_beneficiary_name=@beneficiary,updatedat=SYSUTCDATETIME()
            WHERE tenant_id=@tenantId AND propertyid=@propertyId AND id=@unitId`,{
            ...values,beneficiary:nullable(input.beneficiaryName)
          });
          await recordAudit(tx,req,'unit_billing',req.params.unitId,previous,input);
        }
        return input;
      });
      respond(res,data);
    }catch(e){next(e);}
  });
  return router;
};
