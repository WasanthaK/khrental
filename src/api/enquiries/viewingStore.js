import {createEnquiryStore} from './store.js';
import {enquiryError} from './contract.js';
import {nextViewing,viewingReceipt} from './viewingContract.js';
import {PUBLIC_LISTING_SELECT_SQL,PUBLIC_LISTING_ELIGIBILITY_SQL} from '../publicListings/store.js';
import {toPublicDTO} from '../publicListings/contract.js';

export const createViewingStore=({poolProvider}={})=>{
  const enquiries=createEnquiryStore(poolProvider?{poolProvider}:{});
  const scoped=(actor,id,owner,work)=>enquiries.withEnquiry(actor,id,owner,work);
  return {
    get:(actor,id,owner=false)=>scoped(actor,id,owner,async query=>viewingReceipt((await query(
      'SELECT * FROM dbo.property_viewings WHERE enquiry_id=@id',{id}))[0])),
    change:(actor,id,input,owner=false)=>scoped(actor,id,owner,async(query,enquiry)=>{
      const params={id,actorId:actor.actorId,requestId:input.requestId,payloadHash:input.payloadHash};
      const retry=(await query(`SELECT * FROM dbo.property_viewing_events WITH(UPDLOCK,HOLDLOCK)
        WHERE actor_id=@actorId AND request_id=@requestId`,params))[0];
      if (retry) {
        if (String(retry.enquiry_id).toLowerCase()!==id.toLowerCase()||retry.payload_hash!==input.payloadHash) {
          throw enquiryError(409,'VIEWING_REQUEST_CONFLICT','This request reference was already used for a different action.');
        }
        // Replaying a prior confirmation after cancellation must not restore
        // withdrawn meeting instructions or paint an obsolete appointment.
        return viewingReceipt((await query('SELECT * FROM dbo.property_viewings WHERE enquiry_id=@id',{id}))[0]);
      }
      const old=(await query('SELECT * FROM dbo.property_viewings WITH(UPDLOCK,HOLDLOCK) WHERE enquiry_id=@id',{id}))[0];
      const now=(await query('SELECT SYSUTCDATETIME() AS now'))[0].now;
      const next=nextViewing(old,input,owner,enquiry,now);
      if (['request','propose','confirm','accept'].includes(input.action)) {
        const available=(await query(`SELECT TOP(1) ${PUBLIC_LISTING_SELECT_SQL}
          ${PUBLIC_LISTING_ELIGIBILITY_SQL} AND pref.public_id=@listingId AND pref.country_code=@country
          AND p.id=@propertyId AND p.tenant_id=@tenantId`,{
          listingId:enquiry.listing_public_id,country:enquiry.country_code,
          propertyId:enquiry.property_id,tenantId:enquiry.tenant_id}))[0];
        if (!toPublicDTO(available)) {throw enquiryError(409,'LISTING_UNAVAILABLE','This property is no longer available for a new or changed viewing.');}
      }
      // Durable, actor-scoped write quota includes cancellations and retries are
      // resolved first. Read/refresh and exact replay do not consume it.
      const count=(await query(`SELECT COUNT(*) AS hits FROM dbo.property_viewing_events
        WHERE actor_id=@actorId AND created_at>DATEADD(hour,-24,SYSUTCDATETIME())`,params))[0];
      if (Number(count.hits)>=100) {throw enquiryError(429,'VIEWING_LIMIT','You have reached the daily viewing update limit. Try again tomorrow.');}
      const args={...params,status:next.status,startsAt:new Date(next.startsAt),endsAt:new Date(next.endsAt),
        timeZone:next.timeZone,instructions:next.instructions,version:(old?.version??0)+1};
      const row=(await query(old?`UPDATE dbo.property_viewings SET status=@status,starts_at=@startsAt,
        ends_at=@endsAt,timezone=@timeZone,instructions=@instructions,version=@version,updated_at=SYSUTCDATETIME()
        OUTPUT INSERTED.* WHERE enquiry_id=@id`:`INSERT INTO dbo.property_viewings
        (enquiry_id,status,starts_at,ends_at,timezone,instructions,version) OUTPUT INSERTED.*
        VALUES(@id,@status,@startsAt,@endsAt,@timeZone,@instructions,@version)`,args))[0];
      await query(`INSERT INTO dbo.property_viewing_events
        (enquiry_id,actor_id,request_id,payload_hash,status,starts_at,ends_at,timezone,instructions,version)
        VALUES(@id,@actorId,@requestId,@payloadHash,@status,@startsAt,@endsAt,@timeZone,@instructions,@version)`,args);
      return viewingReceipt(row);
    })
  };
};
