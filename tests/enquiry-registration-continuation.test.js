import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicSignupChallengeToken} from '../src/api/auth/publicSignupChallenge.js';
import {normalizePublicSignupDetails} from '../src/api/auth/publicSignupChallengeService.js';
import {createPublicSignupVerificationLink,createPublicSignupVerificationEmail} from '../src/api/auth/publicSignupVerificationEmail.js';
import {consumeSeekerVerificationContext} from '../src/utils/seekerVerificationFragment.js';
import {enquiryReturnPath,parseEnquiryIntent,pendingVerificationBrowseUrl} from '../src/utils/enquiryReturnPath.js';
import express from 'express';
import {publicListingPhoto,publicListingRent} from '../src/utils/publicListingPresentation.js';
import {createPublicSignupRouter} from '../src/api/auth/publicSignupRegistrationRouter.js';

const enquiry={listingId:'11111111-1111-4111-8111-111111111111',country:'LK'};
test('real challenge router passes only a validated listing pointer into the verification email',async t=>{
  const {token}=createPublicSignupChallengeToken();const envelopes=[],beginnings=[];
  const app=express();app.use(express.json());
  app.use(createPublicSignupRouter({enabled:true,limiter:{durable:true,consume:async()=>true},
    clientAddress:()=> '127.0.0.1',throttleSecret:'synthetic-proof-only-'.repeat(3),
    beginChallenge:async details=>{beginnings.push(details);return {token,email:details.email,challengeId:enquiry.listingId};},
    finishDelivery:async()=>{},sendEmail:async envelope=>{envelopes.push(envelope);return {success:true};},
    makeEmail:context=>createPublicSignupVerificationEmail({...context,baseUrl:'https://app.quixo.homes',production:true}),
    redeem:async()=>null,findAuth:async()=>null,createSession:async()=>null}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const send=body=>fetch('http://127.0.0.1:'+server.address().port+'/challenge',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const valid={email:'seeker@example.test',name:'A seeker',enquiry};
  const reply=await send(valid);assert.equal(reply.status,200);assert.ok(!(await reply.text()).includes(token));
  assert.deepEqual(beginnings,[valid]);assert.equal(envelopes.length,1);
  assert.ok(envelopes[0].html.includes('&amp;listingId='+enquiry.listingId));
  assert.equal((await send({...valid,enquiry:{...enquiry,tenantId:'forged'}})).status,200);
  assert.equal(envelopes.length,1);assert.equal(beginnings.length,1);
});
test('registration intent is a strict public listing pointer, never a scope or redirect',()=>{
  assert.deepEqual(parseEnquiryIntent(enquiry),enquiry);
  assert.deepEqual(normalizePublicSignupDetails({email:'seeker@example.test',name:'A seeker',enquiry}),
    {email:'seeker@example.test',name:'A seeker',enquiry});
  for(const bad of [null,[],{...enquiry,country:'US'},{...enquiry,tenantId:'forged'},
    {...enquiry,returnUrl:'https://evil.test'},{...enquiry,listingId:'../dashboard'}]){
    assert.equal(parseEnquiryIntent(bad),null);
    assert.equal(normalizePublicSignupDetails({email:'seeker@example.test',name:'A seeker',enquiry:bad}),null);
  }
});
test('email resumes the selected listing across browsers without leaking a token into path/query/history',()=>{
  const {token}=createPublicSignupChallengeToken();
  const url=new URL(createPublicSignupVerificationLink({token,baseUrl:'https://app.quixo.homes',production:true,enquiry}));
  assert.equal(url.pathname,'/verify-email');assert.equal(url.search,'');
  const events=[];
  const context=consumeSeekerVerificationContext({location:{pathname:url.pathname,search:url.search,hash:url.hash},
    history:{state:{unrelated:true},replaceState:(state,title,path)=>events.push({state,title,path})}});
  assert.equal(context.token,token);
  assert.equal(enquiryReturnPath(context.enquirySearch),'/enquire?listingId='+enquiry.listingId+'&country=LK');
  assert.deepEqual(events,[{state:{unrelated:true},title:'',path:'/verify-email'}]);
  assert.ok(!JSON.stringify(events).includes(token));
  assert.ok(!context.enquirySearch.includes(token));
  const mail=createPublicSignupVerificationEmail({token,baseUrl:'https://app.quixo.homes',production:true,enquiry});
  assert.ok(mail.html.includes('&amp;listingId='));
});
test('malformed continuation and failed scrubbing cannot produce a redemption context',()=>{
  const {token}=createPublicSignupChallengeToken();
  for(const suffix of ['\n','&role=admin','&listingId='+enquiry.listingId,'&listingId='+enquiry.listingId+'&country=US',
    '&listingId='+enquiry.listingId+'&country=LK&tenantId=forged','&listingId=../dashboard&country=LK']){
    const events=[];
    const context=consumeSeekerVerificationContext({location:{pathname:'/verify-email',hash:'#token='+token+suffix},
      history:{replaceState:(s,t,p)=>events.push(p)}});
    assert.deepEqual(context,{token:null,enquirySearch:''});assert.deepEqual(events,['/verify-email']);
  }
  assert.deepEqual(consumeSeekerVerificationContext({location:{pathname:'/verify-email',hash:'#token='+token},
    history:{replaceState(){throw Error('denied');}}}),{token:null,enquirySearch:''});
  assert.throws(()=>createPublicSignupVerificationLink({token,baseUrl:'https://app.quixo.homes',production:true,
    enquiry:{...enquiry,returnUrl:'https://evil.test'}}));
});


test('signup acknowledgement returns to public browsing with no identity or credential in the URL',()=>{
  const result=new URL(pendingVerificationBrowseUrl('?listingId='+enquiry.listingId+'&country=LK&email=private@example.test&token=secret&returnUrl=https://evil.test'));
  assert.equal(result.origin,'https://quixo.homes');assert.equal(result.pathname,'/lk/property/');
  assert.deepEqual([...result.searchParams],[['id',enquiry.listingId],['verification','pending']]);
  for(const query of ['', '?returnUrl=https://evil.test', '?listingId=bad&country=LK','?listingId='+enquiry.listingId+'&country=US']){
    assert.equal(pendingVerificationBrowseUrl(query),'https://quixo.homes/?verification=pending');
  }
});


test('enquiry summary accepts only approved public media for the selected property and market',()=>{
  const id=enquiry.listingId,media='abcdefab-abcd-4abc-8abc-abcdefabcdef';
  const url='/api/public-listings/'+id+'/media/'+media+'?country=LK';
  const listing={id,country:'LK',title:'Public property',images:[{url,alt:'Approved photo'}]};
  assert.deepEqual(publicListingPhoto(listing),{src:url,alt:'Approved photo'});
  assert.deepEqual(publicListingPhoto({...listing,images:[{url:'https://app.quixo.homes'+url}]}),{src:url,alt:'Public property property photograph'});
  for(const bad of ['https://private.example/photo.webp','https://evil.test'+url,'/api/storage/private.webp',
    url.replace(id,media),url.replace('country=LK','country=BN'),url+'&token=private',url+'#private',
    'https://user:password@app.quixo.homes'+url]){
    assert.equal(publicListingPhoto({...listing,images:[{url:bad}]}),null,bad);
  }
  assert.equal(publicListingPhoto({...listing,images:[]}),null);
});

test('enquiry rent is formatted from the approved public market currency without inventing a price',()=>{
  assert.match(publicListingRent({country:'LK',currency:'LKR',monthlyRent:100000}),/LKR.*100,000/);
  assert.match(publicListingRent({country:'BN',currency:'BND',monthlyRent:1200}),/BND.*1,200/);
  for(const monthlyRent of [null,0,-1,Infinity,NaN,'100000'])assert.equal(publicListingRent({country:'LK',currency:'LKR',monthlyRent}),null);
  assert.equal(publicListingRent({country:'LK',currency:'USD',monthlyRent:100}),null);
});
