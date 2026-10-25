// Source-only responsive/browser smoke test for the unpublished R4 marketing preview.
// All requests are confined to a 127.0.0.1 ephemeral static server. No production URLs are visited.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer';
import {MARKETS, PAGE_TYPES, assertDraftReleaseBoundary} from '../marketing/r4-site-contract.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../marketing/r4-preview');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer((req,res)=>{
  const raw=new URL(req.url||'/', 'http://127.0.0.1').pathname;
  const decoded=decodeURIComponent(raw);
  const requested=path.resolve(root,'.'+decoded+(decoded.endsWith('/')?'index.html':''));
  if(!requested.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(!/\.(html|css)$/.test(requested)){res.writeHead(404);res.end();return;}
  try{
    const bytes=fs.readFileSync(requested);
    res.writeHead(200,{'Content-Type':mime[path.extname(requested)],'Cache-Control':'no-store'});
    res.end(bytes);
  }catch{res.writeHead(404);res.end();}
});
const listen=()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const close=()=>new Promise(resolve=>server.close(resolve));
function check(cond,msg){if(!cond)throw new Error(msg);}
let browser;
try{
  check(assertDraftReleaseBoundary()===true,'R4 release controls changed');
  await listen();
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
  const widths=[320,390,768,1280];
  const screenshots=new Set(['lk/home/390','lk/home/1280','bn/home/390','bn/search/390']);
  let passed=0;
  for(const market of Object.keys(MARKETS)){
    for(const [page,segment] of Object.entries(PAGE_TYPES)){
      const url=origin+'/'+market+'/'+(segment?segment+'/':'');
      for(const width of widths){
        const tab=await browser.newPage();
        const remote=[];
        tab.on('request',req=>{if(!req.url().startsWith(origin+'/'))remote.push(req.url().slice(0,160));});
        await tab.setViewport({width,height:900,deviceScaleFactor:1});
        const response=await tab.goto(url,{waitUntil:'networkidle0',timeout:12000});
        check(response?.status()===200,market+'/'+page+' '+width+' HTTP '+response?.status());
        const m=await tab.evaluate(()=>{
          const main=document.querySelector('main#main');
          const stylesheet=[...document.styleSheets].length;
          const el=document.documentElement;
          return {width:window.innerWidth,scrollWidth:el.scrollWidth,main:!!main,styleCount:stylesheet,
            robots:document.querySelector('meta[name="robots"]')?.content,
            draft:document.body.textContent.includes('UNPUBLISHED DESIGN DRAFT'),
            country:document.body.dataset.country,
            forms:document.querySelectorAll('form').length,
            liveEnabled:document.querySelectorAll('button:not([disabled])').length,
            overflow:el.scrollWidth>window.innerWidth+2,
            headingCount:document.querySelectorAll('h1').length,
            countryLabel:document.querySelector('.country summary')?.getAttribute('aria-label'),
            countryTargets:[...document.querySelectorAll('.country-menu a')].map(a=>({name:a.textContent.trim(),url:a.href})),
            helpLink:[...document.querySelectorAll('nav a[href*="#help"]')].length > 0,
            previewTabLabels:[...document.querySelectorAll('nav.search-tabs')].map(n=>n.getAttribute('aria-label')),
            linkPaths:[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>h&&!h.startsWith('https:')&&!h.startsWith('#'))
          };
        });
        check(m.main&&m.styleCount>=1&&m.robots==='noindex,nofollow'&&m.draft&&m.country===market.toUpperCase(),market+'/'+page+' '+width+' source metadata');
        check(!m.overflow,market+'/'+page+' '+width+' horizontal overflow '+m.scrollWidth+' > '+m.width);
        check(m.forms===0&&m.liveEnabled===0,market+'/'+page+' '+width+' unsafe interactive controls');
        check(m.headingCount===1&&m.helpLink,market+'/'+page+' '+width+' heading or help navigation');
        check(m.countryLabel?.includes(MARKETS[market].name),market+'/'+page+' '+width+' country chooser not accessible');
        const suffix=segment?segment+'/':'';
        for(const entry of m.countryTargets){
          const dest=new URL(entry.url);
          check(dest.pathname.endsWith('/'+suffix),market+'/'+page+' '+width+' country switch loses page context');
        }
        if(page==='search')check(m.previewTabLabels.every(x=>x?.includes('not filtered')),market+'/'+page+' '+width+' misleading filter semantics');
        check(remote.length===0,market+'/'+page+' '+width+' leaked external asset network request');
        for(const link of m.linkPaths){
          const destination=new URL(link,url);
          check(destination.origin===origin,market+'/'+page+' offsite relative route '+link);
          const destPath=path.resolve(root,'.'+decodeURIComponent(destination.pathname)+(destination.pathname.endsWith('/')?'index.html':''));
          check(destPath.startsWith(root+path.sep)&&fs.existsSync(destPath),market+'/'+page+' broken link '+link);
        }
        const key=market+'/'+page+'/'+width;
        if(screenshots.has(key)){
          fs.mkdirSync(path.resolve('artifacts/r4-browser'),{recursive:true});
          await tab.screenshot({path:path.resolve('artifacts/r4-browser/'+market+'-'+page+'-'+width+'.png'),fullPage:true});
        }
        if(width===390){
          await tab.keyboard.press('Tab');
          const firstFocus=await tab.evaluate(()=>document.activeElement?.className);
          check(firstFocus==='skip',market+'/'+page+' first keyboard focus must be skip link');
          const menu=await tab.$('.mobile-menu summary');
          check(!!menu,market+'/'+page+' missing mobile navigation');
          await menu.focus();
          await tab.keyboard.press('Enter');
          const expanded=await tab.$eval('.mobile-menu',el=>el.open);
          check(expanded,market+'/'+page+' keyboard mobile menu failed');
          await tab.keyboard.press('Escape');
          const select=await tab.$('.country summary');
          check(!!select,market+'/'+page+' country picker missing');
          await select.focus();
          await tab.keyboard.press('Enter');
          check(await tab.$eval('.country',el=>el.open),market+'/'+page+' keyboard country chooser failed');
        }
        await tab.close();
        passed++;
      }
    }
  }
  console.log('R4_BROWSER_SMOKE_PASS market_pages=10 viewports=4 checked='+passed+' screenshots=4 liveRequests=0');
}catch(error){
  console.error('R4_BROWSER_SMOKE_FAILED: '+error.message);
  process.exitCode=1;
}finally{
  if(browser)await browser.close();
  if(server.listening)await close();
}
