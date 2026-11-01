// Quixo.Homes read-only catalog display. No credentials and no private property fields.
// It is always dormant until the independent static-site review flag is enabled.
const apiOrigin='https://app.quixo.homes';
const previewArea=document.querySelector('[data-public-listing-market]');

const kinds=['residential','commercial','retail','office'];
const selectedKind=new URLSearchParams(location.search).get('type');
const kindLabels={residential:'houses & apartments',commercial:'commercial properties',retail:'shops & retail',office:'offices & workspaces'};
const detailPage=previewArea?.hasAttribute('data-public-listing-detail');
// Only public catalog fields can be searched. URL parameters are navigation,
// not authentication or authority; unknown parameters are never propagated.
const isSearchPage=location.pathname.endsWith('/search/');
const searchParameters=new URLSearchParams(location.search);
const requestedLocation=isSearchPage?(searchParameters.get('location')||'').trim().slice(0,100):'';
const locationQuery=requestedLocation.toLocaleLowerCase();
const requestedRent=isSearchPage?searchParameters.get('maxRent'):null;
const maximumRent=requestedRent&&/^\d{1,12}$/.test(requestedRent)&&Number(requestedRent)>0?Number(requestedRent):null;
const filterForm=isSearchPage?document.querySelector('[data-rental-filters]'):null;
if(filterForm){
  filterForm.elements.location.value=requestedLocation;
  filterForm.elements.maxRent.value=maximumRent===null?'':String(maximumRent);
  filterForm.addEventListener('submit',event=>{
    event.preventDefault();
    const next=new URLSearchParams();
    if(kinds.includes(selectedKind))next.set('type',selectedKind);
    const locationValue=String(filterForm.elements.location.value||'').trim().slice(0,100);
    const rentValue=String(filterForm.elements.maxRent.value||'').trim();
    if(locationValue)next.set('location',locationValue);
    if(/^\d{1,12}$/.test(rentValue)&&Number(rentValue)>0)next.set('maxRent',String(Number(rentValue)));
    location.assign(location.pathname+(next.size?'?'+next.toString():''));
  });
  const clear=filterForm.querySelector('[data-clear-rental-filters]');
  if(clear)clear.href=location.pathname+(kinds.includes(selectedKind)?'?type='+encodeURIComponent(selectedKind):'');
}

// This reminder is a browsing preference, never authentication or access proof.
// It holds only a validated public property reference, never contact/credential data.
{
  const key='quixo.signup.pending';
  const pointer=value=>value&&typeof value==='object'&&!Array.isArray(value)&&
    Object.keys(value).length===2&&['LK','BN'].includes(value.country)&&
    typeof value.listingId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.listingId)
    ?{listingId:value.listingId.toLowerCase(),country:value.country}:null;
  let pending=null;
  try {
    const value=JSON.parse(sessionStorage.getItem(key));
    if(value&&Object.keys(value).length===1&&Object.hasOwn(value,'intent')&&
      (value.intent===null||pointer(value.intent)))pending={intent:pointer(value.intent)};
  }catch{/* Browsing must still work with storage disabled. */}
  const url=new URL(location.href);
  if(url.searchParams.get('verification')==='pending'){
    pending={intent:detailPage?pointer({listingId:url.searchParams.get('id'),country:document.body.dataset.country}):null};
    try{sessionStorage.setItem(key,JSON.stringify(pending));}catch{/* Current-page reminder still works. */}
    url.searchParams.delete('verification');
    try{history.replaceState(history.state,'',url.pathname+url.search+url.hash);}catch{/* No secret is present in this marker. */}
  }
  if(pending){
    const banner=document.createElement('section');
    banner.className='verification-reminder';banner.setAttribute('role','status');
    banner.setAttribute('aria-label','Email verification reminder');
    const copy=document.createElement('div');
    const title=document.createElement('strong');title.textContent='Verify your email to unlock account features';
    const text=document.createElement('p');text.textContent='Keep browsing while you wait. Check your inbox for a verification link.';
    copy.append(title,text);
    const actions=document.createElement('div');actions.className='verification-reminder-actions';
    const search=pending.intent?'?listingId='+pending.intent.listingId+'&country='+pending.intent.country:'';
    const clear=()=>{try{sessionStorage.removeItem(key);}catch{}banner.remove();};
    const next=document.createElement('a');next.className='verification-reminder-continue';
    next.href=apiOrigin+(pending.intent?'/enquire'+search:'/seeker');
    next.textContent='Continue after verifying';next.addEventListener('click',clear);
    const signin=document.createElement('a');signin.href=apiOrigin+'/login'+search;
    signin.textContent='Already registered? Sign in';signin.addEventListener('click',clear);
    const dismiss=document.createElement('button');dismiss.type='button';
    dismiss.textContent='×';dismiss.setAttribute('aria-label','Dismiss verification reminder');
    dismiss.addEventListener('click',clear);
    actions.append(next,signin,dismiss);banner.append(copy,actions);
    document.querySelector('main')?.before(banner);
  }
}
if(isSearchPage){
  for(const link of document.querySelectorAll('.search-tabs a')){
    const kind=new URL(link.href).searchParams.get('type');
    if((!kinds.includes(selectedKind)&&!kind)||kind===selectedKind)link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
    const destination=new URL(link.href);
    if(requestedLocation)destination.searchParams.set('location',requestedLocation);
    if(maximumRent!==null)destination.searchParams.set('maxRent',String(maximumRent));
    link.href=destination.pathname+destination.search;
  }
}
if(isSearchPage){
  for(const link of document.querySelectorAll('.country-menu a,[data-country-switch]')){
    const destination=new URL(link.getAttribute('href'),location.origin);
    if(/^\/(lk|bn)\/search\/$/.test(destination.pathname)){
      if(kinds.includes(selectedKind))destination.searchParams.set('type',selectedKind);
      if(requestedLocation)destination.searchParams.set('location',requestedLocation);
      if(maximumRent!==null)destination.searchParams.set('maxRent',String(maximumRent));
      link.setAttribute('href',destination.pathname+destination.search);
    }
  }
}

