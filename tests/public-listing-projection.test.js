import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationEligibility} from '../src/api/publicListings/eligibility.js';
import {toPublicDTO,parsePreferenceInput} from '../src/api/publicListings/contract.js';

test('available registered rentals appear by default',()=>{
 assert.equal(publicationEligibility({propertyStatus:'active',countryCode:'LK',propertyType:'house'}).eligible,true);
});
test('reserved, rented, or opted-out properties are excluded',()=>{
 for(const status of ['reserved','rented','maintenance'])assert.equal(publicationEligibility({propertyStatus:status,countryCode:'LK',propertyType:'house'}).eligible,false);
 assert.equal(publicationEligibility({propertyStatus:'available',countryCode:'LK',propertyType:'house',optedOut:true}).eligible,false);
});
test('a vacant unit can keep a partly rented apartment property visible',()=>{
 assert.equal(publicationEligibility({propertyStatus:'rented',countryCode:'LK',propertyType:'apartment',units:[{id:'1',status:'occupied'},{id:'2',status:'available'}]}).eligible,true);
});
test('public DTO strips private source fields',()=>{
 const row={public_id:'x',country_code:'LK',propertytype:'house',monthly_rent:25000,bank_account_number:'hidden',images:['private'],property_id:'private'};
 const result=toPublicDTO(row);
 assert.deepEqual(Object.keys(result),['id','country','category','title','location','monthlyRent','currency','images']);
 assert.deepEqual(result.images,[]);
});
test('opt-out setting cannot accept arbitrary source property fields',()=>{
 assert.deepEqual(parsePreferenceInput({optedOut:true}),{optedOut:true});
 assert.throws(()=>parsePreferenceInput({bank_account_number:'not-allowed'}),{code:'UNAPPROVED_PUBLIC_FIELD'});
});
