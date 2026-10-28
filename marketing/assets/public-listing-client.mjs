// Quixo.Homes read-only catalog display. No credentials and no private property fields.
// It is always dormant until the independent static-site review flag is enabled.
const apiOrigin='https://app.quixo.homes';
const previewArea=document.querySelector('[data-public-listing-market]');

const kinds=['residential','commercial','retail','office'];
const selectedKind=new URLSearchParams(location.search).get('type');
const kindLabels={residential:'houses & apartments',commercial:'commercial properties',retail:'shops & retail',office:'offices & workspaces'};
const detailPage=previewArea?.hasAttribute('data-public-listing-detail');
if(location.pathname.endsWith('/search/')){
  for(const link of document.querySelectorAll('.search-tabs a')){
    const kind=new URL(link.href).searchParams.get('type');
    if((!kinds.includes(selectedKind)&&!kind)||kind===selectedKind)link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
}
if(location.pathname.endsWith('/search/')&&kinds.includes(selectedKind)){
  for(const link of document.querySelectorAll('.country-menu a,[data-country-switch]')){
    const destination=new URL(link.getAttribute('href'),location.origin);
    if(/^\/(lk|bn)\/search\/$/.test(destination.pathname)){
      destination.searchParams.set('type',selectedKind);
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
      const visible=Array.isArray(items)?items.filter(item=>item?.country===market&&(!kinds.includes(selectedKind)||(selectedKind==='commercial'?['commercial','retail','office'].includes(item.category):item.category===selectedKind))):[];
      if(!visible.length){
        const msg=document.createElement('p');
        msg.textContent='No available registered rental properties are currently listed.';
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
          const note=document.createElement('p');note.textContent='Viewing requests and applications are not open yet. You can browse this property without creating an account.';panel.append(note);
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
