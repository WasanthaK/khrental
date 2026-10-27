import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createPublicListingsRouter,createPublicListingPreferencesRouter} from '../src/api/publicListings/router.js';

const tenant='22222222-2222-4222-8222-222222222222';
const user='11111111-1111-4111-8111-111111111111';
const property='33333333-3333-4333-8333-333333333333';
const publicId='44444444-4444-4444-8444-444444444444';
const row={public_id:publicId,propertytype:'house',country_code:'LK',
  public_headline:'Family home',monthly_rent:145000,location_label:'Colombo district',opted_out:0,
  bank_account_number:'redacted_by_contract',property_id:'private_source_id'};
const actor={authSession:{},user:{id:user,role:'admin'},tenantId:tenant,
  membership:{status:'active',role:'admin',tenant_id:tenant}};
const makeCall=async(router,method,path,body,identity)=>{
  const app=express();app.use(express.json());app.use((req,res,next)=>{if(identity)Object.assign(req,identity);next();});
  app.use('/listing',router);
  app.use((error,req,res,next)=>res.status(error.status||500).json({code:error.code||'ERROR'}));
  const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  try{
    const result=await fetch('http://127.0.0.1:'+server.address().port+'/listing'+path,
      {method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    return {status:result.status,body:await result.json()};
  }finally{await new Promise(resolve=>server.close(resolve));}
};
test('default-off public API returns 404 before querying SQL',async()=>{
 let called=false;
 const router=createPublicListingsRouter({env:{},rateLimit:async()=>{called=true;return true;},list:async()=>{called=true;return [row]}});
 const result=await makeCall(router,'GET','/?country=LK');
 assert.equal(result.status,404);assert.equal(called,false);
});
test('public read returns only allowlisted data for eligible listings',async()=>{
 const router=createPublicListingsRouter({env:{PUBLIC_LISTING_READ_ENABLED:'true',PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true'},
   rateLimit:async()=>true,list:async country=>country==='LK'?[row]:[]});
 const ok=await makeCall(router,'GET','/?country=LK');
 assert.equal(ok.status,200);
 assert.deepEqual(Object.keys(ok.body.data[0]),['id','country','category','title','location','monthlyRent','currency','images']);
 assert.equal(ok.body.data[0].monthlyRent,145000);
 assert.deepEqual(ok.body.data[0].images,[]);
 assert.equal(JSON.stringify(ok.body).includes('redacted_by_contract'),false);
 assert.equal((await makeCall(router,'GET','/?country=US')).status,400);
});
test('country filter discards foreign-market rows even if database list is mis-scoped',async()=>{
  const mixed=[row,{...row,country_code:'BN',public_id:'66666666-6666-4666-8666-666666666666'}];
  const router=createPublicListingsRouter({
    env:{PUBLIC_LISTING_READ_ENABLED:'true',PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true'},
    rateLimit:async()=>true,list:async()=>mixed
  });
  const sriLanka=await makeCall(router,'GET','/?country=LK');
  const brunei=await makeCall(router,'GET','/?country=BN');
  assert.equal(sriLanka.status,200);
  assert.equal(sriLanka.body.data.length,1);
  assert.equal(sriLanka.body.data[0].country,'LK');
  assert.equal(brunei.body.data.length,1);
  assert.equal(brunei.body.data[0].country,'BN');
});

test('listing details cannot be opened through the wrong country',async()=>{
  const router=createPublicListingsRouter({
    env:{PUBLIC_LISTING_READ_ENABLED:'true',PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true'},
    rateLimit:async()=>true,find:async()=>row
  });
  assert.equal((await makeCall(router,'GET','/'+publicId)).status,400);
  assert.equal((await makeCall(router,'GET','/'+publicId+'?country=US')).status,400);
  assert.equal((await makeCall(router,'GET','/'+publicId+'?country=BN')).status,404);
  const result=await makeCall(router,'GET','/'+publicId+'?country=LK');
  assert.equal(result.status,200);
  assert.equal(result.body.data.country,'LK');
});

test('shared limiter blocks browsing before querying listings',async()=>{
 let count=0;
 const router=createPublicListingsRouter({env:{PUBLIC_LISTING_READ_ENABLED:'true',PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true'},
  rateLimit:async()=>false,list:async()=>{count++;return [row]}});
 assert.equal((await makeCall(router,'GET','/?country=LK')).status,429);assert.equal(count,0);
});
test('management is disabled without release switch',async()=>{
 const router=createPublicListingPreferencesRouter({env:{},context:(req,res,next)=>next()});
 assert.equal((await makeCall(router,'PATCH','/'+property,{optedOut:true},actor)).status,404);
});
test('only authenticated active tenant admins can change public opt-out',async()=>{
 let writes=0;
 const router=createPublicListingPreferencesRouter({
  env:{PUBLIC_LISTING_MANAGEMENT_ENABLED:'true'},
  context:(req,res,next)=>next(),
  put:async()=>{writes++;return {opted_out:1}}
 });
 for(const identity of [undefined,{...actor,user:{id:user,role:'staff'},membership:{...actor.membership,role:'staff'}},
   {...actor,membership:{...actor.membership,status:'inactive'}},
   {...actor,membership:{...actor.membership,tenant_id:'55555555-5555-4555-8555-555555555555'}}]){
   assert.equal((await makeCall(router,'PATCH','/'+property,{optedOut:true},identity)).status,403);
 }
 assert.equal(writes,0);
});
test('tenant admin may opt out and restore eligibility without manual publication',async()=>{
 const seen=[];
 const router=createPublicListingPreferencesRouter({
  env:{PUBLIC_LISTING_MANAGEMENT_ENABLED:'true'},context:(req,res,next)=>next(),
  put:async input=>{seen.push(input.changes.optedOut);return {public_id:publicId, opted_out:input.changes.optedOut, country_code:'LK'};}
 });
 assert.equal((await makeCall(router,'PATCH','/'+property,{optedOut:true},actor)).status,200);
 assert.equal((await makeCall(router,'PATCH','/'+property,{optedOut:false},actor)).status,200);
 assert.deepEqual(seen,[true,false]);
});

test('market readiness is private, disabled by default and scoped to active administrator',async()=>{
  let readCount=0;
  const off=createPublicListingPreferencesRouter({
    env:{},context:(req,res,next)=>next(),
    listReadiness:async()=>{readCount++;return {counts:{},records:[]};}
  });
  assert.equal((await makeCall(off,'GET','/market-readiness',undefined,actor)).status,404);
  const on=createPublicListingPreferencesRouter({
    env:{PUBLIC_LISTING_MANAGEMENT_ENABLED:'true'},
    context:(req,res,next)=>next(),
    listReadiness:async(...args)=>{
      readCount++;
      assert.equal(args[0],tenant);
      assert.deepEqual(args[1],{offset:0,limit:50});
      return {
        counts:{total:2,assigned:1,unassigned:1,optedOut:0},
        records:[{propertyId:property,propertyName:'Country missing',availabilityStatus:'available',
          countryCode:null,optedOut:false}],offset:0,limit:50
      };
    }
  });
  for(const identity of [undefined,{...actor,user:{id:user,role:'staff'},membership:{...actor.membership,role:'staff'}},
    {...actor,membership:{...actor.membership,status:'inactive'}},
    {...actor,membership:{...actor.membership,tenant_id:'55555555-5555-4555-8555-555555555555'}}]){
    assert.equal((await makeCall(on,'GET','/market-readiness',undefined,identity)).status,403);
  }
  assert.equal(readCount,0,'unauthorized requests never reach SQL');
  const ok=await makeCall(on,'GET','/market-readiness',undefined,actor);
  assert.equal(ok.status,200);
  assert.equal(readCount,1);
  assert.equal(ok.body.data.counts.unassigned,1);
  assert.equal(ok.body.data.records[0].countryCode,null);
  assert.ok(!JSON.stringify(ok.body).includes('SECRET'));
});

test('market readiness clamps pagination rather than accepting unbounded page scans',async()=>{
  let called;
  const router=createPublicListingPreferencesRouter({
    env:{PUBLIC_LISTING_MANAGEMENT_ENABLED:'true'},
    context:(req,res,next)=>next(),
    listReadiness:async(tenantId,query)=>{called={tenantId,query};return {records:[],counts:{}};}
  });
  const result=await makeCall(router,'GET','/market-readiness?limit=5000&offset=-4',undefined,actor);
  assert.equal(result.status,200);
  assert.equal(called.tenantId,tenant);
  assert.deepEqual(called.query,{offset:0,limit:100});
});

test('image preparation requires both management and independent preparation switches',async()=>{
  let invoked=0;
  const make=(env)=>createPublicListingPreferencesRouter({
    env,context:(req,res,next)=>next(),prepareImage:async()=>{invoked++;return {status:'withheld'};}
  });
  const route='/'+property+'/media/prepare';
  const request={imageIndex:0,altText:'Living room'};
  assert.equal((await makeCall(make({}), 'POST',route,request,actor)).status,404);
  assert.equal((await makeCall(make({PUBLIC_LISTING_MANAGEMENT_ENABLED:'true'}),'POST',route,request,actor)).status,404);
  assert.equal((await makeCall(make({PUBLIC_LISTING_IMAGE_PREPARE_ENABLED:'true'}),'POST',route,request,actor)).status,404);
  assert.equal(invoked,0,'defaults may never read private image source bytes');
});

test('tenant admin may prepare withheld photos, but cannot mass-assign readiness, paths or rights',async()=>{
  const args=[];
  const router=createPublicListingPreferencesRouter({
    env:{PUBLIC_LISTING_MANAGEMENT_ENABLED:'true',PUBLIC_LISTING_IMAGE_PREPARE_ENABLED:'true'},
    context:(req,res,next)=>next(),
    prepareImage:async(...input)=>{args.push(input);return {mediaId:publicId,status:'withheld'};}
  });
  const route='/'+property+'/media/prepare';
  for(const payload of [
    {imageIndex:0,altText:'Living room',media_status:'ready'},
    {imageIndex:0,altText:'Living room',bucket:'images'},
    {imageIndex:0,altText:'Living room',rightsConfirmed:true},
    {imageIndex:0,altText:'Living room',sourceUrl:'https://example.com/private.jpg'},
    {imageIndex:-1,altText:'Living room'}
  ])assert.equal((await makeCall(router,'POST',route,payload,actor)).status,400);
  for(const identity of [undefined,{...actor,membership:{...actor.membership,status:'inactive'}},
    {...actor,membership:{...actor.membership,tenant_id:'55555555-5555-4555-8555-555555555555'}}])
    assert.equal((await makeCall(router,'POST',route,{imageIndex:0,altText:'Living room'},identity)).status,403);
  assert.equal(args.length,0);
  const ok=await makeCall(router,'POST',route,{imageIndex:0,altText:'Living room'},actor);
  assert.equal(ok.status,202);
  assert.equal(ok.body.data.status,'withheld');
  assert.equal(args.length,1);
  assert.deepEqual(args[0][0],{
    tenantId:tenant,propertyId:property,actorId:user,imageIndex:0,altText:'Living room'
  });
  assert.equal(args[0][1].env.PUBLIC_LISTING_IMAGE_PREPARE_ENABLED,'true');
});

const pilotEnv={
  PUBLIC_LISTING_READ_ENABLED:'true',PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true',
  PUBLIC_LISTING_MEDIA_ENABLED:'true',PUBLIC_LISTING_IMAGE_PROCESSOR_READY:'true',
  PUBLIC_LISTING_PILOT_PUBLIC_ID:publicId.toUpperCase()
};
const excludedId='66666666-6666-4666-8666-666666666666';
const pilotMediaId='77777777-7777-4777-8777-777777777777';

test('single-listing pilot filters a mixed collection before enriching photos',async()=>{
  let mediaIds;
  const router=createPublicListingsRouter({
    env:pilotEnv,rateLimit:async()=>true,
    list:async()=>[row,{...row,public_id:excludedId}],
    listMedia:async ids=>{mediaIds=ids;return [
      {listingPublicId:publicId,mediaId:pilotMediaId,alt:'Reviewed exterior'},
      {listingPublicId:excludedId,mediaId:pilotMediaId,alt:'Excluded'}
    ];}
  });
  const result=await makeCall(router,'GET','/?country=LK');
  assert.equal(result.status,200);
  assert.deepEqual(result.body.data.map(x=>x.id),[publicId]);
  assert.deepEqual(mediaIds,[publicId]);
  assert.equal(result.body.data[0].images.length,1);
  assert.ok(!JSON.stringify(result.body).includes(excludedId));
});

test('pilot rejects other direct listing and media links before SQL or object reads',async()=>{
  let finds=0,mediaFinds=0,reads=0;
  const router=createPublicListingsRouter({
    env:pilotEnv,rateLimit:async()=>true,
    find:async()=>{finds++;return row;},
    findMedia:async()=>{mediaFinds++;return {};},
    readDerivative:async()=>{reads++;return {body:Buffer.from('{}')};}
  });
  assert.equal((await makeCall(router,'GET','/'+excludedId+'?country=LK')).status,404);
  assert.equal((await makeCall(router,'GET','/'+excludedId+'/media/'+pilotMediaId+'?country=LK')).status,404);
  assert.deepEqual([finds,mediaFinds,reads],[0,0,0]);
  const ok=await makeCall(router,'GET','/'+publicId+'?country=LK');
  assert.equal(ok.status,200);
  assert.equal(ok.body.data.id,publicId);
  assert.equal((await makeCall(router,'GET','/'+publicId+'?country=BN')).status,404);
});

test('pilot allows its selected photo and retains post-read eligibility recheck',async()=>{
  let lookups=0,reads=0;
  const meta={derivativeSha256:'abc'};
  const router=createPublicListingsRouter({
    env:pilotEnv,rateLimit:async()=>true,
    findMedia:async args=>{
      assert.equal(args.listingId,publicId);assert.equal(args.mediaId,pilotMediaId);
      lookups++;return lookups<=2?meta:null;
    },
    readDerivative:async()=>{reads++;return {body:Buffer.from('{}')};}
  });
  assert.equal((await makeCall(router,'GET','/'+publicId+'/media/'+pilotMediaId+'?country=LK')).status,200);
  assert.equal(lookups,2);assert.equal(reads,1);
  assert.equal((await makeCall(router,'GET','/'+publicId+'/media/'+pilotMediaId+'?country=LK')).status,404);
  assert.equal(reads,1,'withdrawn photo is not read again');
});

test('invalid explicitly configured pilot IDs fail closed before queries',async()=>{
  for(const id of ['', ' ', 'not-an-id', publicId+','+excludedId]){
    let invoked=0;
    const router=createPublicListingsRouter({
      env:{...pilotEnv,PUBLIC_LISTING_PILOT_PUBLIC_ID:id},
      rateLimit:async()=>{invoked++;return true;},
      list:async()=>{invoked++;return [row];}
    });
    assert.equal((await makeCall(router,'GET','/?country=LK')).status,404);
    assert.equal((await makeCall(router,'GET','/'+publicId+'?country=LK')).status,404);
    assert.equal((await makeCall(router,'GET','/'+publicId+'/media/'+pilotMediaId+'?country=LK')).status,404);
    assert.equal(invoked,0);
  }
});

test('request query parameters cannot replace the server-selected pilot listing',async()=>{
  const router=createPublicListingsRouter({
    env:pilotEnv,rateLimit:async()=>true,
    list:async()=>[row,{...row,public_id:excludedId}],listMedia:async()=>[]
  });
  const result=await makeCall(router,'GET','/?country=LK&publicId='+excludedId+'&pilotPublicId='+excludedId);
  assert.deepEqual(result.body.data.map(x=>x.id),[publicId]);
});

test('pilot does not replace the existing default-OFF publication gates',async()=>{
  const router=createPublicListingsRouter({
    env:{PUBLIC_LISTING_PILOT_PUBLIC_ID:publicId},
    rateLimit:async()=>{throw Error('must not query');}
  });
  assert.equal((await makeCall(router,'GET','/?country=LK')).status,404);
});
