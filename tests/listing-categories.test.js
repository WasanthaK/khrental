import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LISTING_CATEGORIES,normalizeListingCategory,normalizePropertyRentalValues,publicListingCategory} from '../src/utils/listingCategories.js';
import {toPublicDTO} from '../src/api/publicListings/contract.js';
test('registration requires one of three explicit website categories',()=>{
  assert.deepEqual(LISTING_CATEGORIES.map(c=>c.code),['residential','retail','office']);
  for(const code of ['residential','retail','office'])assert.equal(normalizeListingCategory(' '+code.toUpperCase()+' '),code);
  for(const value of [null,'','commercial','land',[],{},'tenant_id'])assert.throws(()=>normalizeListingCategory(value),{status:400});
  assert.throws(()=>normalizePropertyRentalValues({rent:1},{requireCategory:true}),{code:'PROPERTY_LISTING_CATEGORY_REQUIRED'});
  assert.deepEqual(normalizePropertyRentalValues('{"rent":1,"deposit":2,"listingCategory":"OFFICE"}',{requireCategory:true}),{rent:1,deposit:2,listingCategory:'office'});
  assert.deepEqual(normalizePropertyRentalValues({rent:3}),{rent:3},'legacy rent-only updates can preserve existing metadata');
});
test('public projection exports category only, keeps markets/private fields separate',()=>{
  const row={public_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',country_code:'LK',propertytype:'commercial',monthly_rent:10,owner:'private',address:'private',listing_category:'office'};
  const dto=toPublicDTO(row);
  assert.equal(dto.category,'office');assert.equal(dto.title,'Office or workspace for rent');assert.equal(dto.currency,'LKR');
  assert.equal(dto.owner,undefined);assert.equal(dto.address,undefined);assert.equal(dto.listing_category,undefined);
  assert.equal(toPublicDTO({...row,listing_category:'retail'}).category,'retail');
  assert.equal(toPublicDTO({...row,opted_out:1}),null);
  assert.equal(publicListingCategory(null,'apartment'),'residential');
  assert.equal(publicListingCategory(null,'commercial'),'commercial','no invented legacy retail/office assignment');
  assert.equal(publicListingCategory(null,'land'),'land','existing land is not silently reclassified');
});
test('both server property creation and registration form enforce the classification',()=>{
  const server=fs.readFileSync('src/api/platform/router.js','utf8');
  assert.ok(server.includes('normalizePropertyRentalValues(row.rentalvalues,{requireCategory:true})'));
  assert.ok(server.includes("JSON_VALUE(rentalvalues,'$.listingCategory')"),'rent-only update preserves saved category');
  const form=fs.readFileSync('src/pages/PropertyForm.jsx','utf8');assert.ok(form.includes('Website category *'));
  assert.ok(form.includes('normalizeListingCategory(formData.rentalvalues.listingCategory)'));
});
