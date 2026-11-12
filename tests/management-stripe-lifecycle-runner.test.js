import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const script=fileURLToPath(new URL('../scripts/verify-management-stripe-lifecycle.mjs',import.meta.url));
for(const [label,confirm,key] of [['no opt-in','','sk_test_fake'],['live credential','RUN-ISOLATED-SANDBOX','sk_live_fake'],['missing credential','RUN-ISOLATED-SANDBOX','']]){
  test(`sandbox lifecycle fails closed with ${label}`,async()=>{
    const cwd=await mkdtemp(join(tmpdir(),'stripe-lifecycle-'));
    try{
      const result=spawnSync(process.execPath,[script],{cwd,encoding:'utf8',timeout:5000,
        env:{...process.env,STRIPE_LIFECYCLE_CONFIRM:confirm,STRIPE_SANDBOX_SECRET_KEY:key}});
      assert.equal(result.status,1);assert.equal(result.error,undefined);
      const evidence=JSON.parse(await readFile(join(cwd,'stripe-lifecycle-evidence.json'),'utf8'));
      assert.equal(evidence.passed,false);assert.equal(evidence.failure.stage,'configuration');assert.deepEqual(evidence.objects,{});
      if(key){assert.ok(!`${result.stdout}${result.stderr}`.includes(key));}
    }finally{await rm(cwd,{recursive:true,force:true});}
  });
}
