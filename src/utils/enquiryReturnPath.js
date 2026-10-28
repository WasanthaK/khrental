// Only the listing reference and market can survive the sign-in round trip.
// Never accept a URL, arbitrary path, private property id or tenant selection.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const enquiryReturnPath = search => {
  const params=new URLSearchParams(search);
  const listingId=params.get('listingId'),country=params.get('country');
  if (!UUID.test(listingId||'') || !['LK','BN'].includes(country)) {return null;}
  return '/enquire?listingId='+listingId.toLowerCase()+'&country='+country;
};
export const enquiryLoginSearch = search => {
  const path=enquiryReturnPath(search);
  return path?'?'+path.split('?')[1]:'';
};
