// Only the listing reference and market can survive the sign-in round trip.
// Never accept a URL, arbitrary path, private property id or tenant selection.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const ownerSetupPath=search=>{
  const p=new URLSearchParams(search);
  return ['LK','BN'].includes(p.get('ownerCountry'))&&!p.has('listingId')?'/owner-start?country='+p.get('ownerCountry'):null;
};
export const parseEnquiryIntent = input => {
  if(!input||typeof input!=='object'||Array.isArray(input)||
      Object.keys(input).some(k=>!['listingId','country'].includes(k))||
      typeof input.listingId!=='string'||!UUID.test(input.listingId)||!['LK','BN'].includes(input.country)){
    return null;
  }
  return {listingId:input.listingId.toLowerCase(),country:input.country};
};
export const enquiryIntentFromSearch = search => {
  const params=new URLSearchParams(search);
  return parseEnquiryIntent({listingId:params.get('listingId'),country:params.get('country')});
};
export const enquiryReturnPath = search => {
  const intent=enquiryIntentFromSearch(search);
  return intent?'/enquire?listingId='+intent.listingId+'&country='+intent.country:null;
};
export const enquiryLoginSearch = search => {
  const path=enquiryReturnPath(search);
  return path?'?'+path.split('?')[1]:'';
};

// Return to public browsing after a generic signup acknowledgement. Never put
// an email, password, token or arbitrary return URL on the public website.
export const pendingVerificationBrowseUrl=search=>{
  const intent=enquiryIntentFromSearch(search);
  const url=new URL(intent
    ?'https://quixo.homes/'+intent.country.toLowerCase()+'/property/?id='+intent.listingId
    :'https://quixo.homes/');
  url.searchParams.set('verification','pending');
  return url.href;
};
