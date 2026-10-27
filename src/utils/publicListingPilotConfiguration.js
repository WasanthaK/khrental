const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields=['id','country','category','title','location','monthlyRent','currency'];

// Only combine the already authorized server projection and approved-photo
// manifest. Do not serialize the property, preference draft or original image.
export function buildPilotConfiguration(preview,photos){
  if(!preview||!id.test(preview.id)||preview.country!=='LK'||preview.currency!=='LKR')return null;
  const approved=(Array.isArray(photos)?photos:[]).filter(photo=>photo.status==='ready');
  if(approved.length!==1||!id.test(approved[0].mediaId))return null;
  const photo=approved[0];
  if(typeof photo.altText!=='string'||!photo.altText.trim()||photo.altText.length>180)return null;
  if(typeof preview.title!=='string'||typeof preview.location!=='string'||
    !['residential','commercial','land','other'].includes(preview.category)||
    !(preview.monthlyRent===null||(Number.isFinite(preview.monthlyRent)&&preview.monthlyRent>0)))return null;
  return {...Object.fromEntries(fields.map(key=>[key,preview[key]])),images:[{
    url:'/api/public-listings/'+encodeURIComponent(preview.id)+'/media/'+encodeURIComponent(photo.mediaId)+'?country=LK',
    alt:photo.altText
  }]};
}
