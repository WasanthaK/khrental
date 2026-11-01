// Static-site and guarded live-client smoke test. Localhost with synthetic API interception only.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../marketing');
const sitePaths=['/',...['lk','bn'].flatMap(c=>['', 'search/','property/','owners/','how-it-works/'].map(x=>'/'+c+'/'+x))];
const types={'.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.txt':'text/plain','.webp':'image/webp','.ico':'image/x-icon','.mjs':'text/javascript'};
const app=http.createServer((req,res)=>{
  try{
    const u=new URL(req.url,'http://127.0.0.1'),suffix=decodeURIComponent(u.pathname);
    const file=path.resolve(base,'.'+suffix+(suffix.endsWith('/')?'index.html':''));
    if(!file.startsWith(base+path.sep)||!/\.(html|css|svg|txt|webp|ico|mjs)$/.test(file)) {res.writeHead(404);return res.end();}
    const content=fs.readFileSync(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]});res.end(content);
  }catch{res.writeHead(404);res.end();}
});
const lkLive=fs.readFileSync(path.join(base,'lk/search/index.html'),'utf8').includes('data-public-listing-enabled="true"');
const bnLive=fs.readFileSync(path.join(base,'bn/search/index.html'),'utf8').includes('data-public-listing-enabled="true"');
const fixtureId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fixtureImage='/api/public-listings/'+fixtureId+'/media/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb?country=LK';
const apiOrigin='https://app.quixo.homes';
let browser,passes=0;
try{
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+app.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
  const imageNames=['hero-house','hero-commercial','residential-interior','residential-villa','commercial-office','commercial-retail'];
  const assetPage=await browser.newPage();
  const imageProbes=await assetPage.evaluate(async(baseUrl,names)=>{
    return await Promise.all(names.map(async name=>{
      const image=new Image();
      image.src=baseUrl+'/assets/'+name+'.webp';
      try{await image.decode();return {name,ok:image.naturalWidth>0,width:image.naturalWidth};}
      catch(e){return {name,ok:false,error:String(e)};}
    }));
  },origin,imageNames);
  await assetPage.close();
  console.log('QUIXO_R4_IMAGE_DECODING='+JSON.stringify(imageProbes));
  assert.deepEqual(imageProbes.filter(x=>!x.ok).map(x=>x.name),[],'All owner-approved sample photos must decode');
  for(const p of sitePaths)for(const width of [320,390,768,1280]){
    const page=await browser.newPage(),remote=[],failedResources=[];
    let catalogRequests=0;
    const liveMarket=['/lk/','/lk/search/'].includes(p)&&lkLive?'LK':['/bn/','/bn/search/'].includes(p)&&bnLive?'BN':null;
    await page.setRequestInterception(true);
    page.on('request',r=>{
      if(r.url().startsWith(origin+'/'))return void r.continue();
      if(liveMarket&&r.url()===apiOrigin+'/api/public-listings?country='+liveMarket){
        catalogRequests++;
        return void r.respond({status:200,contentType:'application/json',
          headers:{'Access-Control-Allow-Origin':origin,'Cache-Control':'no-store','Vary':'Origin'},
          body:JSON.stringify({country:liveMarket,data:[{id:fixtureId,country:liveMarket,category:'residential',
            title:'Synthetic pilot rental',location:'Sri Lanka',monthlyRent:1,currency:'LKR',
            images:[{url:fixtureImage.replace('country=LK','country='+liveMarket),alt:'Synthetic exterior'}]}]})});
      }
      if(liveMarket&&r.url()===apiOrigin+fixtureImage.replace('country=LK','country='+liveMarket))
        return void r.respond({status:200,contentType:'image/webp',body:fs.readFileSync(path.join(base,'assets/hero-house.webp'))});
      remote.push(r.url());return void r.abort();
    });
    page.on('response',r=>{if(r.url().startsWith(origin+'/')&&r.status()>=400)failedResources.push(r.url()+' '+r.status())});
    page.on('requestfailed',r=>failedResources.push(r.url()+' '+r.failure()?.errorText));
    await page.setViewport({width,height:900,deviceScaleFactor:1});
    const response=await page.goto(origin+p,{waitUntil:'networkidle0',timeout:15000});
    assert.equal(response.status(),200,p+' '+width+' HTTP');
    // Force below-fold lazy imagery to load before asserting its decoded dimensions.
    await page.evaluate(async()=>{await Promise.all([...document.images].map(async img=>{img.loading='eager';await img.decode();}));});
    const data=await page.evaluate(()=>({
      site:document.body.dataset.site,
      robots:document.querySelector('meta[name="robots"]')?.content,
      h1:document.querySelectorAll('h1').length,
      main:!!document.querySelector('main#main'),
      logo:document.querySelector('.approved-wordmark')?.getAttribute('src'),
      scrollWidth:document.documentElement.scrollWidth,
      links:[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')),
      forms:document.querySelectorAll('form').length,
      scripts:[...document.querySelectorAll('script')].map(x=>x.getAttribute('src')), 
      livePanel:document.querySelector('[data-public-listing-market]')?.dataset.publicListingEnabled,
      liveTitles:[...document.querySelectorAll('[data-public-listing-cards] h3')].map(n=>n.textContent),
      examplesHidden:!document.querySelector('.results .cards:not([data-public-listing-cards])')||document.querySelector('.results .cards:not([data-public-listing-cards])').hidden,
      enabledButtons:document.querySelectorAll('button:not([disabled])').length,
      liveWarnings:document.body.textContent.includes('UNPUBLISHED DESIGN DRAFT')||document.body.textContent.includes('PUBLIC DESIGN REVIEW')||document.body.textContent.includes('LIMITED PUBLIC PILOT'),
      photos:[...document.querySelectorAll('img.preview-photo,img.approved-wordmark,img[src$=".webp"]')].map(i=>({src:i.getAttribute('src'),width:i.naturalWidth,loaded:i.complete})),
      photoStyles:[...document.querySelectorAll('.hero,.home-hero,.review-market-card,.category-grid a,.owner-hero')].map(n=>getComputedStyle(n).backgroundImage).filter(s=>s.includes('.webp'))
    }));
    assert.equal(data.site,'quixo-homes-marketing',p);
    assert.equal(data.robots,'noindex,nofollow',p);
    assert.equal(data.h1,1,p+' needs exactly one h1');
    assert.ok(data.main&&data.logo,p+' structure/logo');
    assert.equal(data.liveWarnings,false,p+' no obsolete pilot restriction');
    assert.doesNotMatch(await page.$eval('body',e=>e.innerText),/Owner self-registration is not open|New customer onboarding is not yet open|New owner registration is not open/);
    if(p.endsWith('/owners/')){
      const country=p.startsWith('/bn/')?'BN':'LK';
      assert.ok(data.links.includes('https://app.quixo.homes/owner-sign-up?country='+country),p+' working owner registration entry');
      if(width===390||width===1280){
        fs.mkdirSync('verification-browse-proof',{recursive:true});
        await page.screenshot({path:'verification-browse-proof/owner-marketing-'+country+'-'+width+'.png',fullPage:true});
      }
    }
    assert.ok(data.scrollWidth<=width+2,p+' width '+width+' overflow '+data.scrollWidth);
    if(p.endsWith('/search/')){
      assert.equal(data.forms,1,p+' search filters are a read-only catalog form');
      assert.equal(data.enabledButtons,1,p+' only apply-filters control is enabled');
    }else assert.ok(!data.forms&&!data.enabledButtons,p+' unsafe live actions');
    const expectedListingPanel=['/lk/','/bn/','/lk/search/','/bn/search/','/lk/property/','/bn/property/'].includes(p);
    assert.deepEqual(data.scripts,(expectedListingPanel||p==='/')?['/assets/public-listing-client.mjs']:[],p+' only approved dormant read-only script');
    if(expectedListingPanel)assert.equal(data.livePanel,(p.startsWith('/lk/')?lkLive:bnLive)?'true':'false',p+' live country pages');
    if(liveMarket){
      assert.equal(catalogRequests,1,'Exactly one anonymous catalog request');
      assert.deepEqual(data.liveTitles,['Synthetic pilot rental'],'Render only the synthetic approved API fixture');
      assert.equal(data.examplesHidden,true,'Illustrations are hidden from live search results');
    }else assert.equal(catalogRequests,0,'Dormant pages do not query inventory');
    if(p.endsWith('/search/')){
      const actual=await page.$eval('[data-country-filter]',n=>({
        selected:n.dataset.countryFilter,
        current:[...n.querySelectorAll('[aria-current="page"]')].map(a=>a.dataset.countrySwitch),
        markets:[...n.querySelectorAll('[data-country-switch]')].map(a=>a.dataset.countrySwitch)
      }));
      const market=p.startsWith('/lk/')?'LK':'BN';
      assert.equal(actual.selected,market,p+' search country marker');
      assert.deepEqual(actual.current,[market],p+' only the chosen country is selected');
      assert.deepEqual(actual.markets,['LK','BN'],p+' both market choices available');
    }
    const signInUrl=p.endsWith('/owners/')
      ?'https://app.quixo.homes/login?ownerCountry='+(p.startsWith('/lk/')?'LK':'BN')
      :'https://app.quixo.homes/login';
    assert.ok(data.links.includes(signInUrl),p+' existing sign-in preserves page purpose');
    if(p.endsWith('/owners/')){assert.ok(!data.links.includes('https://app.quixo.homes/login'),p+' owner links retain their purpose');}
    assert.equal(remote.length,0,p+' external network requests');
    assert.equal(failedResources.length,0,p+' failed assets: '+failedResources.join('; '));
    for(const photo of data.photos)assert.ok(photo.loaded&&photo.width>0,p+' non-decodable image '+photo.src);
    if(p==='/'||p.endsWith('/search/')||p.endsWith('/property/'))assert.ok(data.photos.length>=1,p+' expected photographic preview cards');
    if(p==='/'||p==='/lk/'||p==='/bn/')assert.ok(data.photoStyles.length>=1,p+' expected photographic hero/category CSS');
    for(const l of data.links){
      if(l.startsWith('#')||l.startsWith('https://'))continue;
      const u=new URL(l,origin+p);
      assert.equal(u.origin,origin,p+' unexpected origin '+l);
      const file=path.resolve(base,'.'+u.pathname+(u.pathname.endsWith('/')?'index.html':''));
      assert.ok(file.startsWith(base+path.sep)&&fs.existsSync(file),p+' broken internal link '+l);
    }
    if(width===390){
      await page.keyboard.press('Tab');
      const focused=await page.evaluate(()=>document.activeElement?.className);
      assert.equal(focused,'skip',p+' first focus');
      const menu=await page.$('.mobile-menu summary');assert.ok(menu,p+' mobile menu');
      await menu.focus();await page.keyboard.press('Enter');
      assert.ok(await page.$eval('.mobile-menu',e=>e.open),p+' keyboard menu');
    }
    await page.close();passes++;
  }
  // Country changes retain the selected rental category, without carrying arbitrary query data.
  for(const [from,to] of [['lk','bn'],['bn','lk']]){
    const tab=await browser.newPage();
    await tab.setRequestInterception(true);
    tab.on('request',r=>r.url().startsWith(origin+'/')?void r.continue():void r.respond({
      status:503,contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin},body:'{}'}));
    await tab.goto(origin+'/'+from+'/search/?type=commercial&privateKey=never',{waitUntil:'networkidle0'});
    const targets=await tab.evaluate(()=>({
      explicit:document.querySelector('[data-country-switch="'+document.body.dataset.country+'"]')?.getAttribute('aria-current'),
      other:document.querySelector('[data-country-switch="'+(document.body.dataset.country==='LK'?'BN':'LK')+'"]')?.getAttribute('href'),
      header:[...document.querySelectorAll('.country-menu a')].find(a=>a.getAttribute('href')?.includes('/'+(document.body.dataset.country==='LK'?'bn':'lk')+'/search/'))?.getAttribute('href')
    }));
    assert.equal(targets.explicit,'page',from+' selected country');
    assert.equal(targets.other,'/'+to+'/search/?type=commercial',from+' category-preserving switch');
    assert.ok(targets.header?.includes('?type=commercial'),from+' header switch category');
    assert.ok(!targets.other.includes('privateKey'),from+' cross-market query privacy');
    if((lkLive&&from==='lk')||(bnLive&&from==='bn')){
      assert.equal(await tab.evaluate(()=>!document.querySelector('.results .cards:not([data-public-listing-cards])')||document.querySelector('.results .cards:not([data-public-listing-cards])').hidden),true,'API failure must not show example cards as real inventory');
      assert.ok(await tab.$eval('[data-public-listing-cards]',n=>n.textContent.includes('temporarily unavailable')),'Show a clear unavailable state');
    }
    await tab.goto(origin+targets.other,{waitUntil:'domcontentloaded'});
    assert.equal(await tab.$eval('body',node=>node.dataset.country),to.toUpperCase());
    await tab.close();
  }
  // UX-08: exercise public-only filtering, empty states, category/country
  // continuity, and rejection of unrecognized query keys using local fixtures.
  for(const market of ['LK','BN']){
    const tab=await browser.newPage();
    const categoryRows=[
      {id:fixtureId,country:market,category:'residential',title:'Waterfall home',location:'Kandy',monthlyRent:100000,images:[]},
      {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',country:market,category:'retail',title:'City shop',location:'Colombo',monthlyRent:250000,images:[]},
      {id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',country:market,category:'office',title:'River office',location:'Kandy',monthlyRent:180000,images:[]}
    ];
    await tab.setRequestInterception(true);
    let requests=0;
    tab.on('request',request=>{
      if(request.url().startsWith(origin+'/'))return void request.continue();
      if(request.url()===apiOrigin+'/api/public-listings?country='+market){
        requests++;
        return void request.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin},
          body:JSON.stringify({country:market,data:categoryRows})});
      }
      return void request.abort();
    });
    const country=market.toLowerCase();
    const path='/'+country+'/search/';
    await tab.goto(origin+path+'?type=commercial&location=Kandy&maxRent=200000&privateToken=discard',{waitUntil:'networkidle0'});
    assert.deepEqual(await tab.$$eval('[data-public-listing-cards] h3',els=>els.map(e=>e.textContent)),['River office'],'UX-08 combined commercial/location/rent filters');
    assert.equal(await tab.$eval('[data-rental-filter-status]',e=>e.textContent),'1 property matching your filters.');
    assert.equal(await tab.$eval('[data-rental-filters] input[name=location]',e=>e.value),'Kandy');
    assert.equal(await tab.$eval('[data-rental-filters] input[name=maxRent]',e=>e.value),'200000');
    const otherMarket=market==='LK'?'BN':'LK';
    const switchTarget=await tab.$eval('[data-country-switch="'+otherMarket+'"]',e=>e.getAttribute('href'));
    assert.equal(switchTarget,'/'+otherMarket.toLowerCase()+'/search/?type=commercial&location=Kandy&maxRent=200000','country carries only allowed filters');
    assert.ok(!switchTarget.includes('privateToken'),'unknown filter never reaches another market');
    assert.equal(await tab.$eval('[data-clear-rental-filters]',e=>e.getAttribute('href')),path+'?type=commercial','clear retains category');
    await tab.goto(origin+path+'?type=residential&location=Neverhere',{waitUntil:'networkidle0'});
    assert.equal(await tab.$eval('[data-public-listing-cards]',e=>e.textContent.includes('No properties match these filters')),true,'filtered-empty state');
    await tab.goto(origin+path+'?type=residential',{waitUntil:'networkidle0'});
    await tab.$eval('[data-rental-filters] input[name=location]',e=>{e.value='Kandy'});
    await tab.$eval('[data-rental-filters] input[name=maxRent]',e=>{e.value='100000'});
    await Promise.all([tab.waitForNavigation({waitUntil:'networkidle0'}),tab.click('[data-rental-filters] button[type=submit]')]);
    assert.equal(new URL(tab.url()).searchParams.get('location'),'Kandy','filters submit location');
    assert.equal(new URL(tab.url()).searchParams.get('maxRent'),'100000','filters submit rent');
    assert.equal(new URL(tab.url()).searchParams.get('type'),'residential','filters submit keeps category');
    assert.deepEqual(await tab.$$eval('[data-public-listing-cards] h3',els=>els.map(e=>e.textContent)),['Waterfall home']);
    assert.equal(requests,4,'only one anonymous catalog request per page load');
    fs.mkdirSync('verification-browse-proof',{recursive:true});
    await tab.setViewport({width:390,height:844});
    assert.ok(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'UX-08 filters fit mobile');
    await tab.screenshot({path:'verification-browse-proof/search-filters-'+country+'-390.png',fullPage:true});
    await tab.setViewport({width:1280,height:900});
    await tab.screenshot({path:'verification-browse-proof/search-filters-'+country+'-1280.png',fullPage:true});
    await tab.close();
  }
  console.log('QUIXO_UX08_FILTERS=PASS countries=2 public_fields_only category_market_continuity empty_state mobile');
  // Exercise actual homepage links, three categories, broad commercial and detail.
  if(lkLive)for(const kind of ['residential','retail','office','commercial']){
    const tab=await browser.newPage();
    const rows=['residential','retail','office'].map((category,index)=>({
      id:index===0?fixtureId:index===1?'cccccccc-cccc-4ccc-8ccc-cccccccccccc':'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      country:'LK',category,title:'Synthetic '+category,location:'Sri Lanka',monthlyRent:1,currency:'LKR',images:[]}));
    await tab.setRequestInterception(true);
    tab.on('request',r=>{
      if(r.url().startsWith(origin+'/'))return void r.continue();
      const response=r.url()===apiOrigin+'/api/public-listings?country=LK'?{country:'LK',data:rows}:
        r.url()===apiOrigin+'/api/public-listings/'+fixtureId+'?country=LK'?{data:rows[0]}:
        r.url()===apiOrigin+'/api/public-listings/'+fixtureId+'/enquiry-status?country=LK'?{data:{enquiriesOpen:kind==='residential'}}:null;
      if(response)return void r.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin},body:JSON.stringify(response)});
      return void r.abort();
    });
    await tab.goto(origin+'/lk/',{waitUntil:'networkidle0'});
    const selector=kind==='residential'?'.category-grid a[href$="type=residential"]':kind==='commercial'?'.hero-search a[href$="type=commercial"]':'.category-grid a[href$="type='+kind+'"]';
    await Promise.all([tab.waitForNavigation({waitUntil:'networkidle0'}),tab.click(selector)]);
    assert.equal(new URL(tab.url()).searchParams.get('type'),kind,'Homepage category link target');
    assert.deepEqual(await tab.$$eval('[data-public-listing-cards] h3',n=>n.map(e=>e.textContent)),
      kind==='commercial'?['Synthetic retail','Synthetic office']:['Synthetic '+kind],kind+' category results');
    if(kind==='residential'){
      await Promise.all([tab.waitForNavigation({waitUntil:'networkidle0'}),tab.click('[data-public-listing-cards] a')]);
      assert.equal(new URL(tab.url()).searchParams.get('id'),fixtureId);
      assert.deepEqual(await tab.$$eval('[data-public-listing-cards] h3',n=>n.map(e=>e.textContent)),['Synthetic residential'],'Real property detail route');
      await tab.waitForSelector('a[href*="/enquire?listingId="]');
      assert.equal(await tab.$eval('a[href*="/enquire?listingId="]',n=>n.href),apiOrigin+'/enquire?listingId='+fixtureId+'&country=LK','Public release capability opens the selected property enquiry');
      assert.ok(await tab.$eval('[data-public-listing-cards]',n=>n.textContent.includes('does not reserve')),'Enquiry is not represented as a reservation');
      // Signup acknowledgement returns to useful public browsing. The marker
      // is only a reminder; it sends no credentialed or account-mutating request.
      await tab.goto(origin+'/lk/property/?id='+fixtureId+'&verification=pending',{waitUntil:'networkidle0'});
      await tab.waitForSelector('.verification-reminder');
      assert.equal(new URL(tab.url()).searchParams.has('verification'),false);
      const continueUrl=apiOrigin+'/enquire?listingId='+fixtureId+'&country=LK';
      assert.equal(await tab.$eval('.verification-reminder-continue',e=>e.href),continueUrl);
      const pending=await tab.evaluate(()=>sessionStorage.getItem('quixo.signup.pending'));
      assert.deepEqual(JSON.parse(pending),{intent:{listingId:fixtureId,country:'LK'}});
      fs.mkdirSync('verification-browse-proof',{recursive:true});
      await tab.setViewport({width:1280,height:900});
      await tab.screenshot({path:'verification-browse-proof/pending-property-desktop.png',fullPage:false});
      await tab.setViewport({width:390,height:844});
      assert.ok(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Pending banner fits mobile');
      await tab.screenshot({path:'verification-browse-proof/pending-property-mobile.png',fullPage:false});
      await tab.goto(origin+'/',{waitUntil:'networkidle0'});
      await tab.waitForSelector('.verification-reminder');
      assert.equal(await tab.$eval('.verification-reminder-continue',e=>e.href),continueUrl,'Browsing retains the original property');
      await tab.click('button[aria-label="Dismiss verification reminder"]');
      assert.equal(await tab.$('.verification-reminder'),null);
      assert.equal(await tab.evaluate(()=>sessionStorage.getItem('quixo.signup.pending')),null);
      await tab.goto(origin+'/?verification=verified&role=admin',{waitUntil:'networkidle0'});
      assert.equal(await tab.$('.verification-reminder'),null,'A query flag never establishes a verified account');
      await tab.evaluate(()=>sessionStorage.setItem('quixo.signup.pending',JSON.stringify({intent:{listingId:'javascript:bad',country:'LK'}})));
      await tab.reload({waitUntil:'networkidle0'});assert.equal(await tab.$('.verification-reminder'),null);
      await tab.evaluate(()=>sessionStorage.removeItem('quixo.signup.pending'));
      console.log('VERIFICATION_BROWSE_BANNER=PASS property_context continued_browsing mobile dismissal invalid_marker_no_auth');

    }
    await tab.close();
  }
  const logo=fs.readFileSync(path.join(base,'assets/quixo-homes-primary.svg'),'utf8');
  assert.ok(logo.includes('fill="#3B8DCC"')&&logo.includes('fill="#22C55E"'));
  for(const file of ['hero-house.webp','hero-commercial.webp','residential-interior.webp','residential-villa.webp','commercial-office.webp','commercial-retail.webp']){const bytes=fs.readFileSync(path.join(base,'assets',file));assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF',file+' header');assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP',file+' container');assert.equal(bytes.readUInt32LE(4)+8,bytes.length,file+' size');}
  const robots=fs.readFileSync(path.join(base,'robots.txt'),'utf8');
  assert.ok(robots.includes('Disallow: /'));
  console.log('QUIXO_R4_PUBLIC_REVIEW_BROWSER=PASS checked='+passes+' pages='+sitePaths.length+' viewports=4 liveActions=0 syntheticFeed='+lkLive);
}catch(e){console.error('QUIXO_R4_PUBLIC_REVIEW_BROWSER=FAIL '+e.stack);process.exitCode=1;
}finally{if(browser)await browser.close();if(app.listening)await new Promise(r=>app.close(r))}
