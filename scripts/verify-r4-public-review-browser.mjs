// Review-only site smoke test. Serves marketing/ on localhost; never visits production.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../marketing');
const sitePaths=['/',...['lk','bn'].flatMap(c=>['', 'search/','property/','owners/','how-it-works/'].map(x=>'/'+c+'/'+x))];
const types={'.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.txt':'text/plain','.webp':'image/webp','.ico':'image/x-icon'};
const app=http.createServer((req,res)=>{
  try{
    const u=new URL(req.url,'http://127.0.0.1'),suffix=decodeURIComponent(u.pathname);
    const file=path.resolve(base,'.'+suffix+(suffix.endsWith('/')?'index.html':''));
    if(!file.startsWith(base+path.sep)||!/\.(html|css|svg|txt|webp|ico)$/.test(file)) {res.writeHead(404);return res.end();}
    const content=fs.readFileSync(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]});res.end(content);
  }catch{res.writeHead(404);res.end();}
});
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
    page.on('request',r=>{if(!r.url().startsWith(origin+'/'))remote.push(r.url())});
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
      script:document.querySelectorAll('script').length,
      enabledButtons:document.querySelectorAll('button:not([disabled])').length,
      liveWarnings:document.body.textContent.includes('UNPUBLISHED DESIGN DRAFT')||document.body.textContent.includes('PUBLIC DESIGN REVIEW'),
      photos:[...document.querySelectorAll('img.preview-photo,img.approved-wordmark,img[src$=".webp"]')].map(i=>({src:i.getAttribute('src'),width:i.naturalWidth,loaded:i.complete})),
      photoStyles:[...document.querySelectorAll('.hero,.home-hero,.review-market-card,.category-grid a,.owner-hero')].map(n=>getComputedStyle(n).backgroundImage).filter(s=>s.includes('.webp'))
    }));
    assert.equal(data.site,'quixo-homes-marketing',p);
    assert.equal(data.robots,'noindex,nofollow',p);
    assert.equal(data.h1,1,p+' needs exactly one h1');
    assert.ok(data.main&&data.logo&&data.liveWarnings,p+' structure/logo/disclaimer');
    assert.ok(data.scrollWidth<=width+2,p+' width '+width+' overflow '+data.scrollWidth);
    assert.ok(!data.forms&&!data.script&&!data.enabledButtons,p+' unsafe live actions');
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
  const logo=fs.readFileSync(path.join(base,'assets/quixo-homes-primary.svg'),'utf8');
  assert.ok(logo.includes('fill="#3B8DCC"')&&logo.includes('fill="#22C55E"'));
  for(const file of ['hero-house.webp','hero-commercial.webp','residential-interior.webp','residential-villa.webp','commercial-office.webp','commercial-retail.webp']){const bytes=fs.readFileSync(path.join(base,'assets',file));assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF',file+' header');assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP',file+' container');assert.equal(bytes.readUInt32LE(4)+8,bytes.length,file+' size');}
  const robots=fs.readFileSync(path.join(base,'robots.txt'),'utf8');
  assert.ok(robots.includes('Disallow: /'));
  console.log('QUIXO_R4_PUBLIC_REVIEW_BROWSER=PASS checked='+passes+' pages='+sitePaths.length+' viewports=4 liveActions=0');
}catch(e){console.error('QUIXO_R4_PUBLIC_REVIEW_BROWSER=FAIL '+e.stack);process.exitCode=1;
}finally{if(browser)await browser.close();if(app.listening)await new Promise(r=>app.close(r))}
