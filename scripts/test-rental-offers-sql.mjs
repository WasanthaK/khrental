import {loadRentalReservationReadiness} from '../src/api/platform/tenancyActivation.js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {createEnquiryStore} from '../src/api/enquiries/store.js';
import {createOfferStore} from '../src/api/enquiries/offerStore.js';
import {createApplicationStore} from '../src/api/enquiries/applicationStore.js';
import {parseOfferAction} from '../src/api/enquiries/offerContract.js';
import {parseEnquiry} from '../src/api/enquiries/contract.js';
import {parseApplicationAction} from '../src/api/enquiries/applicationContract.js';
import {PUBLIC_LISTING_ELIGIBILITY_SQL} from '../src/api/publicListings/store.js';
import {PUBLIC_MEDIA_ELIGIBILITY_SQL} from '../src/api/publicListings/media.js';
import {inspectRentalOffers} from './inspect-rental-offers-schema.mjs';

export const verifyRentalOffers=async({pool,query:q,owner,foreignOwner})=>{
 assert.equal(process.env.PROPERTY_RENTAL_OFFERS_SCHEMA_READY,'true','Hold predicates must be included in this actual SQL proof');
 await pool.request().batch(fs.readFileSync('migrations/20261029_01_rental_offers_and_holds.sql','utf8'));
 let inspection=await inspectRentalOffers(pool);assert.equal(inspection.satisfied,true,inspection.detail);
 await q('DISABLE TRIGGER dbo.TR_agreements_rental_occupancy ON dbo.agreements');
 assert.equal((await inspectRentalOffers(pool)).satisfied,false);
 await q('ENABLE TRIGGER dbo.TR_agreements_rental_occupancy ON dbo.agreements');
 await q("ALTER TABLE dbo.property_rental_offers NOCHECK CONSTRAINT CK_property_rental_offers_money");
 assert.equal((await inspectRentalOffers(pool)).satisfied,false);
 await q("ALTER TABLE dbo.property_rental_offers WITH CHECK CHECK CONSTRAINT CK_property_rental_offers_money");
 const store=createOfferStore({poolProvider:async()=>pool}),enquiries=createEnquiryStore({poolProvider:async()=>pool});
 const applications=createApplicationStore({poolProvider:async()=>pool});
 const reservation=(id,status='signed')=>loadRentalReservationReadiness({query:async(statement,args)=>(await q(statement,args))[0],tenantId:owner.tenantId,agreement:{id,status},enabled:true});
 const uuid=()=>crypto.randomUUID();
 const request=(action,version,own=false,extra={})=>parseOfferAction({action,version,requestId:uuid(),...extra},own);
 const deadlines=()=>({offerUntil:new Date(Date.now()+86400000).toISOString(),holdUntil:new Date(Date.now()+2*86400000).toISOString()});
 const terms=()=>({applicationVersion:1,unitId:null,rent:'100.00',deposit:'200.00',fees:'0.00',startDate:new Date(Date.now()+3*86400000).toISOString().slice(0,10),endDate:new Date(Date.now()+366*86400000).toISOString().slice(0,10),terms:'Synthetic accepted terms. Reservation expires at the exact stated deadline.',...deadlines()});
 const property=async(units=0)=>{
  const id=uuid(),listingId=uuid();
  await q("INSERT properties(id,tenant_id,status,country_code,propertytype,rentalvalues) VALUES(@id,@tenantId,'available','LK','house',N'{\"listingCategory\":\"residential\",\"rent\":100}')",{id,tenantId:owner.tenantId});
  await q("INSERT public_listing_preferences(public_id,property_id,tenant_id,country_code,opted_out,public_headline,location_label) VALUES(@listingId,@id,@tenantId,'LK',0,'Synthetic rental','General area')",{id,listingId,tenantId:owner.tenantId});
  const unitIds=[];
  for(let n=0;n<units;n++){const unit=uuid();unitIds.push(unit);await q("INSERT property_units(id,tenant_id,propertyid,status,unitnumber) VALUES(@id,@tenantId,@propertyId,'available',@label)",{id:unit,tenantId:owner.tenantId,propertyId:id,label:'Unit '+n});}
  return {id,listingId,unitIds};
 };
 const candidate=async p=>{
  const actor={actorId:uuid(),authId:uuid(),sessionId:uuid()},authUser=uuid(),email=uuid()+'@example.invalid';
  await q("INSERT app_users(id,auth_id,tenant_id,name,email,role,user_type,status) VALUES(@actorId,@authId,NULL,'Synthetic seeker',@email,'authenticated','seeker','active')",{...actor,email});
  await q(`INSERT auth_users(id,auth_id,app_user_id,email,role,metadata) VALUES(@authUser,@authId,@actorId,@email,'authenticated',N'{"global_email_verified":true}')`,{...actor,email,authUser});
  await q('INSERT auth_sessions(id,auth_user_id,expires_at) VALUES(@sessionId,@authUser,DATEADD(day,1,SYSUTCDATETIME()))',{...actor,authUser});
  const saved=await enquiries.submit(actor,parseEnquiry({listingId:p.listingId,country:'LK',requestId:uuid(),message:'Synthetic rental enquiry',consent:true}));
  const id=saved.receipt.id;
  await q(`INSERT property_applications(enquiry_id,status,move_in_date,occupants,term_months,statement,consent_version,consent_at,version)
   VALUES(@id,'accepted',@date,1,12,'Synthetic accepted proposal','rental-application-v1',SYSUTCDATETIME(),1)`,{id,date:new Date(terms().startDate)});
  return {actor,id};
 };
 const available=async p=>Boolean((await q(`SELECT p.id ${PUBLIC_LISTING_ELIGIBILITY_SQL} AND pref.public_id=@listingId`,{listingId:p.listingId}))[0]);
 const p=await property(),c=await candidate(p);
 const issue=request('issue',0,true,terms());
 const issued=await store.change(owner,c.id,issue,true);assert.equal(issued.offer.status,'offered');
 await assert.rejects(q("UPDATE property_rental_offers SET status='accepted',accepted_at=SYSUTCDATETIME(),consent_version=NULL WHERE enquiry_id=@id",{id:c.id}),e=>e.number===547,'Acceptance cannot omit retained consent evidence, even outside the HTTP contract');
 assert.equal((await store.change(owner,c.id,issue,true)).offer.version,1);
 await assert.rejects(store.get(foreignOwner,c.id,true),{code:'ENQUIRY_NOT_FOUND'});
 await assert.rejects(store.change(owner,c.id,{...issue,payloadHash:'changed'},true),{code:'OFFER_REQUEST_CONFLICT'});
 const acceptance=request('accept',1,false,{consent:true});
 const retries=await Promise.allSettled([store.change(c.actor,c.id,acceptance),store.change(c.actor,c.id,acceptance)]);
 assert.ok(retries.some(x=>x.status==='fulfilled'));
 for(const x of retries){if(x.status==='rejected'){assert.equal(x.reason.code,'ENQUIRY_RETRY');}}
 assert.equal((await store.change(c.actor,c.id,acceptance)).offer.version,2);
 assert.equal(await available(p),false,'Accepted whole-property hold hides the catalog/detail/enquiry source');
 await q('CREATE TABLE dbo.public_listing_media(listing_public_id UNIQUEIDENTIFIER)');
 await q('INSERT dbo.public_listing_media VALUES(@listingId)',{listingId:p.listingId});
 assert.equal((await q(`SELECT m.listing_public_id ${PUBLIC_MEDIA_ELIGIBILITY_SQL} AND pref.public_id=@listingId`,{listingId:p.listingId})).length,0,'Copied photo URLs use the same hold predicate');
 await assert.rejects(store.change(c.actor,c.id,request('accept',1,false,{consent:true})),{code:'OFFER_CHANGED'});
 const templateId=uuid();await q("INSERT agreement_templates(id,tenant_id,name,version,content) VALUES(@id,@tenantId,'Synthetic template',1,'<p>Agreed rental: {{monthlyRent}}</p>')",{id:templateId,tenantId:owner.tenantId});
 const beforeUsers=(await q('SELECT COUNT(*) AS n FROM app_users'))[0].n;
 const beforeAuth=(await q('SELECT COUNT(*) AS n FROM auth_users'))[0].n;
 const prepare=request('agreement',2,true,{templateId});
 const prepared=await store.change(owner,c.id,prepare,true),agreementId=prepared.offer.agreementId;
 assert.equal(prepared.offer.status,'agreement');assert.ok(agreementId);
 assert.deepEqual(await reservation(agreementId),{valid:true});
 assert.equal((await store.change(owner,c.id,prepare,true)).offer.agreementId,agreementId);
 assert.equal((await q('SELECT COUNT(*) AS n FROM app_users'))[0].n,beforeUsers);
 assert.equal((await q('SELECT COUNT(*) AS n FROM auth_users'))[0].n,beforeAuth);
 assert.equal((await q('SELECT COUNT(*) AS n FROM tenant_memberships WHERE app_user_id=@id',{id:c.actor.actorId}))[0].n,1);
 assert.equal((await q('SELECT role FROM tenant_memberships WHERE app_user_id=@id',{id:c.actor.actorId}))[0].role,'rentee');
 assert.equal((await enquiries.list(c.actor,false,0,true)).items[0].id,c.id,'Converted identity retains own enquiry history');
 await assert.rejects(enquiries.list(c.actor),{code:'ENQUIRY_ACTOR_REQUIRED'},'General seeker eligibility is not relaxed');
 await assert.rejects(q('UPDATE agreements SET rentamount=101 WHERE id=@id',{id:agreementId}),e=>e.number===51102);
 await assert.rejects(q("UPDATE agreements SET status='active' WHERE id=@id",{id:agreementId}),e=>e.number===51104);
 await q("UPDATE agreements SET signature_status='completed',signature_completed_at=SYSUTCDATETIME() WHERE id=@id",{id:agreementId});
 assert.equal((await q('SELECT status FROM agreements WHERE id=@id',{id:agreementId}))[0].status,'draft','Signing alone does not activate');
 await assert.rejects(q("UPDATE agreements SET status='active' WHERE id=@id",{id:agreementId}),e=>e.number===51104);
 await q("INSERT tenancy_deposit_transactions(tenant_id,agreement_id,transaction_type,status,amount) VALUES(@tenantId,@id,'security_deposit','received',200)",{tenantId:owner.tenantId,id:agreementId});
 const checklistId=uuid();await q("INSERT tenancy_move_in_checklists(id,tenant_id,agreement_id,status) VALUES(@checklistId,@tenantId,@id,'completed')",{checklistId,tenantId:owner.tenantId,id:agreementId});
 await q("INSERT tenancy_move_in_checklist_items(tenant_id,checklist_id,is_required,status) VALUES(@tenantId,@checklistId,1,'pending')",{checklistId,tenantId:owner.tenantId});
 await assert.rejects(q("UPDATE agreements SET status='active' WHERE id=@id",{id:agreementId}),e=>e.number===51104);
 await q("UPDATE tenancy_move_in_checklist_items SET status='completed' WHERE checklist_id=@checklistId",{checklistId});
 await q("UPDATE agreements SET status='active' WHERE id=@id",{id:agreementId});
 await q('UPDATE property_rental_offers SET offer_until=DATEADD(day,-3,SYSUTCDATETIME()),hold_until=DATEADD(day,-2,SYSUTCDATETIME()) WHERE enquiry_id=@id',{id:c.id});
 assert.equal((await store.get(c.actor,c.id)).agreement.status,'active');assert.equal(await available(p),false);
 await q("UPDATE agreements SET terms=JSON_MODIFY(terms,'$.billingDay',10) WHERE id=@id",{id:agreementId});
 await assert.rejects(store.change(c.actor,c.id,request('withdraw',3)),{code:'RENTAL_ALREADY_ACTIVE'});
 await q("UPDATE tenant_memberships SET status='revoked' WHERE app_user_id=@id",{id:c.actor.actorId});
 await assert.rejects(store.get(c.actor,c.id),{code:'ENQUIRY_ACTOR_REQUIRED'});
 // Different seekers race for overlapping whole-property/unit holds.
 const multi=await property(2),whole=await candidate(multi),unit=await candidate(multi);
 await store.change(owner,whole.id,request('issue',0,true,terms()),true);
 await store.change(owner,unit.id,request('issue',0,true,{...terms(),unitId:multi.unitIds[0]}),true);
 const race=await Promise.allSettled([store.change(whole.actor,whole.id,request('accept',1,false,{consent:true})),store.change(unit.actor,unit.id,request('accept',1,false,{consent:true}))]);
 assert.equal(race.filter(x=>x.status==='fulfilled').length,1,'Exactly one overlapping claim may succeed');
 for(const x of race){if(x.status==='rejected'){assert.ok(['ENQUIRY_RETRY','RENTAL_OCCUPANCY_CONFLICT','RENTAL_OFFER_UNAVAILABLE'].includes(x.reason.code),x.reason.code);}}
 const winner=race[0].status==='fulfilled'?whole:unit;
 const winning=(await store.get(winner.actor,winner.id)).offer;
 assert.equal(await available(multi),Boolean(winning.unitLabel),'Other available units remain visible');
 await store.change(winner.actor,winner.id,request('withdraw',winning.version));
 assert.equal(await available(multi),true);
 // Whole-property availability includes every unit's authoritative status,
 // even where legacy occupancy has no active agreement record.
 const partial=await property(2),partialCandidate=await candidate(partial);
 await q("UPDATE property_units SET status='occupied' WHERE id=@id",{id:partial.unitIds[0]});
 await assert.rejects(store.change(owner,partialCandidate.id,request('issue',0,true,terms()),true),{code:'RENTAL_DWELLING_UNAVAILABLE'});
 await store.change(owner,partialCandidate.id,request('issue',0,true,{...terms(),unitId:partial.unitIds[1]}),true);
 await store.change(partialCandidate.actor,partialCandidate.id,request('accept',1,false,{consent:true}));
 assert.equal(await available(partial),false);
 await store.change(partialCandidate.actor,partialCandidate.id,request('withdraw',2));
 assert.equal(await available(partial),true);
 // Existing active agreement writers must serialize across whole/unit records too.
 const occupancy=await property(1);
 const insertActive=unitId=>q("INSERT agreements(id,tenant_id,propertyid,unitid,status) VALUES(@id,@tenantId,@propertyId,@unitId,'active')",{id:uuid(),tenantId:owner.tenantId,propertyId:occupancy.id,unitId});
 const activationRace=await Promise.allSettled([insertActive(null),insertActive(occupancy.unitIds[0])]);
 assert.equal(activationRace.filter(x=>x.status==='fulfilled').length,1);
 assert.equal((await q("SELECT COUNT(*) AS n FROM agreements WHERE propertyid=@id AND status='active'",{id:occupancy.id}))[0].n,1);
 // Historical overlaps are fixture-only setup. Existing non-occupancy
 // edits must work; new insertions and dwelling changes must still fail.
 const legacy=await property(1),legacyWhole=uuid(),legacyUnit=uuid();
 await q('DISABLE TRIGGER dbo.TR_agreements_rental_occupancy ON dbo.agreements');
 try{
  await q("INSERT agreements(id,tenant_id,propertyid,unitid,status) VALUES(@id,@tenantId,@propertyId,NULL,'active'),(@otherId,@tenantId,@propertyId,@unitId,'active')",
   {id:legacyWhole,otherId:legacyUnit,tenantId:owner.tenantId,propertyId:legacy.id,unitId:legacy.unitIds[0]});
 }finally{await q('ENABLE TRIGGER dbo.TR_agreements_rental_occupancy ON dbo.agreements');}
 await q('UPDATE agreements SET terms=@terms WHERE id=@id',{id:legacyWhole,terms:JSON.stringify({billingDay:10})});
 assert.equal(JSON.parse((await q('SELECT terms FROM agreements WHERE id=@id',{id:legacyWhole}))[0].terms).billingDay,10);
 await assert.rejects(q("INSERT agreements(id,tenant_id,propertyid,status) VALUES(@id,@tenantId,@propertyId,'active')",{id:uuid(),tenantId:owner.tenantId,propertyId:legacy.id}),e=>e.number===51101);
 const movable=uuid(),empty=await property();
 await q("INSERT agreements(id,tenant_id,propertyid,status) VALUES(@id,@tenantId,@propertyId,'active')",{id:movable,tenantId:owner.tenantId,propertyId:empty.id});
 await assert.rejects(q('UPDATE agreements SET propertyid=@propertyId WHERE id=@id',{id:movable,propertyId:legacy.id}),e=>e.number===51101);
 const expiry=await property(),exp=await candidate(expiry);
 const original= request('issue',0,true,terms());await store.change(owner,exp.id,original,true);
 await store.change(exp.actor,exp.id,request('accept',1,false,{consent:true}));
 await q('UPDATE property_rental_offers SET offer_until=DATEADD(day,-3,SYSUTCDATETIME()),hold_until=DATEADD(day,-2,SYSUTCDATETIME()) WHERE enquiry_id=@id',{id:exp.id});
 assert.equal(await available(expiry),true,'Time predicate releases stock before the lazy audit materializes');
 assert.equal((await store.get(exp.actor,exp.id)).offer.status,'expired');
 assert.equal((await store.change(owner,exp.id,original,true)).offer.status,'expired','Old replay cannot restore a hold');
 assert.equal((await q("SELECT COUNT(*) AS n FROM property_rental_offer_events WHERE enquiry_id=@id AND event_type='expired'",{id:exp.id}))[0].n,1);
 const invalid=await property(),withdrawn=await candidate(invalid);
 await store.change(owner,withdrawn.id,request('issue',0,true,terms()),true);
 await store.change(withdrawn.actor,withdrawn.id,request('accept',1,false,{consent:true}));
 await applications.change(withdrawn.actor,withdrawn.id,parseApplicationAction({action:'withdraw',version:1,requestId:uuid()}));
 assert.equal((await store.get(withdrawn.actor,withdrawn.id)).offer.status,'invalidated');
 assert.equal(await available(invalid),true);
 assert.equal((await q("SELECT COUNT(*) AS n FROM property_rental_offer_events WHERE enquiry_id=@id AND event_type='invalidated'",{id:withdrawn.id}))[0].n,1);
 // Expiry after agreement preparation supports a fresh accepted version without
 // reviving the old agreement or dropping the converted account's history.
 const repeatProperty=await property(),repeat=await candidate(repeatProperty);
 await store.change(owner,repeat.id,request('issue',0,true,terms()),true);
 await store.change(repeat.actor,repeat.id,request('accept',1,false,{consent:true}));
 const firstAgreement=await store.change(owner,repeat.id,request('agreement',2,true,{templateId}),true);
 await q('UPDATE property_rental_offers SET offer_until=DATEADD(day,-3,SYSUTCDATETIME()),hold_until=DATEADD(day,-2,SYSUTCDATETIME()) WHERE enquiry_id=@id',{id:repeat.id});
 assert.deepEqual(await reservation(firstAgreement.offer.agreementId),{valid:false});
 assert.equal((await store.get(repeat.actor,repeat.id)).offer.status,'expired');
 await store.change(owner,repeat.id,request('issue',4,true,{...terms(),rent:'110.00'}),true);
 assert.equal((await enquiries.list(repeat.actor,false,0,true)).items[0].id,repeat.id);
 await store.change(repeat.actor,repeat.id,request('accept',5,false,{consent:true}));
 const secondAgreement=await store.change(owner,repeat.id,request('agreement',6,true,{templateId}),true);
 assert.notEqual(firstAgreement.offer.agreementId,secondAgreement.offer.agreementId);
 assert.deepEqual(await reservation(firstAgreement.offer.agreementId),{valid:false});
 assert.deepEqual(await reservation(secondAgreement.offer.agreementId),{valid:true});
 assert.equal((await q('SELECT COUNT(*) AS n FROM rental_offer_agreement_links WHERE enquiry_id=@id',{id:repeat.id}))[0].n,2);
 assert.equal((await q('SELECT COUNT(*) AS n FROM tenant_memberships WHERE app_user_id=@id',{id:repeat.actor.actorId}))[0].n,1);
 await assert.rejects(q("UPDATE agreements SET status='active' WHERE id=@id",{id:firstAgreement.offer.agreementId}),e=>[51101,51103].includes(e.number));
 await store.change(repeat.actor,repeat.id,request('withdraw',7));
 await assert.rejects(q("UPDATE agreements SET status='active' WHERE id=@id",{id:firstAgreement.offer.agreementId}),e=>e.number===51103);
 console.log('RENTAL_OFFERS_SQL=PASS exact_schema drift_denial consent version concurrent_replay whole_unit_race partial_unit_availability active_occupancy_race legacy_nonoccupancy_edit catalog_media_hold expiry_audit withdrawal_invalidation existing_identity renter_only history revocation signature_deposit_checklist_explicit_activation');
};
