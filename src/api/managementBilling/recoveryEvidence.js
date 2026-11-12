import {BILLING_ACCOUNT,problem} from './contract.js';
import {objectId} from './stripe.js';
import {billingClock} from './clock.js';

// Provider state equality alone does not prove which request applied a proration.
// Retain only the matching event identity, never the provider event body.
export const requestObjectEvidence=async({stripe,type,resourceId,customerId,key,since,matches=()=>true,clock=billingClock})=>{
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
        event.request?.idempotency_key===key&&(!resourceId||object?.id===resourceId)&&object?.livemode===false&&(!customerId||objectId(object.customer)===customerId)&&
        Number.isSafeInteger(event.created)&&event.created>=start&&event.created*1000<=clock.now()+300000&&matches(object)){
        return {eventId:event.id,object};
      }
    }
    if(!page.has_more){return null;}
    cursor=page.data.at(-1)?.id;
    if(!cursor||cursors.has(cursor)){break;}
    cursors.add(cursor);
  }
  throw problem(503,'BILLING_RECOVERY_EVIDENCE_UNAVAILABLE','Provider request history could not be exhausted.');
};

export const requestEvidence=async args=>{
  const evidence=await requestObjectEvidence(args);
  return evidence?{eventId:evidence.eventId}:null;
};

// Exhaust the bounded listing before deciding absence or uniqueness. Never POST
// after a truncated, malformed or ambiguous provider history.
export const uniqueProviderObject=async({stripe,path,params={},matches})=>{
  let cursor;const cursors=new Set(),found=new Map();
  for(let n=0;n<10;n++){
    const page=await stripe.request('GET',path,{...params,limit:100,...(cursor?{starting_after:cursor}:{})});
    if(!Array.isArray(page.data)||typeof page.has_more!=='boolean'){
      throw problem(503,'BILLING_RECOVERY_EVIDENCE_UNAVAILABLE','Provider history could not be read.');
    }
    for(const object of page.data){if(matches(object)){found.set(object.id,object);}}
    if(found.size>1){throw problem(409,'BILLING_RECOVERY_AMBIGUOUS','Multiple provider objects need review.');}
    if(!page.has_more){return [...found.values()][0]||null;}
    cursor=page.data.at(-1)?.id;
    if(!cursor||cursors.has(cursor)){break;}cursors.add(cursor);
  }
  throw problem(503,'BILLING_RECOVERY_EVIDENCE_UNAVAILABLE','Provider history could not be exhausted.');
};
