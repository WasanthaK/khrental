import test from 'node:test';
import assert from 'node:assert/strict';
import {parseViewingAction,nextViewing,viewingReceipt} from '../src/api/enquiries/viewingContract.js';
import {viewingLocalToUtc,viewingZone} from '../src/utils/viewingTime.js';
const requestId='11111111-1111-4111-8111-111111111111';
const now=new Date('2026-10-28T00:00:00Z');
const enquiry={country_code:'LK',status:'pending'};
const scheduled={action:'request',version:0,requestId,startsAt:'2026-10-29T04:30:00.000Z',endsAt:'2026-10-29T05:30:00.000Z'};
const row=(status='requested',version=1)=>({status,version,starts_at:scheduled.startsAt,ends_at:scheduled.endsAt,timezone:'Asia/Colombo',instructions:'Private meeting point'});
test('viewing contracts derive timezone, constrain roles, dates, duration and scope',()=>{
  const input=parseViewingAction(scheduled);
  assert.equal(input.payloadHash,parseViewingAction({...scheduled,requestId:'22222222-2222-4222-8222-222222222222'}).payloadHash);
  for(const change of [{tenantId:requestId},{instructions:'Secret'},{action:'confirm'},{version:-1},
    {startsAt:'2026-02-30T04:30:00.000Z'},{endsAt:scheduled.startsAt},{endsAt:'2026-10-29T09:30:00.000Z'},
    {timeZone:'America/New_York'},{startsAt:'2026-10-29T04:30:00+00:00'}]){
    assert.throws(()=>parseViewingAction({...scheduled,...change}),{code:'INVALID_VIEWING'});
  }
  assert.throws(()=>parseViewingAction(scheduled,true),{code:'INVALID_VIEWING'});
  assert.throws(()=>parseViewingAction({action:'confirm',version:1,requestId,instructions:'x'.repeat(501)},true));
});
test('viewing changes require reciprocal confirmation and optimistic version',()=>{
  assert.equal(nextViewing(null,parseViewingAction(scheduled),false,enquiry,now).status,'requested');
  assert.equal(nextViewing(row(),parseViewingAction({action:'confirm',version:1,requestId,instructions:'Meet here'},true),true,enquiry,now).status,'confirmed');
  assert.equal(nextViewing(row('proposed'),parseViewingAction({action:'accept',version:1,requestId}),false,enquiry,now).status,'confirmed');
  assert.throws(()=>nextViewing(row('confirmed'),{action:'accept',version:1},false,enquiry,now),{code:'VIEWING_CHANGED'});
  assert.throws(()=>nextViewing(row(),{action:'confirm',version:0},true,enquiry,now),{code:'VIEWING_CHANGED'});
  assert.throws(()=>nextViewing(null,parseViewingAction(scheduled),false,{...enquiry,status:'withdrawn'},now),{code:'ENQUIRY_CLOSED'});
  assert.equal(nextViewing(row('confirmed'),{action:'cancel',version:1},false,{...enquiry,status:'closed'},now).status,'cancelled');
});
test('past/far-future appointments and premature completion fail closed',()=>{
  assert.throws(()=>nextViewing(null,parseViewingAction(scheduled),false,enquiry,new Date('2026-10-30Z')),{code:'VIEWING_TIME_UNAVAILABLE'});
  assert.throws(()=>nextViewing(null,parseViewingAction(scheduled),false,enquiry,new Date('2025-10-30Z')),{code:'VIEWING_TIME_UNAVAILABLE'});
  assert.throws(()=>nextViewing(row('confirmed'),{action:'complete',version:1},true,enquiry,now),{code:'VIEWING_CHANGED'});
  assert.equal(nextViewing(row('confirmed'),{action:'complete',version:1},true,enquiry,new Date('2026-10-30Z')).status,'completed');
});
test('meeting instructions are private until confirmation; receipts contain no identity/source fields',()=>{
  assert.equal(viewingReceipt(row('proposed')).instructions,null);
  assert.equal(viewingReceipt(row('cancelled')).instructions,null);
  const receipt=viewingReceipt({...row('confirmed'),tenant_id:'secret',seeker_email:'secret'});
  assert.equal(receipt.instructions,'Private meeting point');
  assert.ok(!JSON.stringify(receipt).includes('secret'));
});
test('local appointment conversion ignores the browser timezone in both launch markets',()=>{
  assert.equal(viewingLocalToUtc('2026-10-29T10:00','LK'),'2026-10-29T04:30:00.000Z');
  assert.equal(viewingLocalToUtc('2026-10-29T10:00','BN'),'2026-10-29T02:00:00.000Z');
  assert.equal(viewingZone('US'),null);
  assert.throws(()=>viewingLocalToUtc('2026-02-30T10:00','LK'));
  assert.throws(()=>viewingLocalToUtc('2026-10-29T10:00','US'));
});
