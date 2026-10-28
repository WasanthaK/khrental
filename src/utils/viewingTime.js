export const viewingZone=country=>({LK:'Asia/Colombo',BN:'Asia/Brunei'}[country]||null);
// Both launch markets have a fixed civil offset and no daylight-saving fold.
// Never interpret a property's appointment in the visitor's computer timezone.
export const viewingLocalToUtc=(value,country)=>{
  const minutes={LK:330,BN:480}[country];
  if (minutes===undefined||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) {throw new Error('Choose a valid local date and time.');}
  const parsed=Date.parse(value+':00.000Z');
  if (!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,16)!==value) {throw new Error('Choose a valid local date and time.');}
  return new Date(parsed-minutes*60000).toISOString();
};
export const viewingTimeLabel=(value,timeZone)=>new Intl.DateTimeFormat('en-GB',{
  timeZone,dateStyle:'medium',timeStyle:'short'
}).format(new Date(value));
