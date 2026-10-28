// Public browsing category is separate from physical property type.
export const LISTING_CATEGORIES=Object.freeze([
  {code:'residential',label:'Houses & apartments'},
  {code:'retail',label:'Shops & retail'},
  {code:'office',label:'Offices & workspaces'}
]);
export const normalizeListingCategory=value=>{
  const code=typeof value==='string'?value.trim().toLowerCase():'';
  if(!LISTING_CATEGORIES.some(c=>c.code===code))throw Object.assign(
    new Error('Choose houses & apartments, shops & retail, or offices & workspaces.'),
    {status:400,code:'PROPERTY_LISTING_CATEGORY_REQUIRED'});
  return code;
};
export const normalizePropertyRentalValues=(value,{requireCategory=false}={})=>{
  let data=value;
  if(typeof data==='string'){try{data=JSON.parse(data);}catch{data=null;}}
  if(!data||typeof data!=='object'||Array.isArray(data))throw Object.assign(
    new Error('Property rental settings must be an object.'),{status:400,code:'INVALID_PROPERTY_RENTAL_VALUES'});
  const result={...data};
  if(requireCategory||Object.hasOwn(result,'listingCategory'))result.listingCategory=normalizeListingCategory(result.listingCategory);
  return result;
};
export const publicListingCategory=(explicit,physicalType)=>{
  if(explicit!==null&&explicit!==undefined&&explicit!==''){
    try{return normalizeListingCategory(explicit);}catch{return 'other';}
  }
  // Preserve known legacy classifications; never guess retail versus office.
  const type=String(physicalType||'').toLowerCase();
  if(['house','apartment','condo'].includes(type))return 'residential';
  return ['commercial','land'].includes(type)?type:'other';
};
