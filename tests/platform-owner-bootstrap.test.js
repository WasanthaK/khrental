import test from 'node:test';
import assert from 'node:assert/strict';
import {isBootstrapPlatformOwner,isPlatformAdmin} from '../src/api/mssql/platformAdminRouter.js';

const user={id:'owner-id',auth_id:'auth-id',email:'owner@example.test'};
const verified={app_user_id:user.id,auth_id:user.auth_id,email:user.email,verified:true};
const env={PLATFORM_BOOTSTRAP_OWNER_EMAIL:' OWNER@example.test '};

test('bootstrap defaults off and requires exact verified identity binding',()=>{
  assert.equal(isBootstrapPlatformOwner(user,verified,{}),false);
  assert.equal(isBootstrapPlatformOwner(user,verified,env),true);
  for(const patch of [{verified:false},{app_user_id:'other'},{auth_id:'other'},{email:'other@example.test'}]) {
    assert.equal(isBootstrapPlatformOwner(user,{...verified,...patch},env),false);
  }
  assert.equal(isBootstrapPlatformOwner({email:user.email},verified,env),false);
});

const lookup=({verifiedEmail=true,proof=1,table=true,active=true,existing=true}={})=>async statement=>{
  if(statement.includes('FROM dbo.auth_users')){return {...verified,metadata:JSON.stringify({global_email_verified:verifiedEmail}),email_proof:proof};}
  if(statement.includes('OBJECT_ID')){return {exists_value:table?1:0};}
  return (statement.includes('LOWER(COALESCE')?active:existing)?{id:'registry-row'}:null;
};

test('registry or historical email seed cannot elevate unverified or forged-metadata accounts',async()=>{
  for(const options of [{verifiedEmail:false},{proof:0}]){assert.equal(await isPlatformAdmin(user,{query:lookup(options),env}),false);}
  assert.equal(await isPlatformAdmin(user,{query:lookup(),env:{}}),true);
  assert.equal(await isPlatformAdmin(user,{query:lookup({active:false}),env}),false,'Revoked registry cannot fall back');
  assert.equal(await isPlatformAdmin(user,{query:lookup({table:false}),env:{}}),false);
  assert.equal(await isPlatformAdmin(user,{query:lookup({table:false}),env}),true);
  assert.equal(await isPlatformAdmin(user,{query:lookup({active:false,existing:false}),env}),true);
});

test('platform verification lookup binds persisted identities and consumed delivery evidence',async()=>{
  let sql;
  assert.equal(await isPlatformAdmin(user,{query:async statement=>{sql=statement;return null;},env}),false);
  for(const pattern of [/auth\.app_user_id/,/au\.auth_id=auth\.auth_id/,/LOWER\(au\.email\)=LOWER\(auth\.email\)/,/c\.sent_at IS NOT NULL/,/c\.consumed_at IS NOT NULL/,/c\.revoked_at IS NULL/,/au\.status='active'/]){assert.match(sql,pattern);}
});
