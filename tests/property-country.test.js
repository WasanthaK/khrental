import test from 'node:test';
import assert from 'node:assert/strict';
import {PROPERTY_COUNTRIES,normalizePropertyCountry} from '../src/utils/constants.js';
import {parsePreferenceInput,toPublicDTO} from '../src/api/publicListings/contract.js';

test('property country accepts actual ISO codes and normalizes user input',()=>{
  assert.equal(PROPERTY_COUNTRIES.length,249);
  assert.equal(new Set(PROPERTY_COUNTRIES.map(c=>c.code)).size,249);
  for(const value of ['LK','AU','BN','US','GB','IN']){
    assert.equal(normalizePropertyCountry(value.toLowerCase()),value);
  }
  assert.equal(normalizePropertyCountry(' lk '),'LK');
  for(const value of [null,undefined,'','XX','UK','LKA','Sri Lanka',17,{},['LK']]){
    assert.throws(()=>normalizePropertyCountry(value),{status:400,code:'PROPERTY_COUNTRY_REQUIRED'});
  }
});

test('country assignment updates canonical property semantics without inventing a public market',()=>{
  assert.deepEqual(parsePreferenceInput({countryCode:'au'}),{countryCode:'AU'});
  assert.throws(()=>parsePreferenceInput({countryCode:null}),{status:400});
  assert.deepEqual(parsePreferenceInput({optedOut:true}),{optedOut:true},'unknown legacy country does not prevent opting out');
  const row={public_id:'11111111-1111-4111-8111-111111111111',propertytype:'house',opted_out:0};
  assert.equal(toPublicDTO({...row,country_code:'AU'}),null);
  assert.equal(toPublicDTO({...row,country_code:null}),null);
  assert.equal(toPublicDTO({...row,country_code:'LK'}).country,'LK');
});
