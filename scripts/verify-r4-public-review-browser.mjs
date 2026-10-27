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
    await page.setRequestInterception(true);
    page.on('request',r=>{
      if(r.url().startsWith(origin+'/'))return void r.continue();
      if(lkLive&&p==='/lk/search/'&&r.url()===apiOrigin+'/api/public-listings?country=LK'){
        catalogRequests++;
        return void r.respond({status:200,contentType:'application/json',
          headers:{'Access-Control-Allow-Origin':origin,'Cache-Control':'no-store','Vary':'Origin'},
          body:JSON.stringify({country:'LK',data:[{id:fixtureId,country:'LK',category:'residential',
            title:'Synthetic pilot rental',location:'Sri Lanka',monthlyRent:1,currency:'LKR',
            images:[{url:fixtureImage,alt:'Synthetic exterior'}]}]})});
      }
      if(lkLive&&p==='/lk/search/'&&r.url()===apiOrigin+fixtureImage)
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
    assert.ok(data.main&&data.logo&&data.liveWarnings,p+' structure/logo/disclaimer');
    assert.ok(data.scrollWidth<=width+2,p+' width '+width+' overflow '+data.scrollWidth);
    assert.ok(!data.forms&&!data.enabledButtons,p+' unsafe live actions');
    const expectedListingPanel=['/lk/','/bn/','/lk/search/','/bn/search/'].includes(p);
    assert.deepEqual(data.scripts,expectedListingPanel?['/assets/public-listing-client.mjs']:[],p+' only approved dormant read-only script');
    if(expectedListingPanel)assert.equal(data.livePanel,lkLive&&p==='/lk/search/'?'true':'false',p+' single-market release scope');
    if(lkLive&&p==='/lk/search/'){
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
    assert.ok(data.links.includes('https://app.quixo.homes/login'),p+' existing sign-in');
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
    if(lkLive&&from==='lk'){
      assert.equal(await tab.evaluate(()=>!document.querySelector('.results .cards:not([data-public-listing-cards])')||document.querySelector('.results .cards:not([data-public-listing-cards])').hidden),true,'API failure must not show example cards as real inventory');
      assert.ok(await tab.$eval('[data-public-listing-cards]',n=>n.textContent.includes('temporarily unavailable')),'Show a clear unavailable state');
    }
    await tab.goto(origin+targets.other,{waitUntil:'domcontentloaded'});
    assert.equal(await tab.$eval('body',node=>node.dataset.country),to.toUpperCase());
    await tab.close();
  }
  if(lkLive)for(const kind of ['residential','commercial']){
    const tab=await browser.newPage();
    await tab.setRequestInterception(true);
    tab.on('request',r=>{
      if(r.url().startsWith(origin+'/'))return void r.continue();
      if(r.url()===apiOrigin+'/api/public-listings?country=LK')
        return void r.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin},
          body:JSON.stringify({country:'LK',data:[{id:fixtureId,country:'LK',category:'residential',title:'Synthetic pilot rental',location:'Sri Lanka',monthlyRent:1,currency:'LKR',images:[]}]})});
      return void r.abort();
    });
    await tab.goto(origin+'/lk/search/?type='+kind,{waitUntil:'networkidle0'});
    assert.equal(await tab.$eval('[data-public-listing-cards] h3',n=>n.length),kind==='residential'?1:0,kind+' category filtering');
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
