import {isId} from './contract.js';

const SUPPORTED_EXT=/\.(?:jpe?g|png|webp)$/i;
const FILE_NAME=/^[A-Za-z0-9][A-Za-z0-9._-]{0,190}$/;

// Never fetch arbitrary stored image_url values over HTTP. Reconstruct a private
// tenant-scoped object-storage key after strict URL + ownership validation.
export const resolveRegisteredPhoto=(rawImages,index,tenantId,{
  allowedOrigins=['https://app.quixo.homes']
}={})=>{
  if(!isId(tenantId))throw new Error('Invalid tenant identity.');
  if(!Number.isInteger(index)||index<0||index>49)throw new Error('Invalid property photo selection.');
  const parsed=typeof rawImages==='string'?JSON.parse(rawImages):rawImages;
  if(!Array.isArray(parsed)||!parsed.length||parsed.length>50)throw new Error('No valid registered property photos.');
  const item=parsed[index];
  const value=typeof item==='string'?item:item?.image_url;
  if(typeof value!=='string'||value.length>1600)throw new Error('Unsupported property photo reference.');
  let url;
  try{url=new URL(value,'https://app.quixo.homes');}
  catch{throw new Error('Invalid property photo reference.');}
  const origins=new Set(allowedOrigins.map(x=>new URL(x).origin));
  if(!origins.has(url.origin)||url.search||url.hash||url.username||url.password)
    throw new Error('Unapproved image origin or link parameters.');
  // Reject encoded separators/traversal, double-encoded paths and legacy public buckets.
  if(url.pathname.includes('%')||url.pathname.includes('\\'))
    throw new Error('Encoded property image paths are not permitted.');
  const parts=url.pathname.split('/').filter(Boolean);
  if(parts.length!==6||parts[0]!=='storage'||parts[1]!=='images'||
     parts[2]!=='tenants'||parts[3].toLowerCase()!==tenantId.toLowerCase()||
     parts[4]!=='properties'||!FILE_NAME.test(parts[5])||!SUPPORTED_EXT.test(parts[5])||
     parts[5]==='.'||parts[5]==='..')
    throw new Error('Property photo must belong to this tenant and property storage folder.');
  return {bucket:'images',path:'tenants/'+tenantId.toLowerCase()+'/properties/'+parts[5]};
};

export const sanitizePhotoAlt=value=>{
  if(typeof value!=='string')throw new Error('Photo description must be text.');
  const alt=value.trim();
  if(!alt||alt.length>180||/[<>\x00-\x1f]/.test(alt))
    throw new Error('Invalid public photo description.');
  return alt;
};

export const sha256Hex=bytes=>{
  // Imported lazily to keep utility usable in browser-independent unit tests.
  // Crypto is exclusively the built-in Node implementation.
  return import('node:crypto').then(({default:crypto})=>
    crypto.createHash('sha256').update(bytes).digest('hex'));
};
