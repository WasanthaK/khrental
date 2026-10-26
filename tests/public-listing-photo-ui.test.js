import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import puppeteer from 'puppeteer';

test('photo UI prepares privately, requires preview and both attestations, then withdraws',async()=>{
  const bundle=await build({write:false,bundle:true,format:'iife',jsx:'automatic',
    define:{'process.env.NODE_ENV':'"production"','import.meta':'{}'},
    stdin:{resolveDir:path.resolve('.'),loader:'jsx',contents:`
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import PhotoReview from './src/components/properties/PropertyPhotoReview.jsx';
      window.calls=[];window.revoked=[];
      const photo=Uint8Array.from(atob(${JSON.stringify(fs.readFileSync('marketing/assets/hero-house.webp').toString('base64'))}),c=>c.charCodeAt(0));
      const originalRevoke=URL.revokeObjectURL;
      URL.revokeObjectURL=value=>{window.revoked.push(value);originalRevoke(value);};
      let prepared=[];
      const request=async(url,options={})=>{
        window.calls.push({url,...options});
        if(url.endsWith('/preview'))return new Blob([photo],{type:'image/webp'});
        if(url.endsWith('/prepare')){
          prepared=[{mediaId:'fixture-media',imageIndex:0,altText:options.body.altText,status:'withheld'}];return {};
        }
        if(url.endsWith('/review')){prepared[0].status='ready';return {};}
        if(url.endsWith('/withdraw')){prepared=[];return {storageDeletionSucceeded:false};}
        return {photos:[{imageIndex:0}],prepared:structuredClone(prepared),canPrepare:true,canReview:true};
      };
      const root=createRoot(document.getElementById('root'));
      window.mount=id=>root.render(<PhotoReview key={id} propertyId={id} request={request}/>);
      window.mount('property-a');
    `}});
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']});
  const server=await new Promise(resolve=>{
    const s=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div>');});
    s.listen(0,'127.0.0.1',()=>resolve(s));
  });
  try{
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.waitForSelector('#photo-selection');
    const button=async text=>page.evaluate(text=>{
      const target=[...document.querySelectorAll('button')].find(b=>b.textContent===text);
      if(!target)throw Error('Missing button: '+text);
      const disabled=target.disabled;target.click();return disabled;
    },text);
    assert.equal(await page.evaluate(()=>window.calls.some(c=>c.method==='POST')),false,'mount performs no photo write');
    await page.select('#photo-selection','0');
    await page.type('#photo-description','Living room');
    await button('Prepare private copy');
    await page.waitForFunction(()=>document.body.textContent.includes('Awaiting review'));
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Approve reviewed photo')),false);
    await button('Preview and review');
    await page.waitForSelector('img[src^="blob:"]');
    await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth>0);
    assert.equal(await button('Approve reviewed photo'),true);
    let boxes=await page.$$('input[type="checkbox"]');
    await boxes[0].click();
    assert.equal(await button('Approve reviewed photo'),true);
    await boxes[1].click();
    assert.equal(await button('Approve reviewed photo'),false);
    await page.waitForFunction(()=>document.body.textContent.includes('Photo approved.'));
    const calls=await page.evaluate(()=>window.calls);
    assert.deepEqual(calls.find(c=>c.url.endsWith('/review')).body,{confirmRights:true,confirmPrivacy:true});
    assert.ok(calls.find(c=>c.url.endsWith('/preview')).responseType==='blob');
    assert.ok(await page.evaluate(()=>window.revoked.length)>0,'approval clears private object URL');
    await button('Withdraw photo 1');
    await page.waitForFunction(()=>document.body.textContent.includes('Stored copy cleanup needs administrator attention.'));
    assert.equal(await page.evaluate(()=>document.body.textContent.includes('Awaiting review')),false);
    // Freshly prepared photo must never inherit approval or private preview.
    await button('Prepare private copy');
    await page.waitForFunction(()=>document.body.textContent.includes('Awaiting review'));
    await button('Preview and review');
    await page.waitForSelector('img[src^="blob:"]');
    await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth>0);
    boxes=await page.$$('input[type="checkbox"]');
    assert.equal(await boxes[0].evaluate(b=>b.checked),false);
    await boxes[0].click();
    const revoked=await page.evaluate(()=>window.revoked.length);
    await page.evaluate(()=>window.mount('property-b'));
    await page.waitForFunction(()=>window.calls.some(c=>c.url.includes('property-b')));
    assert.equal(await page.$('img[src^="blob:"]'),null);
    assert.ok(await page.evaluate(()=>window.revoked.length)>revoked,'context change revokes private preview');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
