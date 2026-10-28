import {rentalOfferSchedule} from '../src/utils/rentalOfferSchedule.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {parseOfferAction,assertOfferVersion,offerReceipt} from '../src/api/enquiries/offerContract.js';
import {createEnquiriesRouter} from '../src/api/enquiries/router.js';
import {requestSeekerEnquiries} from '../src/services/seekerContextClient.js';
const uuid=()=>crypto.randomUUID();
const issue=()=>({action:'issue',version:0,requestId:uuid(),applicationVersion:2,unitId:null,rent:'100000.00',deposit:'200000',fees:'0',startDate:'2027-01-01',endDate:'2028-01-01',terms:'Exact agreed terms',offerUntil:'2026-11-01T04:00:00.000Z',holdUntil:'2026-11-02T04:00:00.000Z'});
test('offers bind exact bounded commercial terms, application version and explicit UTC deadlines',()=>{
 const body=issue(),parsed=parseOfferAction(body,true);assert.equal(parsed.deposit,'200000.00');
 assert.equal(parseOfferAction({...body,requestId:uuid()},true).payloadHash,parsed.payloadHash);
 assert.notEqual(parseOfferAction({...body,rent:'100001'},true).payloadHash,parsed.payloadHash);
 for(const bad of [{tenantId:uuid()},{renteeId:uuid()},{rent:100000},{fees:'-1'},{unitId:'foreign'},{applicationVersion:0},{endDate:'2027-01-01'},{startDate:'2027-02-30'},{holdUntil:body.offerUntil},{terms:''}]){
  assert.throws(()=>parseOfferAction({...body,...bad},true),{code:'INVALID_RENTAL_OFFER'});
 }
 assert.throws(()=>parseOfferAction(body,false),{code:'INVALID_RENTAL_OFFER'});
});
test('acceptance, existing-account agreement preparation and current-version checks have separate authorities',()=>{
 const body={action:'accept',version:1,requestId:uuid(),consent:true};assert.equal(parseOfferAction(body).consent,true);
 assert.throws(()=>parseOfferAction({...body,consent:false}),{code:'INVALID_RENTAL_OFFER'});
 assert.throws(()=>parseOfferAction(body,true),{code:'INVALID_RENTAL_OFFER'});
 assert.throws(()=>parseOfferAction({action:'agreement',version:2,requestId:uuid(),templateId:uuid()}),{code:'INVALID_RENTAL_OFFER'});
 assert.doesNotThrow(()=>parseOfferAction({action:'agreement',version:2,requestId:uuid(),templateId:uuid()},true));
 assert.throws(()=>assertOfferVersion({version:2},{version:1}),{code:'OFFER_CHANGED'});
 const receipt=offerReceipt({status:'accepted',version:2,application_version:1,currency:'LKR',rent:100,deposit:200,fees:0,start_date:'2027-01-01',end_date:'2028-01-01',terms:'Agreed',tenant_id:uuid(),property_id:uuid(),payload_hash:'private'});
 assert.equal(receipt.unitLabel,null);assert.ok(!('property_id' in receipt));assert.ok(!('tenant_id' in receipt));assert.ok(!('payload_hash' in receipt));
});
const fixture=async(t,env,session=true)=>{
 const calls=[],id=uuid(),app=express();app.use(express.json());app.use((req,res,next)=>{if(session){req.authSession={record:{appUserId:uuid(),authId:uuid()},sessionId:uuid()};}next();});
 app.use(createEnquiriesRouter({env,context:(req,res,next)=>{req.user={};next();},verifySeeker:async()=>{throw new Error('Personal signup certification must not authorize a converted journey');},
  offers:{get:async(...args)=>{calls.push(args);return {offer:null};},change:async(...args)=>{calls.push(args);return {offer:null};}},store:{list:async(...args)=>{calls.push(args);return {items:[],hasMore:false};}}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 return {calls,send:(method='GET',action='accept',origin='https://app.quixo.homes',suffix='/'+id+'/offer')=>fetch('http://127.0.0.1:'+server.address().port+suffix,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({action,version:1,requestId:uuid(),...(action==='accept'?{consent:true}:{})})}:{})})};
};
const env={PROPERTY_ENQUIRIES_ENABLED:'true',PUBLIC_LISTING_READ_ENABLED:'true',PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true',PROPERTY_RENTAL_OFFERS_SCHEMA_READY:'true',PROPERTY_RENTAL_OFFERS_ENABLED:'true'};
test('offer and converted-history APIs preserve session/origin gates and disable new actions independently of withdrawals',async t=>{
 const f=await fixture(t,env);assert.equal((await f.send()).status,200);assert.equal((await f.send('POST')).status,200);
 assert.equal((await f.send('POST','accept','https://foreign.invalid')).status,403);
 assert.equal((await f.send('GET','accept',undefined,'/journey?offset=0')).status,200);
 assert.equal(f.calls.at(-1)[3],true,'Only dedicated history reads opt into converted identity authority');
 const closed=await fixture(t,{...env,PROPERTY_RENTAL_OFFERS_ENABLED:'false'});assert.equal((await closed.send()).status,200);
 assert.equal((await closed.send('POST')).status,409);assert.equal((await closed.send('POST','withdraw')).status,200);
 const off=await fixture(t,{...env,PROPERTY_RENTAL_OFFERS_SCHEMA_READY:'false'});assert.equal((await off.send()).status,404);assert.equal(off.calls.length,0);
 const anonymous=await fixture(t,env,false);assert.equal((await anonymous.send()).status,401);assert.equal(anonymous.calls.length,0);
});
test('personal journey transport keeps explicit bearer-only, no-cookie authority after conversion',async()=>{
 const original=global.fetch;let request;
 global.fetch=async(url,options)=>{request={url,options};return {ok:true,json:async()=>({data:{items:[]}})};};
 try{await requestSeekerEnquiries({getSession:async()=>({data:{session:{access_token:'fixture-only'}}}),path:'/journey?offset=0'});
  assert.equal(request.url,'/api/property-enquiries/journey?offset=0');assert.equal(request.options.credentials,'omit');assert.equal(request.options.headers['X-Tenant-Id'],undefined);
 }finally{global.fetch=original;}
});

test('the signed document includes the accepted fee/term schedule even when the template omits those fields',()=>{
 assert.equal(rentalOfferSchedule({terms:{}}),'');
 const html=rentalOfferSchedule({terms:{rentalOfferEnquiry:uuid(),currency:'LKR',monthlyRent:100,depositAmount:200,feesAmount:30,startDate:'2027-01-01',endDate:'2028-01-01',additionalTerms:'<script>private proposal</script>',holdUntil:'2026-11-02T04:00:00.000Z'}});
 assert.match(html,/Other fees: LKR 30/);assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('<script>'));
});
