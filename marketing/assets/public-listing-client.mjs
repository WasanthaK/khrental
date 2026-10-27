// Quixo.Homes read-only catalog display. No credentials and no private property fields.
// It is always dormant until the independent static-site review flag is enabled.
const apiOrigin='https://app.quixo.homes';
const previewArea=document.querySelector('[data-public-listing-market]');

const selectedKind=new URLSearchParams(location.search).get('type');
if(location.pathname.endsWith('/search/')&&['residential','commercial'].includes(selectedKind)){
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
  const url=new URL(entry.url,apiOrigin);
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
    const examples=document.querySelector('.results .cards');
    if(examples)examples.hidden=true;
    const endpoint=new URL('/api/public-listings',apiOrigin);
    endpoint.searchParams.set('country',market);
    const render=items=>{
      const list=previewArea.querySelector('[data-public-listing-cards]');
      if(!list)return;
      list.replaceChildren();
      const heading=previewArea.querySelector('[data-public-listing-heading]');
      if(heading)heading.textContent='Available registered rentals';
      if(!Array.isArray(items)||!items.length){
        const msg=document.createElement('p');
        msg.textContent='No available registered rental properties are currently listed.';
        list.append(msg);
        previewArea.hidden=false;
        return;
      }
      for(const item of items.slice(0,50)){
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
        const panel=document.createElement('div');
        panel.className='listing-copy';
        const type=document.createElement('small');
        type.textContent=String(item.category||'rental').toUpperCase();
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
        article.append(panel);
        list.append(article);
      }
      previewArea.hidden=false;
      const examples=document.querySelector('.results .cards');
      if(examples)examples.hidden=true;
    };
    fetch(endpoint.toString(),{
      method:'GET',mode:'cors',credentials:'omit',cache:'no-store',
      headers:{Accept:'application/json'}
    }).then(async response=>{
      if(!response.ok)throw new Error('Listing feed unavailable');
      const data=await response.json();
      if(!data||data.country!==market||!Array.isArray(data.data))throw new Error('Unexpected listing feed');
      render(data.data);
    }).catch(()=>{
      // Fail closed; never substitute illustrative cards or private storage.
      const list=previewArea.querySelector('[data-public-listing-cards]');
      if(list){
        list.replaceChildren();
        const msg=document.createElement('p');
        msg.textContent='Rental listings are temporarily unavailable. Please try again.';
        list.append(msg);
      }
      previewArea.hidden=false;
    });
  }
}
