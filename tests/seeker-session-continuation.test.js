import test from 'node:test';
import assert from 'node:assert/strict';
import {continueVerifiedSeekerSession} from '../src/services/seekerContextClient.js';

const session={access_token:'new-synthetic-session',user:{id:'new-account'}};
const existing={access_token:'existing-synthetic-session',user:{id:'another-account'}};
const certified={data:{verified:true,eligible:true,userType:'seeker',tenantId:null}};
const fixture=({before=null,oldStatus=200,newStatus=200,payload=certified,mutateAt=0,throwsAt=0}={})=>{
  let stored=structuredClone(before),writes=0,clears=0;
  const requests=[];
  const fetchImpl=async(url,options)=>{
    requests.push({url,options});
    if(mutateAt===requests.length)stored={...existing,access_token:'changed-session'};
    if(throwsAt===requests.length)throw Error('Synthetic outage');
    const status=url.endsWith('seeker-context')?newStatus:oldStatus;
    return {ok:status===200,status,json:async()=>payload};
  };
  return {
    options:{session,expectedAuthId:session.user.id,fetchImpl,readSession:()=>stored,
      writeSession:value=>{writes++;stored=value;},clearTenant:()=>{clears++;}},
    requests,result:()=>({stored,writes,clears})
  };
};
test('verified new seeker adopts issued session without a second credential login',async()=>{
  const x=fixture();assert.deepEqual(await continueVerifiedSeekerSession(x.options),{adopted:true});
  assert.deepEqual(x.result(),{stored:session,writes:1,clears:1});
  assert.equal(x.requests.length,1);
  assert.deepEqual(x.requests[0],{url:'/api/platform/auth/seeker-context',options:{method:'GET',
    headers:{Authorization:'Bearer new-synthetic-session'},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error'}});
});
test('valid different account remains signed in; no local session or tenant write',async()=>{
  const x=fixture({before:existing});
  assert.deepEqual(await continueVerifiedSeekerSession(x.options),{adopted:false,reason:'another_account'});
  assert.deepEqual(x.result(),{stored:existing,writes:0,clears:0});
  assert.deepEqual(x.requests[1],{url:'/api/platform/auth/context',options:{method:'GET',
    headers:{Authorization:'Bearer existing-synthetic-session'},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error'}});
});
test('definitely expired different session can be replaced, unknown validation cannot',async()=>{
  const stale=fixture({before:existing,oldStatus:401});
  assert.deepEqual(await continueVerifiedSeekerSession(stale.options),{adopted:true});
  for(const status of [403,404,429,500,503]){
    const x=fixture({before:existing,oldStatus:status});
    assert.equal((await continueVerifiedSeekerSession(x.options)).adopted,false);
    assert.deepEqual(x.result(),{stored:existing,writes:0,clears:0});
  }
  const offline=fixture({before:existing,throwsAt:2});
  assert.equal((await continueVerifiedSeekerSession(offline.options)).adopted,false);
  assert.deepEqual(offline.result(),{stored:existing,writes:0,clears:0});
});
test('same account can resume but unverified new sessions never persist',async()=>{
  const same=fixture({before:{...existing,user:session.user}});
  assert.deepEqual(await continueVerifiedSeekerSession(same.options),{adopted:true});
  for(const change of [{newStatus:401},{newStatus:503},{payload:{data:{verified:true,eligible:false}}},{throwsAt:1}]){
    const x=fixture(change);assert.equal((await continueVerifiedSeekerSession(x.options)).adopted,false);
    assert.equal(x.result().writes,0);assert.equal(x.result().clears,0);
  }
  for(const altered of [null,{access_token:'token-no-user'}, {...session,user:{id:'wrong-account'}}]){
    const x=fixture();assert.equal((await continueVerifiedSeekerSession({...x.options,session:altered})).adopted,false);
    assert.equal(x.requests.length,0);assert.equal(x.result().writes,0);
  }
});
test('a concurrent account change at either server boundary is preserved',async()=>{
  for(const mutateAt of [1,2]){
    const x=fixture({before:existing,oldStatus:401,mutateAt});
    assert.deepEqual(await continueVerifiedSeekerSession(x.options),{adopted:false,reason:'session_changed'});
    assert.equal(x.result().stored.access_token,'changed-session');
    assert.equal(x.result().writes,0);assert.equal(x.result().clears,0);
  }
});
test('storage failure requires explicit sign-in instead of claiming continuation',async()=>{
  const x=fixture();x.options.writeSession=()=>{throw Error('storage denied');};
  assert.deepEqual(await continueVerifiedSeekerSession(x.options),{adopted:false,reason:'verification_unavailable'});
  assert.equal(x.result().writes,0);
});
