import test from 'node:test';
import assert from 'node:assert/strict';
import {previewFiles,renderR4Page} from '../marketing/r4-preview/build.mjs';
import {assertDraftReleaseBoundary} from '../marketing/r4-site-contract.mjs';

test('one template generates ten market/page combinations',()=>{assert.equal(assertDraftReleaseBoundary(),true);const files=previewFiles();assert.equal(files.length,10);assert.equal(new Set(files.map(f=>f.relativePath)).size,10);for(const f of files){assert.match(f.content,/noindex,nofollow/);assert.match(f.content,/UNPUBLISHED DESIGN DRAFT/);assert.match(f.content,/data-site="quixo-homes-marketing"/);assert.match(f.content,/https:\/\/app\.quixo\.homes\/login/);assert.doesNotMatch(f.content,/<form\b|action="\/api|checkout\.stripe\.com|<script\b/i);assert.match(f.content,/no live signup, property publication, enquiries or payments/);}});

test('country-specific rent monthly, correct locale/currency, no other market',()=>{for(const [m,lang,currency] of [['lk','en-LK','LKR'],['bn','en-BN','BND']]){for(const file of previewFiles().filter(f=>f.relativePath.startsWith(m+'/'))){assert.match(file.content,new RegExp('lang="'+lang+'"'));assert.match(file.content,new RegExp('data-country="'+m.toUpperCase()+'"'));assert.match(file.content,new RegExp(currency));assert.match(file.content,/\/ month/);}}assert.throws(()=>renderR4Page('br','home'),/Unknown R4/);assert.throws(()=>renderR4Page('lk','checkout'),/Unknown R4/);});

test('live enquiry button is disabled; public listing cards are samples',()=>{const p=renderR4Page('lk','property');assert.match(p,/<button type="button" disabled>/);assert.match(p,/No data is collected, emailed or submitted/);assert.match(renderR4Page('bn','search'),/illustrative search results/);assert.match(renderR4Page('lk','home'),/None is a live listing/);});
