import {normalizePropertyCountry} from '../../utils/constants.js';
import {PUBLIC_MARKETS,PUBLIC_TYPES,parseCountry} from './eligibility.js';

export const ID_REGEX=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isId=id=>ID_REGEX.test(String(id||'').trim());
const reject=(code,message)=>Object.assign(new Error(message),{status:400,code});
const text=(value,max,name)=>{
  if(value===null||value===undefined||value==='')return null;
  if(typeof value!=='string')throw reject('INVALID_PUBLIC_FIELD',name+' must be text.');
  const s=value.trim();
  if(!s||s.length>max||/[<>\x00-\x1F]/.test(s))
    throw reject('INVALID_PUBLIC_FIELD',name+' contains unsupported characters.');
  return s;
};
// Public copy is curated independently from private property.description/address.
// Opt-out defaults to false if omitted; it remains persistent across occupancy updates.
export const parsePreferenceInput=(input={})=>{
  if(!input||Array.isArray(input)||typeof input!=='object')throw reject('INVALID_PREFERENCE','Invalid public listing preferences.');
  const keys=['optedOut','countryCode','headline','locationLabel'];
  for(const k of Object.keys(input))if(!keys.includes(k))throw reject('UNAPPROVED_PUBLIC_FIELD','Not a public listing setting: '+k);
  if(!Object.keys(input).length)throw reject('EMPTY_PREFERENCE','At least one setting is required.');
  const result={};
  if(Object.hasOwn(input,'optedOut')){
    if(typeof input.optedOut!=='boolean')throw reject('INVALID_OPT_OUT','Opt-out must be a boolean.');
    result.optedOut=input.optedOut;
  }
  if(Object.hasOwn(input,'countryCode')){
    result.countryCode=normalizePropertyCountry(input.countryCode);
  }
  if(Object.hasOwn(input,'headline'))result.headline=text(input.headline,150,'headline');
  if(Object.hasOwn(input,'locationLabel'))result.locationLabel=text(input.locationLabel,120,'locationLabel');
  return result;
};

export const PUBLIC_FIELDS=Object.freeze(['id','country','category','title','location','monthlyRent','currency','images']);
// Strict output schema - no source ID, tenant ID, raw address, owner, agreements, bank accounts or source images.
export const toPublicDTO=row=>{
  if(!row)return null;
  const country=parseCountry(row.country_code);
  const category=PUBLIC_TYPES[String(row.propertytype||'').toLowerCase()]||'other';
  if(!country||row.opted_out===true||row.opted_out===1)return null;
  const rent=Number(row.monthly_rent);
  const obj={
    id:String(row.public_id),country,category,
    title:String(row.public_headline|| (category==='commercial'?'Commercial space for rent':'Home for rent')),
    location:String(row.location_label|| (country==='LK'?'Sri Lanka':'Brunei Darussalam')),
    monthlyRent:Number.isFinite(rent)&&rent>0?rent:null,
    currency:PUBLIC_MARKETS[country],
    images:[] // no raw storage pointers; public derivatives need independent release validation.
  };
  return Object.fromEntries(PUBLIC_FIELDS.map(k=>[k,obj[k]]));
};
