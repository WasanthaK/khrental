import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const fixture=fileURLToPath(new URL('./fixtures/management-recovery-process.mjs',import.meta.url));
for(const boundary of ['after_claim','after_intent','after_provider_effect','after_checkpoint','after_completion']){
  test(`actual process termination at ${boundary} resumes without duplicate provider effect`,()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'management-recovery-crash-'));
    try{
      const stopped=spawnSync(process.execPath,[fixture,directory,boundary],{encoding:'utf8',timeout:10000});
      assert.equal(stopped.signal,'SIGKILL',stopped.stderr);assert.equal(stopped.status,null);
      for(let attempt=0;attempt<2;attempt++){
        const resumed=spawnSync(process.execPath,[fixture,directory,'resume'],{encoding:'utf8',timeout:10000});
        assert.equal(resumed.status,0,resumed.stderr);
      }
      const journal=JSON.parse(fs.readFileSync(path.join(directory,'journal.json'),'utf8'));
      const provider=JSON.parse(fs.readFileSync(path.join(directory,'provider.json'),'utf8'));
      assert.deepEqual(provider.writes,['quixo:tenant:operation']);assert.equal(provider.cancelled,true);
      assert.equal(journal.completedCount,1);assert.deepEqual(journal.result,{cancelAtPeriodEnd:true});
      assert.equal(journal.steps.set_cancellation.idempotency_key,'quixo:tenant:operation');
    }finally{fs.rmSync(directory,{recursive:true,force:true});}
  });
}
