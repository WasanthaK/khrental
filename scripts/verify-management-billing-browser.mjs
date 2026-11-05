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
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='End subscription at renewal').click());
   await page.waitForFunction(()=>document.body.innerText.includes('Fixture action: cancellation'));
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
