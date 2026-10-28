import {createHash} from 'node:crypto';
import {isUuid,enquiryError} from './contract.js';
const fail=()=>enquiryError(400,'INVALID_APPLICATION','Supply the current application version, requested details and explicit sharing consent.');
const safeText=(value,required=false)=>typeof value==='string'&&value.trim().length<=2000&&
  (!required||value.trim().length>0)&&!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value);
export const parseApplicationAction=(body,owner=false)=>{
  const submit=body?.action==='submit';
  const keys=['action','version','requestId',...(submit?['moveInDate','occupants','termMonths','statement','consent']:owner?['note']:[])];
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k))||
      !isUuid(body.requestId)||!Number.isInteger(body.version)||body.version<0||
      !(owner?['needs_information','accept','decline']:['submit','withdraw']).includes(body.action)){throw fail();}
  const result={action:body.action,version:body.version,requestId:body.requestId.toLowerCase()};
  if(submit){
    if(body.consent!==true||!Number.isInteger(body.occupants)||body.occupants<1||body.occupants>50||
        !Number.isInteger(body.termMonths)||body.termMonths<1||body.termMonths>120||
        typeof body.moveInDate!=='string'||!/^\d{4}-\d\d-\d\d$/.test(body.moveInDate)||
        !Number.isFinite(Date.parse(body.moveInDate))||new Date(body.moveInDate).toISOString().slice(0,10)!==body.moveInDate||
        !safeText(body.statement,true)){throw fail();}
    Object.assign(result,{moveInDate:body.moveInDate,occupants:body.occupants,termMonths:body.termMonths,
      statement:body.statement.trim(),consent:true});
  }else if(owner){
    if(!safeText(body.note,true)){throw fail();}result.note=body.note.trim();
  }
  const {requestId,...content}=result;
  return {...result,payloadHash:createHash('sha256').update(JSON.stringify([owner,content])).digest('hex')};
};
export const applicationReceipt=row=>row?{
  status:row.status,moveInDate:new Date(row.move_in_date).toISOString().slice(0,10),occupants:row.occupants,
  termMonths:row.term_months,statement:row.statement,note:row.owner_note||null,
  consentVersion:row.consent_version,consentAt:row.consent_at,version:row.version,updatedAt:row.updated_at
}:null;
export const nextApplication=(old,input,owner,enquiry,viewingComplete,now)=>{
  const changed=()=>enquiryError(409,'APPLICATION_CHANGED','This application changed. Refresh before trying again.');
  if((old?.version??0)!==input.version){throw changed();}
  if(!owner&&input.action==='withdraw'&&old&&['submitted','needs_information','accepted'].includes(old.status)){
    return {...old,status:'withdrawn'};
  }
  if(!['pending','responded'].includes(enquiry.status)&&input.action!=='decline'){
    throw enquiryError(409,'ENQUIRY_CLOSED','This enquiry is closed. Existing applications can still be withdrawn or declined.');
  }
  if(!owner&&input.action==='submit'&&(!old||old.status==='needs_information')){
    if(!viewingComplete){throw enquiryError(409,'APPLICATION_VIEWING_REQUIRED','Complete a viewing with the owner before applying.');}
    // The civil date is evaluated in the property's market, never the device timezone.
    const zone={LK:'Asia/Colombo',BN:'Asia/Brunei'}[enquiry.country_code];
    if(!zone){throw changed();}
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    if(input.moveInDate<today||Date.parse(input.moveInDate)>now.getTime()+366*86400000){
      throw enquiryError(409,'APPLICATION_DATE_UNAVAILABLE','Choose a move-in date from today through the next year.');
    }
    return {status:'submitted',move_in_date:input.moveInDate,occupants:input.occupants,term_months:input.termMonths,
      statement:input.statement,owner_note:old?.owner_note||null,consent_version:'rental-application-v1',consent_at:now};
  }
  if(owner&&old&&['submitted','needs_information'].includes(old.status)){
    if(input.action==='needs_information'&&old.status==='submitted'){
      return {...old,status:'needs_information',owner_note:input.note};
    }
    if(input.action==='decline'){return {...old,status:'declined',owner_note:input.note};}
    if(input.action==='accept'&&old.status==='submitted'&&viewingComplete){
      return {...old,status:'accepted',owner_note:input.note};
    }
  }
  throw changed();
};
