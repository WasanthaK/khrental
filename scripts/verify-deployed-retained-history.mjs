// Read an existing completed demo archive. Never manufacture signing evidence.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {getMssqlPool,closeMssqlPool} from '/app/src/api/mssql/pool.js';
import {createAuthRecord,findAuthRecordByAuthId,revokeAccessToken} from '/app/src/api/auth/index.js';
const operation=process.env.RETAINED_HISTORY_OPERATION;
const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const tokens=[],fixtures=[],checks=[];
let pool,sourceTenant,foreignCreated=false,baseline,stage='preflight',passed=false,cleanup=true;
const q=async(sql,args={})=>{const r=pool.request();for(const [k,v] of Object.entries(args)){r.input(k,v);}return (await r.query(sql)).recordset||[];};
const checkpoint=name=>{checks.push(name);console.log('HISTORY_CHECK='+name);};
const session=async record=>{
  const token=randomBytes(32).toString('base64url');tokens.push(token);
  await q('INSERT INTO auth_sessions(auth_user_id,token_hash,expires_at) VALUES(@id,@hash,DATEADD(MINUTE,5,SYSUTCDATETIME()))',{id:record.id,hash:digest(token)});
  return token;
};
const read=async(path,token,tenant)=>{
  assert.ok(path.startsWith('/api/mssql/agreements')||path.startsWith('/storage/documents/tenants/'));
  const r=await fetch('https://app.quixo.homes'+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{...(token?{Authorization:'Bearer '+token}:{}),'x-tenant-id':tenant}});
  const bytes=new Uint8Array(await r.arrayBuffer());assert.ok(bytes.length<25*1024*1024);
  return {status:r.status,type:r.headers.get('content-type')||'',bytes};
};
const makeFixture=async(tenant,role)=>{
  const id=randomUUID(),authId=randomUUID(),email=`ct04-${operation}-${role}@example.invalid`;
  fixtures.push({id,tenant});
  await q(`INSERT INTO app_users(id,tenant_id,name,email,role,user_type,auth_id,status,active,invited,createdat,updatedat)
    VALUES(@id,@tenant,'CT04 disposable denial fixture',@email,@role,@role,@authId,'active',1,0,SYSUTCDATETIME(),SYSUTCDATETIME());
    INSERT INTO tenant_memberships(tenant_id,app_user_id,role,status,is_default) VALUES(@tenant,@id,@role,'active',1)`,{id,tenant,email,role,authId});
  const record=await createAuthRecord({authId,appUserId:id,email,role,password:randomBytes(32).toString('base64url'),metadata:{acceptance_fixture:operation}});
  return {id,token:await session(record)};
};
let agreement,owner,renter;
const snapshot=async()=>digest({
  agreement:await q('SELECT * FROM agreements WHERE id=@id AND tenant_id=@tenant',{id:agreement.id,tenant:sourceTenant}),
  memberships:await q('SELECT * FROM tenant_memberships WHERE app_user_id IN (@owner,@renter) ORDER BY id',{owner:owner.id,renter:renter.id}),
  identities:await q('SELECT * FROM app_users WHERE id IN (@owner,@renter) ORDER BY id',{owner:owner.id,renter:renter.id}),
  billing:await q('SELECT * FROM management_billing_accounts WHERE tenant_id IN (@tenant,@a,@b) ORDER BY tenant_id',{tenant:sourceTenant,a:'80a4b392-13f8-484d-81fa-a110a6ef75f0',b:'2383f4fc-e107-4ac7-9e13-39db501f40ec'})
});
try{
  assert.match(operation||'',/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  pool=await getMssqlPool();
  assert.equal((await q('SELECT id FROM tenants WHERE id=@id',{id:operation})).length,0,'Fixture already exists; inspect instead of replaying');
  // Select only the explicitly labelled, previously accepted owner demo.
  const demos=await q(`SELECT tenant_id,assignedto FROM maintenance_requests
    WHERE title=@title AND status='completed'`,{title:'DEMO ONLY — self-assigned lifecycle 13 Nov 2026'});
  assert.equal(demos.length,1,'Exactly one accepted demo workspace is required');sourceTenant=demos[0].tenant_id;
  stage='select_existing_administrator';
  owner=(await q(`SELECT u.id,u.auth_id FROM app_users u JOIN tenant_memberships m ON m.app_user_id=u.id
    WHERE u.id=@id AND m.tenant_id=@tenant AND m.status='active' AND m.role IN ('admin','administrator') AND u.status='active'`,{id:demos[0].assignedto,tenant:sourceTenant}))[0];
  assert.ok(owner,'Existing demo administrator unavailable');
  stage='select_existing_closed_archive';
  agreement=(await q(`SELECT TOP 1 id,renteeid,signed_document_url FROM agreements
    WHERE tenant_id=@tenant AND status='closed' AND signature_status='completed' AND signed_document_url IS NOT NULL
    ORDER BY updatedat DESC,id`,{tenant:sourceTenant}))[0];
  assert.ok(agreement,'No already-retained closed demo agreement');
  const expected='/storage/documents/tenants/'+String(sourceTenant).toLowerCase()+'/agreements/'+String(agreement.id).toLowerCase()+'/signed/';
  assert.ok(String(agreement.signed_document_url).toLowerCase().startsWith(expected));
  assert.ok(/\.pdf$/i.test(agreement.signed_document_url),'Only exact retained local PDF paths');
  stage='select_existing_renter';
  renter=(await q(`SELECT u.id,u.auth_id FROM app_users u JOIN tenant_memberships m ON m.app_user_id=u.id
    WHERE u.id=@id AND m.tenant_id=@tenant AND m.status='active' AND u.status='active'`,{id:agreement.renteeid,tenant:sourceTenant}))[0];
  assert.ok(renter,'Original renter has no active persisted membership');
  stage='verify_reciprocal_identity';
  const records=await Promise.all([owner,renter].map(x=>findAuthRecordByAuthId(x.auth_id)));
  for(let i=0;i<2;i++){assert.ok(records[i]&&same(records[i].appUserId,[owner,renter][i].id),'Reciprocal demo identity required');}
  baseline=await snapshot();
  checkpoint('existing_closed_demo_archive_selected');
  stage='authorized_history';
  const adminToken=await session(records[0]),renterToken=await session(records[1]);
  const detail='/api/mssql/agreements/'+agreement.id;
  let pdfHash;
  for(const [role,token] of [['administrator',adminToken],['original_renter',renterToken]]){
    stage=role+'_metadata';
    const metadata=await read(detail,token,sourceTenant);
    console.log('HISTORY_HTTP='+JSON.stringify({stage,status:metadata.status}));
    assert.equal(metadata.status,200);
    const parsed=JSON.parse(new TextDecoder().decode(metadata.bytes));assert.ok(same(parsed.data?.id,agreement.id));
    stage=role+'_pdf';
    const pdf=await read(agreement.signed_document_url,token,sourceTenant);
    console.log('HISTORY_HTTP='+JSON.stringify({stage,status:pdf.status,pdfContentType:/application\/pdf/i.test(pdf.type)}));
    assert.equal(pdf.status,200);
    assert.match(pdf.type,/application\/pdf/i);assert.equal(new TextDecoder().decode(pdf.bytes.slice(0,5)),'%PDF-');
    const current=digest(Buffer.from(pdf.bytes));if(pdfHash){assert.equal(current,pdfHash);}else{pdfHash=current;}
    checkpoint(role+'_retained_metadata_and_pdf_allowed');
  }
  stage='disposable_denials';
  foreignCreated=true;
  await q("INSERT INTO tenants(id,name,slug,status,[plan]) VALUES(@id,'CT04 disposable foreign workspace',@slug,'active','development-testing')",{id:operation,slug:'ct04-'+operation});
  const unrelated=await makeFixture(sourceTenant,'rentee'),foreign=await makeFixture(operation,'admin');
  const deny=async(name,path,token,tenant,statuses=[403,404])=>{
    const response=await read(path,token,tenant);assert.ok(statuses.includes(response.status),name+': '+response.status);
    assert.ok(!response.type.includes('application/pdf'));assert.ok(!new TextDecoder().decode(response.bytes).includes(agreement.signed_document_url));checkpoint(name);
  };
  for(const [name,actor,tenant] of [['unrelated_renter',unrelated,sourceTenant],['foreign_administrator',foreign,operation]]){
    await deny(name+'_metadata_denied',detail,actor.token,tenant);
    await deny(name+'_pdf_denied',agreement.signed_document_url,actor.token,tenant);
  }
  await deny('foreign_workspace_override_denied',agreement.signed_document_url,foreign.token,sourceTenant,[403]);
  const list=await read('/api/mssql/agreements?pageSize=500&renteeId='+renter.id,unrelated.token,sourceTenant);
  assert.equal(list.status,200);assert.ok(!new TextDecoder().decode(list.bytes).toLowerCase().includes(String(agreement.id).toLowerCase()));checkpoint('unrelated_forced_renter_list_excludes_history');
  await q("UPDATE tenant_memberships SET status='inactive' WHERE tenant_id=@tenant AND app_user_id=@id",{tenant:sourceTenant,id:unrelated.id});
  assert.equal((await q('SELECT id FROM auth_sessions WHERE token_hash=@hash AND revoked_at IS NULL AND expires_at>SYSUTCDATETIME()',{hash:digest(unrelated.token)})).length,1);
  await deny('revoked_membership_metadata_denied',detail,unrelated.token,sourceTenant,[403]);
  await deny('revoked_membership_pdf_denied',agreement.signed_document_url,unrelated.token,sourceTenant,[403]);
  await revokeAccessToken(renterToken);
  await deny('revoked_session_pdf_denied',agreement.signed_document_url,renterToken,sourceTenant,[401]);
  await deny('anonymous_pdf_denied',agreement.signed_document_url,null,sourceTenant,[401,403]);
  assert.equal(await snapshot(),baseline);checkpoint('retained_agreement_existing_authority_and_billing_unchanged');
  passed=true;
}catch(error){console.error('HISTORY_FAILED='+JSON.stringify({stage,code:error.code||'ASSERTION',checks}));process.exitCode=1;}
finally{
  for(const token of tokens){try{await revokeAccessToken(token);}catch{cleanup=false;}}
  for(const fixture of fixtures){try{await q("UPDATE tenant_memberships SET status='inactive' WHERE tenant_id=@tenant AND app_user_id=@id; UPDATE app_users SET status='inactive',active=0 WHERE id=@id AND tenant_id=@tenant",fixture);}catch{cleanup=false;}}
  if(foreignCreated){try{await q("UPDATE tenants SET status='inactive' WHERE id=@id",{id:operation});}catch{cleanup=false;}}
  if(pool){
    try{
      for(const token of tokens){assert.equal((await q('SELECT id FROM auth_sessions WHERE token_hash=@hash AND revoked_at IS NULL',{hash:digest(token)})).length,0);}
      for(const fixture of fixtures){assert.equal((await q("SELECT id FROM tenant_memberships WHERE tenant_id=@tenant AND app_user_id=@id AND status='active'",fixture)).length,0);}
      for(const fixture of fixtures){assert.equal((await q("SELECT id FROM app_users WHERE id=@id AND (status='active' OR active=1)",{id:fixture.id})).length,0);}
      if(foreignCreated){assert.equal((await q("SELECT id FROM tenants WHERE id=@id AND status='active'",{id:operation})).length,0);}
      if(baseline){assert.equal(await snapshot(),baseline);}
    }catch{cleanup=false;}
  }
  console.log('HISTORY_CLEANUP='+JSON.stringify({verified:cleanup,sessions:tokens.length,fixtures:fixtures.length,foreignCreated,existingHistoryUnchanged:baseline?cleanup:null}));
  if(!cleanup){console.error('HISTORY_CLEANUP_FAILED');process.exitCode=1;}
  if(passed&&cleanup){console.log('HISTORY_PASS='+JSON.stringify({passed:true,checks,fixtureClosed:true,sessionsRevoked:true,existingHistoryUnchanged:true,providerWrites:0,credentialLoginAccepted:false}));}
  await closeMssqlPool();
}
