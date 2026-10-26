// Quixo.Homes public catalog renderer. Pure read-only. Absolutely no credentials or source property fields.
// The page flag stays FALSE until the app SQL/schema, rate-limit and visibility acceptance gate is signed off.
// Country choice is explicit, never guessed from IP, browser locale or tenant data.
// When moving between country-specific search pages, preserve only a supported
// rental category; never carry any private URL/query parameters across markets.
if (location.pathname.endsWith('/search/')) {
  const kind=new URLSearchParams(location.search).get('type');
  if(kind==='residential'||kind==='commercial'){
    for(const link of document.querySelectorAll('.country-menu a,[data-country-switch]')){
      const destination=new URL(link.getAttribute('href'),location.origin);
      if(/^\/(lk|bn)\/search\/$/.test(destination.pathname)){
        destination.searchParams.set('type',kind);
        link.setAttribute('href',destination.pathname+destination.search);
      }
    }
  }
}

const apiOrigin='https://app.quixo.homes';
const previewArea=document.querySelector('[data-public-listing-market]');
if(previewArea && previewArea.dataset.publicListingEnabled==='true'){
  const market=previewArea.dataset.publicListingMarket;
  if(market==='LK'||market==='BN'){
    const endpoint=new URL('/api/public-listings',apiOrigin);
    endpoint.searchParams.set('country',market);
    const render=(items)=>{
      const list=previewArea.querySelector('[data-public-listing-cards]');
      if(!list)return;
      list.replaceChildren();
      const heading=previewArea.querySelector('[data-public-listing-heading]');
      if(heading)heading.textContent='Available registered rentals';
      if(!Array.isArray(items)||items.length===0){
        const msg=document.createElement('p');
        msg.textContent='No available registered rental properties are currently listed.';
        list.append(msg);previewArea.hidden=false;return;
      }
      for(const item of items.slice(0,50)){
        if(item.country!==market||typeof item.title!=='string'||typeof item.id!=='string')continue;
        const article=document.createElement('article');
        article.className='listing';
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
        price.textContent=Number.isFinite(item.monthlyRent) && item.monthlyRent>0
          ? new Intl.NumberFormat(market==='LK'?'en-LK':'en-BN',{style:'currency',currency:market==='LK'?'LKR':'BND',
            maximumFractionDigits:0}).format(item.monthlyRent)+' / month'
          :'Rent on request';
        panel.append(type,title,loc,price);
        // Property detail URLs remain disconnected until reviewed. Never use untrusted media URLs.
        article.append(panel);list.append(article);
      }
      previewArea.hidden=false;
      const examples=document.querySelector('.results .cards');
      if(examples)examples.hidden=true;
    };
    fetch(endpoint.toString(),{method:'GET',mode:'cors',credentials:'omit',cache:'no-store',
      headers:{Accept:'application/json'}})
      .then(async response=>{
        if(!response.ok)throw new Error('Listing feed unavailable');
        const data=await response.json();
        if(!data||data.country!==market||!Array.isArray(data.data))throw new Error('Unexpected listing feed');
        render(data.data);
      })
      .catch(()=>{
        // No automatic fallback to app-private storage, source SQL rows or fabricated inventory.
        // Existing illustrative design remains while listing release is disabled/unavailable.
      });
  }
}
