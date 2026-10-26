import test from 'node:test';
import assert from 'node:assert/strict';
import {PROPERTY_COUNTRIES,normalizePropertyCountry} from '../src/utils/constants.js';

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