const safePublicMediaURL=(entry,listingId,market)=>{
  if(!entry||typeof entry.url!=='string'||typeof listingId!=='string')return null;
  const listingPath='/api/public-listings/'+encodeURIComponent(listingId)+'/media/';
  let url;try{url=new URL(entry.url,apiOrigin);}catch{return null;}
  if(url.origin!==apiOrigin||!url.pathname.startsWith(listingPath))return null;
  const id=url.pathname.slice(listingPath.length);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return null;
  if(url.searchParams.get('country')!==market||[...url.searchParams.keys()].length!==1)return null;
  if(url.hash)return null;
  return url.href;
};

if(previewArea?.dataset.publicListingEnabled==='true'){
  const market=previewArea.dataset.publicListingMarket;
  if(market==='LK'||market==='BN'){
    // Once live browsing is selected, examples cannot substitute for real stock.
    const examples=document.querySelector('.results .cards:not([data-public-listing-cards])');
    if(examples)examples.hidden=true;
    const detailId=new URLSearchParams(location.search).get('id');
    const validDetailId=typeof detailId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(detailId);
    const endpoint=new URL('/api/public-listings'+(detailPage&&validDetailId?'/'+encodeURIComponent(detailId):''),apiOrigin);
    endpoint.searchParams.set('country',market);
    const render=items=>{
      const list=previewArea.querySelector('[data-public-listing-cards]');
      if(!list)return;
      list.replaceChildren();
      const heading=previewArea.querySelector('[data-public-listing-heading]');
      if(heading)heading.textContent=detailPage?'Property details':selectedKind&&kindLabels[selectedKind]?'Available '+kindLabels[selectedKind]:'Available registered rentals';
      const categoryMatches=item=>!kinds.includes(selectedKind)||(selectedKind==='commercial'?['commercial','retail','office'].includes(item.category):item.category===selectedKind);
      const inCategory=Array.isArray(items)?items.filter(item=>item?.country===market&&categoryMatches(item)):[];
      const visible=inCategory.filter(item=>(!locationQuery||[item.title,item.location].some(value=>typeof value==='string'&&value.toLocaleLowerCase().includes(locationQuery)))&&
        (maximumRent===null||(Number.isFinite(item.monthlyRent)&&item.monthlyRent>0&&item.monthlyRent<=maximumRent)));
      const filterStatus=document.querySelector('[data-rental-filter-status]');
      if(filterStatus)filterStatus.textContent=visible.length+' '+(visible.length===1?'property':'properties')+' matching your filters.';
      if(!visible.length){
        const msg=document.createElement('p');
        msg.textContent=isSearchPage&&(requestedLocation||maximumRent!==null)&&inCategory.length
          ?'No properties match these filters. Adjust or clear them to see more rentals.'
          :'No available registered rental properties are currently listed.';
        list.append(msg);
        previewArea.hidden=false;
        return;
      }
      for(const item of visible.slice(0,Math.min(50,Math.max(1,Number(previewArea.dataset.publicListingLimit)||50)))){
        if(item.country!==market||typeof item.title!=='string'||typeof item.id!=='string')continue;
        const article=document.createElement('article');
        article.className='listing';
        const imageEntry=Array.isArray(item.images)?item.images[0]:null;
        const imageURL=safePublicMediaURL(imageEntry,item.id,market);
        if(imageURL){
          const photo=document.createElement('img');
          photo.loading='lazy';
          photo.className='preview-photo';
          photo.alt=typeof imageEntry.alt==='string'&&imageEntry.alt.trim()
            ?imageEntry.alt.slice(0,180):'Rental property photograph';
          photo.src=imageURL;
          article.append(photo);
        }
        if(!imageURL){
          const placeholder=document.createElement('div');placeholder.className='media-placeholder';
          placeholder.textContent='Photograph not available yet';article.append(placeholder);
        }
        const panel=document.createElement('div');
        panel.className='listing-copy';
        const type=document.createElement('small');
        type.textContent=(kindLabels[item.category]||String(item.category||'rental')).toUpperCase();
        const title=document.createElement('h3');
        title.textContent=item.title;
        const loc=document.createElement('p');
        loc.textContent=item.location||'Location available on request';
        const price=document.createElement('p');
        price.className='rent';
        price.textContent=Number.isFinite(item.monthlyRent)&&item.monthlyRent>0
          ?new Intl.NumberFormat(market==='LK'?'en-LK':'en-BN',{
            style:'currency',currency:market==='LK'?'LKR':'BND',
            maximumFractionDigits:0}).format(item.monthlyRent)+' / month'
          :'Rent on request';
        panel.append(type,title,loc,price);
        if(!detailPage){
          const link=document.createElement('a');link.href='/'+market.toLowerCase()+'/property/?id='+encodeURIComponent(item.id);
          link.textContent='View property →';panel.append(link);
        }else{
          const note=document.createElement('p');
          note.textContent='You can browse without an account. Check enquiry availability for further steps.';
          panel.append(note);
          const controller=new AbortController();
          const timeout=setTimeout(()=>controller.abort(),10000);
          const status=new URL('/api/public-listings/'+encodeURIComponent(item.id)+'/enquiry-status',apiOrigin);
          status.searchParams.set('country',market);
          fetch(status,{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal})
            .then(async response=>response.ok?response.json():null)
            .then(result=>{
              if(result?.data?.enquiriesOpen!==true||!panel.isConnected){return;}
              const enquire=document.createElement('a');
              enquire.href=apiOrigin+'/enquire?listingId='+encodeURIComponent(item.id)+'&country='+market;
              enquire.textContent='Express your interest';panel.insertBefore(enquire,note);
              note.textContent='Sign in or create a free account to contact the owner. We’ll bring you back to this property. An enquiry does not reserve this property or confirm a viewing.';
            }).catch(()=>{}).finally(()=>clearTimeout(timeout));
        }
        article.append(panel);
        list.append(article);
      }
      previewArea.hidden=false;
      const examples=document.querySelector('.results .cards:not([data-public-listing-cards])');
      if(examples)examples.hidden=true;
    };
    previewArea.hidden=false;
    const loading=previewArea.querySelector('[data-public-listing-cards]');
    if(loading){loading.textContent='Loading available properties…';loading.setAttribute('aria-live','polite');}
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
    const feed=detailPage&&!validDetailId?Promise.reject(new Error('Choose a property from search')):fetch(endpoint.toString(),{
      method:'GET',mode:'cors',credentials:'omit',cache:'no-store',
      headers:{Accept:'application/json'},signal:controller.signal
    });
    feed.then(async response=>{
      if(!response.ok)throw new Error('Listing feed unavailable');
      const data=await response.json();
      if(detailPage){
        if(!data?.data||data.data.country!==market||data.data.id?.toLowerCase()!==detailId.toLowerCase())throw new Error('Property unavailable');
        render([data.data]);
      }else{
        if(!data||data.country!==market||!Array.isArray(data.data))throw new Error('Unexpected listing feed');
        render(data.data);
      }
    }).catch(()=>{
      // Fail closed; never substitute illustrative cards or private storage.
      const list=previewArea.querySelector('[data-public-listing-cards]');
      if(list){
        list.replaceChildren();
        const msg=document.createElement('p');
        msg.textContent=detailPage?'This property is unavailable or no longer publicly listed. Return to search for available properties.':'Rental listings are temporarily unavailable. Please try again.';
        list.append(msg);
      }
      previewArea.hidden=false;
    }).finally(()=>clearTimeout(timeout));
  }
}
