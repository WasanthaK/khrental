import {createHash} from 'node:crypto';
import {isUuid,enquiryError} from './contract.js';

const invalid=()=>enquiryError(400,'INVALID_RENTAL_OFFER','Supply the current version and complete rental terms and deadlines.');
const date=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\d$/.test(value)&&
  Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const instant=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const money=value=>typeof value==='string'&&/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(value);
export const parseOfferAction=(body,owner=false)=>{
  const issue=body?.action==='issue';
  const allowed=['action','version','requestId',...(issue?['applicationVersion','unitId','rent','deposit','fees','startDate','endDate','terms','offerUntil','holdUntil']:body?.action==='accept'?['consent']:body?.action==='agreement'?['templateId']:[])];
  if(!body||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k))||!isUuid(body.requestId)||
      !Number.isInteger(body.version)||body.version<0||!(owner?['issue','withdraw','agreement']:['accept','decline','withdraw']).includes(body.action)){throw invalid();}
  const out={action:body.action,version:body.version};
  if(issue){
    if(!Number.isInteger(body.applicationVersion)||body.applicationVersion<1||
        (body.unitId!==null&&!isUuid(body.unitId))||![body.rent,body.deposit,body.fees].every(money)||Number(body.rent)<=0||
        !date(body.startDate)||!date(body.endDate)||body.endDate<=body.startDate||
        !instant(body.offerUntil)||!instant(body.holdUntil)||body.holdUntil<=body.offerUntil||
        typeof body.terms!=='string'||!body.terms.trim()||body.terms.length>8000||/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(body.terms)){throw invalid();}
    Object.assign(out,{applicationVersion:body.applicationVersion,unitId:body.unitId?.toLowerCase()||null,
      rent:Number(body.rent).toFixed(2),deposit:Number(body.deposit).toFixed(2),fees:Number(body.fees).toFixed(2),
      startDate:body.startDate,endDate:body.endDate,terms:body.terms.trim(),offerUntil:body.offerUntil,holdUntil:body.holdUntil});
  }
  if(body.action==='accept'){if(body.consent!==true){throw invalid();}out.consent=true;}
  if(body.action==='agreement'){if(!isUuid(body.templateId)){throw invalid();}out.templateId=body.templateId.toLowerCase();}
  return {...out,requestId:body.requestId.toLowerCase(),payloadHash:createHash('sha256').update(JSON.stringify([owner,out])).digest('hex')};
};
export const offerReceipt=row=>row?{
  status:row.status,version:row.version,applicationVersion:row.application_version,
  unitLabel:row.unit_label||null,currency:row.currency,rent:Number(row.rent).toFixed(2),deposit:Number(row.deposit).toFixed(2),fees:Number(row.fees).toFixed(2),
  startDate:new Date(row.start_date).toISOString().slice(0,10),endDate:new Date(row.end_date).toISOString().slice(0,10),terms:row.terms,
  offerUntil:row.offer_until,holdUntil:row.hold_until,acceptedAt:row.accepted_at||null,consentVersion:row.consent_version||null,
  agreementId:row.agreement_id||null,updatedAt:row.updated_at
}:null;
export const assertOfferVersion=(row,input)=>{
  if((row?.version??0)!==input.version){throw enquiryError(409,'OFFER_CHANGED','This offer changed. Refresh and review its current terms.');}
};
