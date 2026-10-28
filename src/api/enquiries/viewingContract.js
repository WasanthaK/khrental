import {createHash} from 'node:crypto';
import {isUuid,enquiryError} from './contract.js';

export const VIEWING_ZONES=Object.freeze({LK:'Asia/Colombo',BN:'Asia/Brunei'});
const invalid=()=>enquiryError(400,'INVALID_VIEWING','Choose an action, current version and a valid viewing time (15–180 minutes).');
export const parseViewingAction=(body,owner=false)=>{
  const scheduled=['request','propose'].includes(body?.action);
  const allowed=['action','version','requestId',...(scheduled?['startsAt','endsAt']:[]),
    ...(['confirm','propose'].includes(body?.action)&&owner?['instructions']:[])];
  if (!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!allowed.includes(k))||
      !isUuid(body.requestId)||!Number.isInteger(body.version)||body.version<0||
      !(owner?['propose','confirm','cancel','complete','no_show']:['request','accept','cancel']).includes(body.action)) {
    throw invalid();
  }
  const result={action:body.action,version:body.version,requestId:body.requestId.toLowerCase()};
  if (scheduled) {
    for (const name of ['startsAt','endsAt']) {
      if (typeof body[name]!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(body[name])||
          !Number.isFinite(Date.parse(body[name]))||new Date(body[name]).toISOString()!==body[name]) {throw invalid();}
      result[name]=body[name];
    }
    const minutes=(Date.parse(result.endsAt)-Date.parse(result.startsAt))/60000;
    if (minutes<15||minutes>180) {throw invalid();}
  }
  if (allowed.includes('instructions')) {
    const text=body.instructions??'';
    if (typeof text!=='string'||text.trim().length>500||/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {throw invalid();}
    result.instructions=text.trim();
  }
  return {...result,payloadHash:createHash('sha256').update(JSON.stringify([owner,result.action,result.version,
    result.startsAt??null,result.endsAt??null,result.instructions??null])).digest('hex')};
};

export const viewingReceipt=row=>row?{
  status:row.status,startsAt:row.starts_at,endsAt:row.ends_at,timeZone:row.timezone,
  version:row.version,updatedAt:row.updated_at??row.created_at,
  instructions:['confirmed','completed','no_show'].includes(row.status)?row.instructions||null:null
}:null;

// Authority/scope and current listing eligibility are enforced by the store.
// Time is supplied from SQL Server inside the same transaction, not the browser.
export const nextViewing=(old,input,owner,enquiry,now)=>{
  const conflict=()=>enquiryError(409,'VIEWING_CHANGED','This viewing changed. Refresh before trying again.');
  if ((old?.version??0)!==input.version) {throw conflict();}
  const active=['requested','proposed','confirmed'];
  const status=old?.status;
  const next={startsAt:old?.starts_at,endsAt:old?.ends_at,
    timeZone:VIEWING_ZONES[enquiry.country_code],instructions:old?.instructions||null};
  if (!next.timeZone) {throw conflict();}
  if (['request','propose','confirm','accept'].includes(input.action)&&!['pending','responded'].includes(enquiry.status)) {
    throw enquiryError(409,'ENQUIRY_CLOSED','This enquiry is closed. You can still cancel an existing viewing.');
  }
  if (input.action==='request'&&!owner&&(!old||active.includes(status)||status==='cancelled')) {
    Object.assign(next,{status:'requested',startsAt:input.startsAt,endsAt:input.endsAt,instructions:null});
  } else if (input.action==='propose'&&owner&&(!old||active.includes(status)||status==='cancelled')) {
    Object.assign(next,{status:'proposed',startsAt:input.startsAt,endsAt:input.endsAt,instructions:input.instructions||null});
  } else if (input.action==='confirm'&&owner&&status==='requested') {
    Object.assign(next,{status:'confirmed',instructions:input.instructions||null});
  } else if (input.action==='accept'&&!owner&&status==='proposed') {
    next.status='confirmed';
  } else if (input.action==='cancel'&&active.includes(status)) {
    Object.assign(next,{status:'cancelled',instructions:null});
  } else if (owner&&['complete','no_show'].includes(input.action)&&status==='confirmed'&&new Date(old.ends_at)<=now) {
    next.status=input.action==='complete'?'completed':'no_show';
  } else {throw conflict();}
  if (['request','propose','confirm','accept'].includes(input.action)) {
    const start=new Date(next.startsAt),end=new Date(next.endsAt);
    if (!(start>now)||start.getTime()>now.getTime()+90*86400000||end<=start) {
      throw enquiryError(409,'VIEWING_TIME_UNAVAILABLE','Choose a future viewing within the next 90 days.');
    }
  }
  return next;
};
