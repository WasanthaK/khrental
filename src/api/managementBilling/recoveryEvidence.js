import {BILLING_ACCOUNT,problem} from './contract.js';
import {objectId} from './stripe.js';
import {billingClock} from './clock.js';

// Provider state equality alone does not prove which request applied a proration.
// Retain only the matching event identity, never the provider event body.
export const requestEvidence=async({stripe,type,resourceId,customerId,key,since,matches=()=>true,clock=billingClock})=>{
  const start=Math.floor(new Date(since).getTime()/1000)-60;
  if(!Number.isFinite(start)||start*1000<clock.now()-30*86400000){return null;}
  let cursor;const cursors=new Set();
  for(let pageNumber=0;pageNumber<10;pageNumber++){
    const page=await stripe.request('GET','/v1/events',{type,created:{gte:start},limit:100,...(cursor?{starting_after:cursor}:{})});
    if(!Array.isArray(page.data)||typeof page.has_more!=='boolean'){
      throw problem(503,'BILLING_RECOVERY_EVIDENCE_UNAVAILABLE','Provider request evidence could not be read.');
    }
    for(const event of page.data){
      const object=event.data?.object;
      if(typeof event.id==='string'&&event.type===type&&event.livemode===false&&(!event.account||event.account===BILLING_ACCOUNT)&&
        event.request?.idempotency_key===key&&object?.id===resourceId&&object.livemode===false&&objectId(object.customer)===customerId&&
        Number.isSafeInteger(event.created)&&event.created>=start&&event.created*1000<=clock.now()+300000&&matches(object)){
        return {eventId:event.id};
      }
    }
    if(!page.has_more){return null;}
    cursor=page.data.at(-1)?.id;
    if(!cursor||cursors.has(cursor)){break;}
    cursors.add(cursor);
  }
  throw problem(503,'BILLING_RECOVERY_EVIDENCE_UNAVAILABLE','Provider request history could not be exhausted.');
};
