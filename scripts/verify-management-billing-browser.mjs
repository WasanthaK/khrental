import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const output=process.env.BILLING_SCREENSHOT_DIR || '/tmp/khrental-management-billing-screens';
const vite=await createServer({root:process.cwd(),configFile:false,logLevel:'error',plugins:[react()],
 optimizeDeps:{entries:['tests/fixtures/management-billing/index.html']},server:{host:'127.0.0.1',port:0,strictPort:false}});
let browser;
try{
 await vite.listen();const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox']});
 fs.mkdirSync(output,{recursive:true});
 for(const screen of ['pricing','subscription','complimentary'])for(const width of [390,1440]){
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewport({width,height:1050});await page.setRequestInterception(true);
  page.on('request',request=>new URL(request.url()).hostname==='127.0.0.1'?request.continue():request.abort());
  await page.goto(`${origin}/tests/fixtures/management-billing/index.html?screen=${screen}`,{waitUntil:'networkidle2'});
  await page.waitForSelector('h1');
  assert.equal(await page.$eval('h1',el=>el.textContent),({pricing:'Management pricing',subscription:'Management subscription',complimentary:'Management access'})[screen]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${screen} must not overflow at ${width}`);
  if(screen==='pricing'){
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Preview price').click());
   await page.waitForFunction(()=>document.body.innerText.includes('$60.00'));
   await page.select('select','BN');
   await page.waitForFunction(()=>document.body.innerText.includes('Included monthly rent (BND)'));
   assert.equal(await page.evaluate(()=>document.body.innerText.includes('$60.00')),true,'The isolated view displays supplied preview state; controller resets it in the application.');
  }else if(screen==='subscription'){
   assert.equal(await page.$('#scheduled-quantity-title'),null,'No scheduled reduction without a pending quantity');
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='End subscription at renewal').click());
   await page.waitForFunction(()=>document.body.innerText.includes('Fixture action: cancellation'));
   for(const scenario of ['pending','missing-date','invalid-date','applied','cancelled']){
    await page.goto(`${origin}/tests/fixtures/management-billing/index.html?screen=subscription&scenario=${scenario}`,{waitUntil:'networkidle2'});
    const scheduled=await page.$('section[aria-labelledby="scheduled-quantity-title"]');
    if(['applied','cancelled'].includes(scenario)){
     assert.equal(scheduled,null,`${scenario} does not promise a future reduction`);
    }else{
     assert.ok(scheduled);
     const text=await scheduled.evaluate(n=>n.innerText);
     assert.match(text,/from 2 to 1 at your next renewal/);
     assert.match(text,/current period remains billed for 2 dwellings/);
     assert.match(text,/No current-period refund/);
     if(scenario==='pending')assert.match(text,/6 December 2026 \(UTC\)/);
     else assert.match(text,/renewal date is not available yet/);
     await page.reload({waitUntil:'networkidle2'});
     assert.ok(await page.$('#scheduled-quantity-title'),'Pending reduction survives reload');
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.screenshot({path:path.join(output,`subscription-${scenario}-${width}.png`),fullPage:true});
   }
   for(const scenario of ['zero-preview','zero-ending','interrupted-cancellation','staged-stock']){
    await page.goto(`${origin}/tests/fixtures/management-billing/index.html?screen=subscription&scenario=${scenario}`,{waitUntil:'networkidle2'});
    if(scenario==='zero-preview'){
     const confirm=await page.waitForSelector('button');
     assert.ok(confirm);
     const text=await page.$eval('body',el=>el.innerText);
     assert.match(text,/no managed dwellings/);assert.match(text,/current period remains billed with no refund/);
     assert.match(text,/Historical records and renter access are preserved/);
     await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm sandbox cancellation at renewal').click());
     await page.waitForFunction(()=>document.body.innerText.includes('Fixture action: quantity-apply'));
    }else if(scenario==='staged-stock'){
     assert.match(await page.$eval('body',el=>el.innerText),/stays private and unavailable for tenancy until billing is confirmed/);
     assert.match(await page.$eval('body',el=>el.innerText),/Awaiting billing confirmation/);
     await page.type('input[maxlength="255"]','Second prepared home');
     await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Prepare dwelling').focus());
     await page.keyboard.press('Enter');
     await page.waitForFunction(()=>document.body.innerText.includes('Fixture action: stock/prepare'));
     await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Withdraw prepared additions').focus());
     await page.keyboard.press('Enter');
     await page.waitForFunction(()=>document.body.innerText.includes('Fixture action: stock/withdraw'));
    }else if(scenario==='interrupted-cancellation'){
     assert.match(await page.$eval('body',el=>el.innerText),/This check does not repeat the change/);
     await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Check cancellation result').focus());
     await page.keyboard.press('Enter');
     await page.waitForFunction(()=>document.body.innerText.includes('Fixture action: reconcile-cancellation'));
    }else{
     assert.match(await page.$eval('body',el=>el.innerText),/Add managed dwellings before choosing to renew again/);
     assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Keep subscription renewing')),false);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.screenshot({path:path.join(output,`subscription-${scenario}-${width}.png`),fullPage:true});
   }
  }else{
   const selects=await page.$$('select');
   await selects[1].select('revoke');
   assert.equal(await page.$('input[type="datetime-local"]'),null,'Revocation does not require an expiry');
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Revoke complimentary access').click());
   await page.waitForFunction(()=>document.body.innerText.includes('Fixture access saved: revoke'));
   await selects[1].select('fixed');
   assert.ok(await page.$('input[type="datetime-local"]'),'Fixed-term access visibly requires an expiry');
  }
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(output,`${screen}-${width}.png`),fullPage:true});
  await page.close();console.log(`PASS: rendered ${screen} at ${width}px, no page error or viewport overflow`);
 }
}finally{await browser?.close();await vite.close();}
