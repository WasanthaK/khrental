import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewFiles,renderR4Page} from '../marketing/r4-preview/build.mjs';
import {assertDraftReleaseBoundary, PAGE_TYPES} from '../marketing/r4-site-contract.mjs';

test('one approved shared contract generates ten byte-matched draft pages', () => {
  assert.equal(assertDraftReleaseBoundary(),true);
  const files=previewFiles();
  assert.equal(files.length,10);
  assert.equal(new Set(files.map(f=>f.relativePath)).size,10);
  for(const f of files){
    assert.equal(readFileSync(new URL('../marketing/r4-preview/'+f.relativePath,import.meta.url),'utf8'),f.content);
    assert.match(f.content,/noindex,nofollow/);
    assert.match(f.content,/UNPUBLISHED DESIGN DRAFT/);
    assert.match(f.content,/data-site="quixo-homes-marketing"/);
    assert.match(f.content,/https:\/\/app\.quixo\.homes\/login/);
    assert.doesNotMatch(f.content,/<form\b|action="\/api|checkout\.stripe\.com|<script\b/i);
    assert.match(f.content,/no live signup, property publication, enquiries or payments/);
  }
});

test('each market uses its correct locale, and every rental price is monthly', () => {
  for(const [m,lang,currency] of [['lk','en-LK','LKR'],['bn','en-BN','BND']]){
    for(const page of Object.keys(PAGE_TYPES)){
      const html=renderR4Page(m,page);
      assert.match(html,new RegExp('lang="'+lang+'"'));
      assert.match(html,new RegExp('data-country="'+m.toUpperCase()+'"'));
      if(['home','search','property'].includes(page)){
        assert.match(html,new RegExp(currency));
        assert.match(html,/\/ month/);
      }else{
        assert.doesNotMatch(html,/(?:LKR|BND)\s*[0-9]/);
      }
    }
  }
  assert.throws(()=>renderR4Page('br','home'),/Unknown R4/);
  assert.throws(()=>renderR4Page('lk','checkout'),/Unknown R4/);
});

test('link paths stay inside the draft country page structure',()=>{
  for(const page of Object.keys(PAGE_TYPES)){
    const html=renderR4Page('lk',page);
    const within=page==='home'?'./':'../';
    const root=page==='home'?'../':'../../';
    assert.ok(html.includes('href="'+root+'styles.css"'));
    assert.ok(html.includes('href="'+within+'search/?type=residential"'));
    const targetSuffix = PAGE_TYPES[page] ? PAGE_TYPES[page]+'/' : '';
    assert.ok(html.includes('href="'+root+'bn/'+targetSuffix+'"'), 'Country switch must preserve page '+page);
    assert.ok(html.includes('href="'+within+'how-it-works/#help"'));
    assert.match(html,/Choose country; current country: Sri Lanka/);
    assert.ok(html.includes('href="https://app.quixo.homes/login"'));
  }
});

test('viewing action is disabled; listing images are safe labeled placeholders',()=>{
  const property=renderR4Page('lk','property');
  assert.match(property,/<button type="button" disabled>/);
  assert.match(property,/No data is collected, emailed or submitted/);
  assert.match(property,/rights review pending/);
  const search=renderR4Page('bn','search');
  assert.match(search,/illustrative search results/);
  assert.match(search,/approval pending/);
  assert.match(renderR4Page('lk','home'),/None is a live listing/);
});
