import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationEligibility,parseCountry,PUBLIC_LISTING_ENABLED,PUBLIC_TYPES} from '../src/api/publicListings/eligibility.js';
const base={propertyStatus:'active',countryCode:'LK',propertyType:'house'};
test('registered available property is public by default',()=>{
  assert.equal(publicationEligibility(base).eligible,true);
  assert.equal(publicationEligibility({...base,propertyStatus:'available'}).eligible,true);
  assert.equal(publicationEligibility({...base,countryCode:'BN'}).eligible,true);
});
test('rented, reserved, maintenance and inactive are hidden without separate approval',()=>{
  for(const status of ['rented','reserved','maintenance','inactive','occupied']){
    const x=publicationEligibility({...base,propertyStatus:status});
    assert.equal(x.eligible,false,status);
  }
});
test('opted out overrides all availability, including later returning to available',()=>{
  assert.equal(publicationEligibility({...base,optedOut:true}).reason,'owner_opted_out');
  assert.equal(publicationEligibility({...base,propertyStatus:'rented',optedOut:true}).reason,'owner_opted_out');
  assert.equal(publicationEligibility({...base,propertyStatus:'available',optedOut:true}).eligible,false);
  assert.equal(publicationEligibility({...base,optedOut:false}).eligible,true);
});
test('apartment building stays visible when one unit free, even if parent is rented',()=>{
  const units=[{id:'u1',status:'occupied'},{id:'u2',status:'available'}];
  assert.equal(publicationEligibility({...base,propertyType:'apartment',propertyStatus:'rented',units}).eligible,true);
  assert.equal(publicationEligibility({...base,propertyType:'apartment',propertyStatus:'rented',units,activeUnitIds:['u2']}).eligible,false);
  assert.equal(publicationEligibility({...base,propertyType:'apartment',units:units.map(u=>({...u,status:'reserved'}))}).eligible,false);
  assert.equal(publicationEligibility({...base,propertyType:'apartment',propertyStatus:'reserved',units}).eligible,false);
});
test('active whole-property agreement hides a listing even if status is stale',()=>{
  assert.equal(publicationEligibility({...base,hasActiveWholePropertyAgreement:true}).eligible,false);
});
test('unclassified market and unsupported type require metadata, not false market guesses',()=>{
  assert.equal(publicationEligibility({...base,countryCode:null}).reason,'public_country_missing');
  assert.equal(publicationEligibility({...base,propertyType:'land'}).category,'land');
  assert.equal(publicationEligibility({...base,propertyType:'unrecognized'}).category,'other');
  assert.equal(parseCountry('lk'),'LK');
  assert.equal(parseCountry('XX'),null);
  assert.equal(PUBLIC_TYPES.commercial,'commercial');
});
test('public read remains off until two independent launch gates pass',()=>{
  assert.equal(PUBLIC_LISTING_ENABLED({}),false);
  assert.equal(PUBLIC_LISTING_ENABLED({PUBLIC_LISTING_READ_ENABLED:'true'}),false);
  assert.equal(PUBLIC_LISTING_ENABLED({PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true'}),false);
  assert.equal(PUBLIC_LISTING_ENABLED({PUBLIC_LISTING_READ_ENABLED:'true',PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true'}),true);
});
