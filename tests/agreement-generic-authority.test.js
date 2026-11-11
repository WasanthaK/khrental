import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizePlatformQuery } from '../src/api/platform/authorization.js';
import { assertGenericAgreementWriteSafe } from '../src/api/mssql/agreementWritePolicy.js';
import { containsActiveAgreementStatus } from '../src/api/platform/tenancyActivationGuard.js';
import { containsClosedAgreementStatus } from '../src/api/platform/tenancyClosureGuard.js';

const actor = {user:{id:'admin',role:'admin'},membership:{role:'admin',status:'active',tenant_id:'tenant'}};
const authorize = (payload,action='update') => authorizePlatformQuery({...actor,table:'agreements',action,payload,filters:[{column:'id',operator:'eq',value:'agreement'}]});

test('agreement case variants cannot evade lifecycle or signing authority', () => {
  assert.equal(containsActiveAgreementStatus({Status:'active'}),true);
  assert.equal(containsClosedAgreementStatus({STATUS:'closed'}),true);
  for (const payload of [{Status:'active'},{STATUS:'signed'},{Signature_Status:'completed'},
    {Signed_Document_URL:'/storage/forged.pdf'},{Signatories_Status:[{status:'completed'}]}]) {
    assert.throws(()=>assertGenericAgreementWriteSafe(payload),{status:409});
    for (const action of ['insert','update','upsert']) { assert.throws(()=>authorize(payload,action),{status:409}); }
  }
});

test('all rows are checked; case collisions cannot select a different database field', () => {
  for (const action of ['insert','update','upsert']) {
    assert.throws(()=>authorize({status:'draft',Status:'active'},action),{status:400});
  }
  assert.throws(()=>authorize([{status:'draft'},{Signature_Status:'completed'}],'insert'),{status:409});
  assert.throws(()=>authorize([{status:'draft'},{STATUS:'active'}],'upsert'),{status:409});
});

test('draft fields canonicalize only database keys and cannot erase retained signature fields', () => {
  const nested = {UpperCase:'Contract wording',status:'nested business value'};
  const result = authorize({Notes:'Keep Case',Terms:nested,Status:'draft',Signed_Document_URL:null});
  assert.deepEqual(result.payload,{notes:'Keep Case',terms:nested,status:'draft'});
  assert.equal(result.payload.terms,nested);
});
