import test from 'node:test';
import assert from 'node:assert/strict';
import {parseApplicationAction,nextApplication,applicationReceipt} from '../src/api/enquiries/applicationContract.js';
const requestId='11111111-1111-4111-8111-111111111111';
const input={action:'submit',version:0,requestId,moveInDate:'2026-11-15',occupants:2,termMonths:12,statement:'I would like a long-term rental.',consent:true};
const enquiry={country_code:'LK',status:'responded'},now=new Date('2026-10-28T00:00:00Z');
const submitted=()=>({...nextApplication(null,parseApplicationAction(input),false,enquiry,true,now),version:1});
test('application contracts require explicit consent, valid civil dates and bounded requested details',()=>{
  assert.equal(parseApplicationAction(input).payloadHash,parseApplicationAction({...input,requestId:'22222222-2222-4222-8222-222222222222'}).payloadHash);
  for(const mutation of [{consent:false},{tenantId:requestId},{moveInDate:'2026-02-30'},{occupants:0},{occupants:2.5},
    {termMonths:121},{statement:' '},{statement:'x'.repeat(2001)},{email:'spoofed'},{action:'accept'}]){
    assert.throws(()=>parseApplicationAction({...input,...mutation}),{code:'INVALID_APPLICATION'});
  }
  assert.throws(()=>parseApplicationAction(input,true));
  assert.throws(()=>parseApplicationAction({action:'accept',version:1,requestId,note:''},true));
});
test('viewing, market date, open enquiry and version are enforced without automatic decisions',()=>{
  assert.throws(()=>nextApplication(null,parseApplicationAction(input),false,enquiry,false,now),{code:'APPLICATION_VIEWING_REQUIRED'});
  assert.throws(()=>nextApplication(null,parseApplicationAction({...input,moveInDate:'2026-10-27'}),false,enquiry,true,now),{code:'APPLICATION_DATE_UNAVAILABLE'});
  assert.throws(()=>nextApplication(null,parseApplicationAction(input),false,{...enquiry,status:'closed'},true,now),{code:'ENQUIRY_CLOSED'});
  assert.throws(()=>nextApplication(submitted(),{action:'accept',version:0,note:'reviewed'},true,enquiry,true,now),{code:'APPLICATION_CHANGED'});
  assert.equal(submitted().status,'submitted');
});
test('owner requests information, seeker resubmits with renewed consent and owner accepts explicitly',()=>{
  const more=nextApplication(submitted(),{action:'needs_information',version:1,note:'Please clarify move-in plans.'},true,enquiry,true,now);
  assert.equal(more.status,'needs_information');
  const revised=nextApplication({...more,version:2},parseApplicationAction({...input,version:2}),false,enquiry,true,now);
  assert.equal(revised.status,'submitted');assert.equal(revised.consent_version,'rental-application-v1');
  const accepted=nextApplication({...revised,version:3},{action:'accept',version:3,note:'Reviewed for offer preparation.'},true,enquiry,true,now);
  assert.equal(accepted.status,'accepted');
  assert.ok(!Object.hasOwn(accepted,'agreement_id'));assert.ok(!Object.hasOwn(accepted,'tenant_id'));
  assert.equal(nextApplication({...accepted,version:4},{action:'withdraw',version:4},false,{...enquiry,status:'closed'},true,now).status,'withdrawn');
});
test('declined and withdrawn applications are terminal; receipts omit internal identity and hashes',()=>{
  const declined=nextApplication(submitted(),{action:'decline',version:1,note:'Unable to proceed.'},true,enquiry,true,now);
  assert.throws(()=>nextApplication({...declined,version:2},parseApplicationAction({...input,version:2}),false,enquiry,true,now),{code:'APPLICATION_CHANGED'});
  const receipt=applicationReceipt({...submitted(),tenant_id:'secret',seeker_email:'secret',payload_hash:'secret'});
  assert.ok(!JSON.stringify(receipt).includes('secret'));
  assert.equal(receipt.moveInDate,'2026-11-15');
});
