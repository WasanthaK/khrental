import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/services/platformClientCore.js',import.meta.url),'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm,'')
  .replace(/^export \{[^}]+\};?$/gm,'').replace(/\bexport /g,'');
const A={access_token:'test-A',user:{id:'A'}},B={access_token:'test-B',user:{id:'B'}};
function fixture(){
  let stored=A,tenant='tenant-A',handler,resolveRequest;
  const events=[],requests=[];
  const context=vm.createContext({console,Set,JSON,Error,Promise,
    window:{addEventListener:(_name,fn)=>handler=fn},
    loadStoredSession:()=>stored,saveStoredSession:s=>stored=s,
    clearStoredSession:()=>stored=null,clearActiveTenantId:()=>tenant=null,
    getActiveTenantId:()=>tenant,setActiveTenantId:x=>tenant=x,
    ensureDatabaseReady:async()=>{},getApiBaseUrl:()=>'',
    buildRequestContextHeaders:h=>({...stored?{Authorization:`Bearer ${stored.access_token}`}:{},...h}),
    fetch:async(url,options)=>{requests.push({url,options});return await new Promise(r=>resolveRequest=r);}
  });
  vm.runInContext(source+'\n globalThis.auth=authClient;',context);
  context.auth.onAuthStateChange((event,session)=>events.push({event,session}));
  return {auth:context.auth,events,requests,state:()=>({stored,tenant}),
    change:s=>{stored=s;handler({key:'khrental.local.session'});},
    respond:async(status,payload={error:'test rejection'})=>{
      await new Promise(r=>setImmediate(r));
      resolveRequest({ok:status===200,status,headers:{get:()=> 'application/json'},json:async()=>payload});
    }};
}
test('sign-out clears identity and tenant before waiting for server',async()=>{
 const x=fixture(),pending=x.auth.signOut();
 assert.equal(x.state().stored,null);assert.equal(x.state().tenant,null);
 await x.respond(200,{});await pending;
 assert.equal(x.requests[0].options.headers.Authorization,'Bearer test-A');
});
test('server-rejected cached session is cleared; permission/outage errors preserve it',async()=>{
 for(const status of [401,403,503]){
  const x=fixture(),pending=x.auth.getTenantContext();await x.respond(status);await pending;
  assert.equal(x.state().stored,status===401?null:A);
 }
});
test('late rejection for old account never clears a newer account',async()=>{
 const x=fixture(),pending=x.auth.getTenantContext();
 await new Promise(r=>setImmediate(r));x.change(B);await x.respond(401);await pending;
 assert.equal(x.state().stored,B);assert.equal((await x.auth.getSession()).data.session,B);
});
test('sign-out completion cannot clear a new sign-in',async()=>{
 const x=fixture(),pending=x.auth.signOut();x.change(B);await x.respond(200,{});await pending;
 assert.equal(x.state().stored,B);
});
test('failed credentials do not invalidate an existing session',async()=>{
 const x=fixture(),pending=x.auth.signInWithPassword({email:'demo',password:'synthetic'});
 await x.respond(401);await pending;assert.equal(x.state().stored,A);
});
test('other-tab sign-out updates in-memory auth without restoring storage',async()=>{
 const x=fixture();x.change(null);
 assert.equal((await x.auth.getSession()).data.session,null);
 assert.equal(x.events.at(-1).event,'SIGNED_OUT');
});

test('late tenant context cannot restore workspace after logout',async()=>{
 const x=fixture(),pending=x.auth.getTenantContext();
 await new Promise(r=>setImmediate(r));x.change(null);
 await x.respond(200,{data:{tenantId:'old-tenant'}});
 assert.ok((await pending).error);assert.notEqual(x.state().tenant,'old-tenant');
});
test('failed remote sign-out still leaves local identity cleared',async()=>{
 const x=fixture(),pending=x.auth.signOut();await x.respond(503);assert.ok((await pending).error);
 assert.equal(x.state().stored,null);
});
