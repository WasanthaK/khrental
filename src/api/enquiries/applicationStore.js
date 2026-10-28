import {createEnquiryStore} from './store.js';
import {enquiryError} from './contract.js';
import {applicationReceipt,nextApplication} from './applicationContract.js';
import {PUBLIC_LISTING_SELECT_SQL,PUBLIC_LISTING_ELIGIBILITY_SQL} from '../publicListings/store.js';
import {toPublicDTO} from '../publicListings/contract.js';
export const createApplicationStore=({poolProvider}={})=>{
  const enquiries=createEnquiryStore(poolProvider?{poolProvider}:{});
  const current=(query,id)=>query('SELECT * FROM dbo.property_applications WITH(UPDLOCK,HOLDLOCK) WHERE enquiry_id=@id',{id});
  const available=async(query,enquiry)=>toPublicDTO((await query(`SELECT TOP(1) ${PUBLIC_LISTING_SELECT_SQL}
    ${PUBLIC_LISTING_ELIGIBILITY_SQL} AND pref.public_id=@listingId AND pref.country_code=@country
    AND p.id=@propertyId AND p.tenant_id=@tenantId`,{listingId:enquiry.listing_public_id,
    country:enquiry.country_code,propertyId:enquiry.property_id,tenantId:enquiry.tenant_id}))[0]);
  const completed=async(query,id)=>Boolean((await query("SELECT enquiry_id FROM dbo.property_viewings WHERE enquiry_id=@id AND status='completed'",{id}))[0]);
  const receipt=async(query,id,enquiry)=>{
    const application=applicationReceipt((await current(query,id))[0]);
    const canSubmit=(!application||application.status==='needs_information')&&
      ['pending','responded'].includes(enquiry.status)&&await completed(query,id)&&Boolean(await available(query,enquiry));
    return {application,canSubmit};
  };
  return {
    get:(actor,id,owner=false)=>enquiries.withEnquiry(actor,id,owner,(query,enquiry)=>receipt(query,id,enquiry)),
    change:(actor,id,input,owner=false)=>enquiries.withEnquiry(actor,id,owner,async(query,enquiry)=>{
      const args={id,actorId:actor.actorId,requestId:input.requestId,payloadHash:input.payloadHash};
      const replay=(await query(`SELECT enquiry_id,payload_hash FROM dbo.property_application_events WITH(UPDLOCK,HOLDLOCK)
        WHERE actor_id=@actorId AND request_id=@requestId`,args))[0];
      if(replay){
        if(String(replay.enquiry_id).toLowerCase()!==id.toLowerCase()||replay.payload_hash!==input.payloadHash){
          throw enquiryError(409,'APPLICATION_REQUEST_CONFLICT','This request reference was already used for different content.');
        }
        return receipt(query,id,enquiry);
      }
      const old=(await current(query,id))[0];
      const now=(await query('SELECT SYSUTCDATETIME() AS now'))[0].now;
      const next=nextApplication(old,input,owner,enquiry,await completed(query,id),now);
      if(['submit','accept'].includes(input.action)){
        if(!await available(query,enquiry)){throw enquiryError(409,'LISTING_UNAVAILABLE','This property is no longer available for submission or acceptance.');}
      }
      const count=(await query(`SELECT COUNT(*) AS hits FROM dbo.property_application_events
        WHERE actor_id=@actorId AND created_at>DATEADD(hour,-24,SYSUTCDATETIME())`,args))[0];
      if(Number(count.hits)>=100){throw enquiryError(429,'APPLICATION_LIMIT','You have reached the daily application update limit. Try again tomorrow.');}
      const values={...args,status:next.status,moveInDate:new Date(next.move_in_date),occupants:next.occupants,
        termMonths:next.term_months,statement:next.statement,note:next.owner_note||null,
        consentVersion:next.consent_version,consentAt:next.consent_at,version:(old?.version??0)+1};
      await query(old?`UPDATE dbo.property_applications SET status=@status,move_in_date=@moveInDate,
        occupants=@occupants,term_months=@termMonths,statement=@statement,owner_note=@note,
        consent_version=@consentVersion,consent_at=@consentAt,version=@version,updated_at=SYSUTCDATETIME()
        WHERE enquiry_id=@id`:`INSERT INTO dbo.property_applications
        (enquiry_id,status,move_in_date,occupants,term_months,statement,owner_note,consent_version,consent_at,version)
        VALUES(@id,@status,@moveInDate,@occupants,@termMonths,@statement,@note,@consentVersion,@consentAt,@version)`,values);
      await query(`INSERT INTO dbo.property_application_events
        (enquiry_id,actor_id,request_id,payload_hash,status,move_in_date,occupants,term_months,statement,owner_note,consent_version,consent_at,version)
        VALUES(@id,@actorId,@requestId,@payloadHash,@status,@moveInDate,@occupants,@termMonths,@statement,@note,@consentVersion,@consentAt,@version)`,values);
      return receipt(query,id,enquiry);
    })
  };
};
