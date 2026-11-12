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
      assert.deepEqual(provider.writes,['quixo:tenant:operation']);assert.equal(provider.subscription.cancel_at_period_end,true);
      assert.equal(journal.completedCount,1);assert.deepEqual(journal.result,{cancelAtPeriodEnd:true});
      assert.equal(journal.steps.set_cancellation.idempotency_key,'quixo:tenant:operation');
    }finally{fs.rmSync(directory,{recursive:true,force:true});}
  });
}

for(const [scenario,steps] of Object.entries({increase:['increase_quantity'],reduction:['create_schedule','set_schedule_phases'],zero:['set_cancellation']})){
  const cases=[['after_claim',''],['after_completion',''],
    ...steps.flatMap(step=>['after_intent','after_provider_effect','after_checkpoint'].map(boundary=>[boundary,step]))];
  for(const [boundary,step] of cases){
    test(`quantity ${scenario}: SIGKILL ${boundary} ${step} recovers once`,()=>{
      const directory=fs.mkdtempSync(path.join(os.tmpdir(),'quantity-recovery-crash-'));
      try{
        const stopped=spawnSync(process.execPath,[fixture,directory,boundary,scenario,step],{encoding:'utf8',timeout:10000});
        assert.equal(stopped.signal,'SIGKILL',stopped.stderr);assert.equal(stopped.status,null);
        for(let attempt=0;attempt<2;attempt++){
          const resumed=spawnSync(process.execPath,[fixture,directory,'resume',scenario],{encoding:'utf8',timeout:10000});
          assert.equal(resumed.status,0,resumed.stderr);
        }
        const journal=JSON.parse(fs.readFileSync(path.join(directory,'journal.json'),'utf8'));
        const provider=JSON.parse(fs.readFileSync(path.join(directory,'provider.json'),'utf8'));
        const suffixes={increase:['increase'],reduction:['schedule','phases'],zero:['zero-stock']}[scenario];
        assert.deepEqual(provider.writes,suffixes.map(suffix=>`quixo:tenant:operation:${suffix}`));
        assert.equal(journal.completedCount,1);
        assert.equal(journal.result.currentQuantity,scenario==='increase'?3:2);
        assert.equal(journal.result.nextRenewalQuantity,{increase:3,reduction:1,zero:0}[scenario]);
        assert.equal(provider.subscription.items.data[0].quantity,scenario==='increase'?3:2);
        assert.equal(provider.subscription.cancel_at_period_end,scenario==='zero');
        assert.deepEqual(Object.keys(journal.steps),steps);
        for(const saved of Object.values(journal.steps)){assert.ok(saved.completed_at);}
        if(scenario==='reduction'){
          assert.deepEqual(provider.schedule.phases.map(phase=>phase.items[0].quantity),[2,1]);
        }
      }finally{fs.rmSync(directory,{recursive:true,force:true});}
    });
  }
}
