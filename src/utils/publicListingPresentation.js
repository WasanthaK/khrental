// Present only the existing public listing projection; never private media URLs.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const publicListingPhoto=listing=>{
  if(!uuid.test(String(listing?.id||''))||!['LK','BN'].includes(listing?.country))return null;
  for(const entry of Array.isArray(listing.images)?listing.images:[]){
    if(typeof entry?.url!=='string')continue;
    try{
      const url=new URL(entry.url,'https://app.quixo.homes');
      const parts=url.pathname.split('/');
      if(url.origin!=='https://app.quixo.homes'||url.username||url.password||url.hash||
        parts.length!==6||parts[1]!=='api'||parts[2]!=='public-listings'||
        parts[3].toLowerCase()!==listing.id.toLowerCase()||parts[4]!=='media'||!uuid.test(parts[5])||
        [...url.searchParams.keys()].length!==1||url.searchParams.get('country')!==listing.country)continue;
      return {src:url.pathname+url.search,alt:typeof entry.alt==='string'&&entry.alt.trim()?entry.alt.slice(0,180):listing.title+' property photograph'};
    }catch{/* Ignore unapproved or malformed public media. */}
  }
  return null;
};
export const publicListingRent=listing=>{
  const currency={LK:'LKR',BN:'BND'}[listing?.country];
  if(!currency||listing?.currency!==currency||typeof listing.monthlyRent!=='number'||
      !Number.isFinite(listing.monthlyRent)||listing.monthlyRent<=0)return null;
  return new Intl.NumberFormat('en',{style:'currency',currency,currencyDisplay:'code',minimumFractionDigits:0,maximumFractionDigits:2}).format(listing.monthlyRent);
};
