// An accepted offer's commercial schedule must survive templates that do not
// contain fee/term merge fields. All proposal text is escaped before HTML use.
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const rentalOfferSchedule=agreement=>{
  let terms=agreement?.terms;
  if(typeof terms==='string'){try{terms=JSON.parse(terms);}catch{return '';}}
  if(!terms?.rentalOfferEnquiry){return '';}
  return `<section><h2>Accepted rental terms</h2>
<p>Monthly rent: ${escape(terms.currency)} ${escape(terms.monthlyRent)}. Security deposit: ${escape(terms.currency)} ${escape(terms.depositAmount)}. Other fees: ${escape(terms.currency)} ${escape(terms.feesAmount)}.</p>
<p>Rental dates: ${escape(terms.startDate)} to ${escape(terms.endDate)}.</p>
<p style="white-space:pre-wrap">${escape(terms.additionalTerms)}</p>
<p>Reservation deadline: ${escape(terms.holdUntil)} (UTC). No automatic extension. Signing does not record payment or activate the tenancy; deposit evidence, move-in checks and explicit owner activation are separate.</p></section>`;
};
