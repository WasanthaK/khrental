// Real anonymous production browsing only. No credentials, account writes,
// inquiry submissions, signature, deposit, tenancy or payment actions.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';
const market='https://quixo.homes';
const app='https://app.quixo.homes';
const widths=[1280,390];
const label='LIVE_PUBLIC_BROWSER';
let browser;
try{
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  await fs.mkdir('live-public-browser-proof',{recursive:true});
  for(const width of widths){
    const context=await browser.createBrowserContext();
    const page=await context.newPage();
    await page.setViewport({width,height:900,deviceScaleFactor:1});
    await page.setRequestInterception(true);
    const rejects=[];
    const catalogObservations=[];
    const catalogPath='/api/public-listings?country=LK';
    page.on('response',response=>{
      const url=new URL(response.url());
      if(url.origin===app&&url.pathname==='/api/public-listings'){
        catalogObservations.push({status:response.status(),path:url.pathname,market:url.searchParams.get('country')});
      }
    });
    page.on('requestfailed',request=>{
      if(request.url().startsWith(app+'/api/public-listings')){
        catalogObservations.push({failure:request.failure()?.errorText||'unknown',path:'/api/public-listings'});
      }
    });
    page.on('pageerror',error=>catalogObservations.push({scriptError:String(error.message||'script error').slice(0,120)}));
    page.on('request',r=>{
      // The only external destinations expected for anonymous catalog browsing.
      // GET-only guard prevents accidental customer action or credential replay.
      const url=new URL(r.url());
      if(r.method()!=='GET'||![market,app,'data:'].some(origin=>r.url().startsWith(origin))){
        rejects.push({method:r.method(),host:url.host});
        return void r.abort();
      }
      r.continue();
    });
    page.setDefaultTimeout(20000);
    const url=market+'/lk/search/?type=residential';
    const response=await page.goto(url,{waitUntil:'networkidle2',timeout:45000});
    assert.equal(response.status(),200,'Live LK rental search');
    await page.waitForFunction(()=>{
      const area=document.querySelector('[data-public-listing-cards]');
      return !!area&&(!!area.querySelector('article.listing')||
        (!area.textContent.includes('Loading available properties')&&area.textContent.trim().length>0));
    },{timeout:22000});
    const before=await page.$$eval('[data-public-listing-cards] article.listing',cards=>cards.length);
    if(!before){
      await page.screenshot({path:'live-public-browser-proof/lk-missing-inventory-'+width+'.png',fullPage:true});
      console.log('PUBLIC_BROWSER_LISTINGS_BLOCKED viewport='+width+
        ' visibleState='+JSON.stringify((await page.$eval('[data-public-listing-cards]',n=>n.textContent)).slice(0,120))+
        ' catalogNetwork='+JSON.stringify(catalogObservations));
    }
    assert.ok(before>0,'Expected at least one real residential listing in LK');
    assert.ok(await page.$('input[name=location]')&&await page.$('input[name=maxRent]'),'UX-08 inputs are live');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'No horizontal overflow');
    await page.screenshot({path:'live-public-browser-proof/lk-search-'+width+'.png',fullPage:true});
    const detailHref=await page.$eval('[data-public-listing-cards] article.listing a',a=>a.getAttribute('href'));
    assert.ok(/^\/lk\/property\/\?id=[0-9a-f-]+$/i.test(detailHref),'First card opens public property');
    await page.type('input[name=location]','NoSuchLocation99999');
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle2'}),page.click('[data-rental-filters] button[type=submit]')]);
    const after=await page.$$eval('[data-public-listing-cards] article.listing',cards=>cards.length);
    assert.equal(after,0,'Non-matching location filters all cards');
    assert.match(await page.$eval('[data-public-listing-cards]',n=>n.innerText),/No properties match these filters/,'Clear no-results state');
    await page.screenshot({path:'live-public-browser-proof/lk-no-results-'+width+'.png',fullPage:true});
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle2'}),page.click('[data-clear-rental-filters]')]);
    assert.ok(await page.$$eval('[data-public-listing-cards] article.listing',cards=>cards.length)>0,'Clear restores catalog');
    const detail=await page.goto(market+detailHref,{waitUntil:'networkidle2',timeout:45000});
    assert.equal(detail.status(),200,'Selected public property detail');
    await page.waitForFunction(()=>!!document.querySelector('[data-public-listing-cards] .listing'),{timeout:22000});
    const title=await page.$eval('[data-public-listing-cards] h3',e=>e.textContent);
    assert.ok(title.trim().length>0,'Public property detail has name');
    await page.waitForSelector('a[href*="/enquire?listingId="]',{timeout:12000});
    const enquiryHref=await page.$eval('a[href*="/enquire?listingId="]',a=>a.href);
    if(enquiryHref){
      const intent=new URL(enquiryHref);
      assert.equal(intent.origin,app,'Enquiry opens authenticated app');
      assert.equal(intent.searchParams.get('country'),'LK','Selected market retained');
      assert.ok(/^[0-9a-f-]{36}$/i.test(intent.searchParams.get('listingId')),'Selected listing reference retained');
    }
    await page.screenshot({path:'live-public-browser-proof/lk-detail-'+width+'.png',fullPage:true});
    // The actual public-to-app transition must retain this exact property
    // even for an anonymous visitor. No message or account action is sent.
    const intent=new URL(enquiryHref);
    const selectedListing=intent.searchParams.get('listingId');
    const handoff=await page.goto(enquiryHref,{waitUntil:'networkidle2',timeout:45000});
    assert.equal(handoff.status(),200,'Enquiry app page responds');
    await page.waitForFunction(()=>{
      const body=document.body.innerText;
      return body.includes('Sign in to contact the owner')||
        body.includes('Your selected property')||
        body.includes('Property unavailable')||
        body.includes('Property enquiries are not open yet');
    },{timeout:25000});
    const handoffState=await page.evaluate(()=>({
      href:location.href,
      text:document.body.innerText.slice(0,2200),
      selectedTitle:document.querySelector('.enquiry-property-copy h2')?.textContent||'',
      login:document.querySelector('a[href^="/login?"]')?.getAttribute('href')||'',
      signup:document.querySelector('a[href^="/seeker-sign-up?"]')?.getAttribute('href')||'',
      image:!!document.querySelector('.enquiry-photo')
    }));
    await page.screenshot({path:'live-public-browser-proof/lk-enquiry-handoff-'+width+'.png',fullPage:true});
    assert.ok(handoffState.text.includes('Your selected property'),'Selected property shown after public-to-app transition');
    assert.equal(handoffState.selectedTitle,title,'Selected property title is unchanged');
    assert.ok(handoffState.text.includes('Sign in to contact the owner'),'Anonymous enquiry prompts sign-in');
    for(const link of [handoffState.login,handoffState.signup]){
      const target=new URL(link,app);
      assert.equal(target.searchParams.get('listingId')?.toLowerCase(),selectedListing.toLowerCase(),'Auth link retains selected listing');
      assert.equal(target.searchParams.get('country'),'LK','Auth link retains selected country');
    }
    assert.equal(await page.$('button.enquiry-send'),null,'Anonymous visitor cannot send an enquiry');
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle2'}),page.click('a[href^="/login?"]')]);
    assert.equal(new URL(page.url()).searchParams.get('listingId')?.toLowerCase(),selectedListing.toLowerCase(),'Login route retains property');
    assert.equal(new URL(page.url()).searchParams.get('country'),'LK','Login route retains country');
    assert.ok(await page.$('#email-address'),'Login form is available');
    await page.screenshot({path:'live-public-browser-proof/lk-selected-login-'+width+'.png',fullPage:true});
    assert.deepEqual(rejects,[],'No private/mutating requests');
    console.log(label+'=PASS viewport='+width+' initialCards='+before+' filteredEmpty=true restored=true propertyDetail=true enquiryLink=available selectedLogin=PASS');
    await context.close();
  }
}finally{await browser?.close();}
