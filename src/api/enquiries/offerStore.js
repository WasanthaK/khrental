import {randomUUID} from 'node:crypto';
import {createEnquiryStore} from './store.js';
import {enquiryError} from './contract.js';
import {assertOfferVersion,offerReceipt} from './offerContract.js';
import {PUBLIC_LISTING_ELIGIBILITY_SQL} from '../publicListings/store.js';

const conflict=(code,message)=>enquiryError(409,code,message);
const current=(q,id)=>q('SELECT * FROM dbo.property_rental_offers WITH(UPDLOCK,HOLDLOCK) WHERE enquiry_id=@id',{id});
const audit=(q,row,actor=null,input=null,eventType=row.status)=>q(`INSERT INTO dbo.property_rental_offer_events
 (enquiry_id,actor_id,request_id,payload_hash,version,event_type,snapshot)
 VALUES(@id,@actorId,@requestId,@hash,@version,@eventType,@snapshot)`,
 {id:row.enquiry_id,actorId:actor?.actorId||null,requestId:input?.requestId||null,hash:input?.payloadHash||null,
   version:row.version,eventType,snapshot:JSON.stringify(offerReceipt(row))});
export const expireRentalOffers=async(q,propertyId)=>{
  const rows=await q(`UPDATE dbo.property_rental_offers SET status='expired',version=version+1,updated_at=SYSUTCDATETIME()
    OUTPUT INSERTED.* WHERE property_id=@propertyId AND
    ((status='offered' AND offer_until<=SYSUTCDATETIME()) OR (status IN('accepted','agreement') AND hold_until<=SYSUTCDATETIME()))
    AND NOT EXISTS(SELECT 1 FROM dbo.agreements a WHERE a.id=agreement_id AND a.status='active')`,{propertyId});
  for(const row of rows){await audit(q,row,null,null,'expired');}
};
export const createOfferStore=({poolProvider}={})=>{
  const enquiries=createEnquiryStore(poolProvider?{poolProvider}:{});
  const scoped=(actor,id,owner,work)=>enquiries.withEnquiry(actor,id,owner,async(q,e)=>{
    const parent=(await q(`SELECT p.id,p.country_code,p.status FROM dbo.properties p WITH(UPDLOCK,HOLDLOCK)
      JOIN dbo.tenants t ON t.id=p.tenant_id WHERE p.id=@propertyId AND p.tenant_id=@tenantId
      AND (t.status IS NULL OR t.status='active')`,{propertyId:e.property_id,tenantId:e.tenant_id}))[0];
    if(!parent){throw conflict('RENTAL_PROPERTY_UNAVAILABLE','The property workspace is unavailable.');}
    await expireRentalOffers(q,e.property_id);
    return work(q,e,parent);
  },true);
  const options=async(q,e)=>{
    const units=await q(`SELECT id,unitnumber AS label FROM dbo.property_units
      WHERE propertyid=@propertyId AND tenant_id=@tenantId ORDER BY unitnumber,id`,{propertyId:e.property_id,tenantId:e.tenant_id});
    const templates=await q('SELECT id,name,version FROM dbo.agreement_templates WHERE tenant_id=@tenantId ORDER BY name,id',{tenantId:e.tenant_id});
    return {units:units.map(u=>({id:u.id,label:u.label||'Unit'})),templates};
  };
  const read=async(q,e,owner)=>{
    const row=(await current(q,e.id))[0];
    const ap=(await q('SELECT status,version FROM dbo.property_applications WHERE enquiry_id=@id',{id:e.id}))[0];
    const a=row?.agreement_id?(await q('SELECT id,status,signature_status,signature_completed_at FROM dbo.agreements WHERE id=@id AND tenant_id=@tenantId',{id:row.agreement_id,tenantId:e.tenant_id}))[0]:null;
    return {offer:offerReceipt(row),applicationAccepted:ap?.status==='accepted',applicationVersion:ap?.version||0,
      agreement:a?{id:a.id,status:a.status,signatureStatus:a.signature_status,signedAt:a.signature_completed_at}:null,
      ...(owner?await options(q,e):{})};
  };
  const eligible=async(q,e)=>Boolean((await q(`SELECT TOP(1) p.id ${PUBLIC_LISTING_ELIGIBILITY_SQL}
    AND p.id=@propertyId AND p.tenant_id=@tenantId AND pref.public_id=@listingId AND pref.country_code=@country`,
  {propertyId:e.property_id,tenantId:e.tenant_id,listingId:e.listing_public_id,country:e.country_code}))[0]);
  const checkDwelling=async(q,e,unitId,parentStatus)=>{
    const args={propertyId:e.property_id,tenantId:e.tenant_id,unitId};
    if(!unitId){
      const unavailable=(await q("SELECT TOP(1) id FROM dbo.property_units WITH(UPDLOCK,HOLDLOCK) WHERE propertyid=@propertyId AND tenant_id=@tenantId AND LOWER(COALESCE(status,''))<>'available'",args))[0];
      if(!['active','available'].includes(String(parentStatus||'').toLowerCase())||unavailable){
        throw conflict('RENTAL_DWELLING_UNAVAILABLE','The whole property is unavailable. Select an available unit or review the property and unit statuses.');
      }
    }
    if(unitId){
      const unit=(await q(`SELECT id,unitnumber FROM dbo.property_units WITH(UPDLOCK,HOLDLOCK)
        WHERE id=@unitId AND propertyid=@propertyId AND tenant_id=@tenantId AND LOWER(status)='available'`,args))[0];
      if(!unit){throw conflict('RENTAL_UNIT_UNAVAILABLE','Select an available unit in this property.');}
    }
    const occupied=(await q(`SELECT TOP(1) id FROM dbo.agreements WITH(UPDLOCK,HOLDLOCK)
      WHERE propertyid=@propertyId AND tenant_id=@tenantId AND status='active'
       AND (@unitId IS NULL OR unitid IS NULL OR unitid=@unitId)`,args))[0];
    const held=(await q(`SELECT TOP(1) enquiry_id FROM dbo.property_rental_offers WITH(UPDLOCK,HOLDLOCK)
      WHERE property_id=@propertyId AND tenant_id=@tenantId AND status IN('accepted','agreement')
      AND hold_until>SYSUTCDATETIME() AND (@unitId IS NULL OR unit_id IS NULL OR unit_id=@unitId)`,args))[0];
    if(occupied||held){throw conflict('RENTAL_OCCUPANCY_CONFLICT','This property or unit has already been reserved or occupied.');}
  };
  return {
    get:(actor,id,owner=false)=>scoped(actor,id,owner,(q,e)=>read(q,e,owner)),
    change:(actor,id,input,owner=false)=>scoped(actor,id,owner,async(q,e,parent)=>{
      const replay=(await q(`SELECT enquiry_id,payload_hash FROM dbo.property_rental_offer_events WITH(UPDLOCK,HOLDLOCK)
        WHERE actor_id=@actorId AND request_id=@requestId`,{actorId:actor.actorId,requestId:input.requestId}))[0];
      if(replay){
        if(String(replay.enquiry_id).toLowerCase()!==id.toLowerCase()||replay.payload_hash!==input.payloadHash){throw conflict('OFFER_REQUEST_CONFLICT','This request reference was used for different terms.');}
        return read(q,e,owner);
      }
      const old=(await current(q,id))[0];assertOfferVersion(old,input);
      const ap=(await q('SELECT status,version FROM dbo.property_applications WITH(UPDLOCK,HOLDLOCK) WHERE enquiry_id=@id',{id}))[0];
      const now=(await q('SELECT SYSUTCDATETIME() AS now'))[0].now;
      const hits=(await q('SELECT COUNT(*) AS n FROM dbo.property_rental_offer_events WHERE actor_id=@actorId AND created_at>DATEADD(hour,-24,SYSUTCDATETIME())',{actorId:actor.actorId}))[0];
      if(Number(hits.n)>=100){throw enquiryError(429,'RENTAL_OFFER_LIMIT','You have reached the daily offer update limit.');}
      const active=old?.agreement_id&&(await q("SELECT id FROM dbo.agreements WHERE id=@id AND status='active'",{id:old.agreement_id}))[0];
      if(active){throw conflict('RENTAL_ALREADY_ACTIVE','Use the tenancy controls for an active rental.');}
      let row;
      if(owner&&input.action==='issue'){
        if(['accepted','agreement'].includes(old?.status)){throw conflict('RENTAL_HOLD_EXISTS','Withdraw the existing reservation before issuing different terms.');}
        if(ap?.status!=='accepted'||ap.version!==input.applicationVersion||!['pending','responded'].includes(e.status)||!await eligible(q,e)){
          throw conflict('RENTAL_APPLICATION_CHANGED','An open enquiry and current accepted application are required.');
        }
        const zone={LK:'Asia/Colombo',BN:'Asia/Brunei'}[parent.country_code];
        const today=zone&&new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
        if(!today||input.startDate<today||Date.parse(input.offerUntil)<=now.getTime()||Date.parse(input.holdUntil)>now.getTime()+90*86400000){
          throw conflict('RENTAL_DATES_UNAVAILABLE','Choose future deadlines within 90 days and a current or future rental start date.');
        }
        await checkDwelling(q,e,input.unitId,parent.status);
        const unit=input.unitId?(await q('SELECT unitnumber FROM dbo.property_units WHERE id=@id',{id:input.unitId}))[0]:null;
        const args={id,tenantId:e.tenant_id,propertyId:e.property_id,unitId:input.unitId,unitLabel:unit?.unitnumber||null,
          applicationVersion:ap.version,currency:{LK:'LKR',BN:'BND'}[e.country_code],rent:input.rent,deposit:input.deposit,fees:input.fees,
          startDate:new Date(input.startDate),endDate:new Date(input.endDate),terms:input.terms,
          offerUntil:new Date(input.offerUntil),holdUntil:new Date(input.holdUntil),version:(old?.version??0)+1};
        await q(old?`UPDATE dbo.property_rental_offers SET unit_id=@unitId,unit_label=@unitLabel,application_version=@applicationVersion,
          status='offered',version=@version,currency=@currency,rent=@rent,deposit=@deposit,fees=@fees,start_date=@startDate,end_date=@endDate,
          terms=@terms,offer_until=@offerUntil,hold_until=@holdUntil,accepted_at=NULL,consent_version=NULL,agreement_id=NULL,updated_at=SYSUTCDATETIME() WHERE enquiry_id=@id`:
          `INSERT INTO dbo.property_rental_offers(enquiry_id,tenant_id,property_id,unit_id,unit_label,application_version,status,version,currency,rent,deposit,fees,start_date,end_date,terms,offer_until,hold_until)
          VALUES(@id,@tenantId,@propertyId,@unitId,@unitLabel,@applicationVersion,'offered',@version,@currency,@rent,@deposit,@fees,@startDate,@endDate,@terms,@offerUntil,@holdUntil)`,args);
      }else if(!owner&&input.action==='accept'){
        if(old?.status!=='offered'||old.offer_until<=now||ap?.status!=='accepted'||ap.version!==old.application_version||
            !['pending','responded'].includes(e.status)||!await eligible(q,e)){
          throw conflict('RENTAL_OFFER_UNAVAILABLE','This offer or application is no longer available for acceptance.');
        }
        await checkDwelling(q,e,old.unit_id,parent.status);
        await q("UPDATE dbo.property_rental_offers SET status='accepted',accepted_at=SYSUTCDATETIME(),consent_version='rental-offer-v1',version=version+1,updated_at=SYSUTCDATETIME() WHERE enquiry_id=@id",{id});
      }else if(input.action==='agreement'&&owner){
        if(old?.status!=='accepted'||old.hold_until<=now||ap?.status!=='accepted'||ap.version!==old.application_version||!['pending','responded'].includes(e.status)){
          throw conflict('RENTAL_HOLD_EXPIRED','A current accepted offer and reservation are required.');
        }
        const source=(await q(`SELECT pref.public_id FROM dbo.public_listing_preferences pref
          JOIN dbo.properties p ON p.id=pref.property_id AND p.tenant_id=pref.tenant_id
          WHERE pref.public_id=@listingId AND pref.property_id=@propertyId AND pref.tenant_id=@tenantId
          AND pref.opted_out=0 AND pref.country_code=@country AND p.country_code=@country
          AND LOWER(p.status) IN('active','available','rented')`,
        {listingId:e.listing_public_id,propertyId:e.property_id,tenantId:e.tenant_id,country:e.country_code}))[0];
        if(!source){throw conflict('RENTAL_SOURCE_CHANGED','The property listing or market changed. Review the reservation with the applicant.');}
        if(old.unit_id&&!((await q("SELECT id FROM dbo.property_units WHERE id=@id AND propertyid=@propertyId AND tenant_id=@tenantId AND status='available'",{id:old.unit_id,propertyId:e.property_id,tenantId:e.tenant_id}))[0])){
          throw conflict('RENTAL_UNIT_UNAVAILABLE','The selected unit is no longer available.');
        }
        // The accepted identity must remain verified and usable. Never claim it,
        // change its credentials, reactivate revoked access, or grant admin rights.
        const user=(await q(`SELECT au.id FROM dbo.app_users au WITH(UPDLOCK,HOLDLOCK)
          JOIN dbo.auth_users auth ON auth.auth_id=au.auth_id AND auth.app_user_id=au.id
          AND LOWER(LTRIM(RTRIM(auth.email)))=LOWER(LTRIM(RTRIM(au.email)))
          WHERE au.id=@seekerId AND (au.status IS NULL OR au.status='active') AND au.user_type='seeker'
          AND JSON_VALUE(CASE WHEN ISJSON(auth.metadata)=1 THEN auth.metadata ELSE N'{}' END,'$.global_email_verified')='true'`,{seekerId:e.seeker_id}))[0];
        if(!user){throw conflict('RENTAL_IDENTITY_UNAVAILABLE','The accepted applicant must have a verified usable account.');}
        const template=(await q('SELECT id,content,version FROM dbo.agreement_templates WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND tenant_id=@tenantId',{id:input.templateId,tenantId:e.tenant_id}))[0];
        if(!template?.content){throw conflict('RENTAL_TEMPLATE_REQUIRED','Select a populated agreement template in this workspace.');}
        const membership=(await q('SELECT id,role,status FROM dbo.tenant_memberships WITH(UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND app_user_id=@seekerId',{tenantId:e.tenant_id,seekerId:e.seeker_id}))[0];
        if(membership&&(membership.status!=='active'||!['rentee','tenant'].includes(membership.role))){throw conflict('RENTAL_MEMBERSHIP_CONFLICT','Existing account access requires an authorised review.');}
        const agreementId=randomUUID();
        const terms=JSON.stringify({monthlyRent:Number(old.rent),depositAmount:Number(old.deposit),feesAmount:Number(old.fees),
          startDate:new Date(old.start_date).toISOString().slice(0,10),endDate:new Date(old.end_date).toISOString().slice(0,10),
          additionalTerms:old.terms,currency:old.currency,offerUntil:new Date(old.offer_until).toISOString(),holdUntil:new Date(old.hold_until).toISOString(),rentalOfferEnquiry:id,rentalOfferVersion:old.version,agreementTemplateVersion:template.version});
        await q(`INSERT INTO dbo.agreements(id,tenant_id,templateid,renteeid,propertyid,unitid,status,startdate,enddate,rentamount,depositamount,title,content,terms,needs_document_generation)
          VALUES(@agreementId,@tenantId,@templateId,@seekerId,@propertyId,@unitId,'draft',@startDate,@endDate,@rent,@deposit,@title,@content,@terms,1)`,
        {agreementId,tenantId:e.tenant_id,templateId:template.id,seekerId:e.seeker_id,propertyId:e.property_id,unitId:old.unit_id||null,
          startDate:old.start_date,endDate:old.end_date,rent:old.rent,deposit:old.deposit,title:e.listing_title,content:template.content,terms});
        await q(`INSERT INTO dbo.rental_offer_agreement_links(agreement_id,enquiry_id,accepted_version,application_version,unit_id,rent,deposit,start_date,end_date)
          VALUES(@agreementId,@id,@acceptedVersion,@applicationVersion,@unitId,@rent,@deposit,@startDate,@endDate)`,
        {agreementId,id,acceptedVersion:old.version,applicationVersion:old.application_version,unitId:old.unit_id||null,rent:old.rent,deposit:old.deposit,startDate:old.start_date,endDate:old.end_date});
        if(!membership){await q(`INSERT INTO dbo.tenant_memberships(id,tenant_id,app_user_id,role,status,is_default)
          VALUES(@id,@tenantId,@seekerId,'rentee','active',0)`,{id:randomUUID(),tenantId:e.tenant_id,seekerId:e.seeker_id});}
        await q("UPDATE dbo.property_rental_offers SET agreement_id=@agreementId,status='agreement',version=version+1,updated_at=SYSUTCDATETIME() WHERE enquiry_id=@id",{id,agreementId});
        await q(`INSERT INTO dbo.tenancy_lifecycle_events(tenant_id,agreement_id,event_type,actor_user_id,metadata)
          VALUES(@tenantId,@agreementId,'accepted_offer_linked',@actorId,@metadata)`,
        {tenantId:e.tenant_id,agreementId,actorId:actor.actorId,metadata:JSON.stringify({enquiryId:id,acceptedVersion:old.version,applicationVersion:old.application_version,existingIdentity:true,membershipCreated:!membership})});
      }else if(old&&['offered','accepted','agreement'].includes(old.status)&&
          (input.action==='withdraw'||(!owner&&input.action==='decline'&&old.status==='offered'))){
        await q("UPDATE dbo.property_rental_offers SET status=@status,version=version+1,updated_at=SYSUTCDATETIME() WHERE enquiry_id=@id",{id,status:input.action==='decline'?'declined':'withdrawn'});
      }else{throw conflict('RENTAL_OFFER_CHANGED','This action is unavailable for the current offer.');}
      row=(await current(q,id))[0];await audit(q,row,actor,input,input.action);
      return read(q,e,owner);
    })
  };
};
