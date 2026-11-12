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

for(const [scenario,steps] of Object.entries({checkout:['create_customer','create_checkout'],portal:['create_portal'],preview:['preview_invoice']})){
  const cases=[['after_claim',''],['after_completion',''],...steps.flatMap(step=>['after_intent','after_provider_effect','after_checkpoint'].map(point=>[point,step]))];
  for(const [boundary,step] of cases){
    test(`provider ${scenario}: SIGKILL ${boundary} ${step} resumes durable operation`,()=>{
      const directory=fs.mkdtempSync(path.join(os.tmpdir(),'provider-recovery-crash-'));
      try{
        const stopped=spawnSync(process.execPath,[fixture,directory,boundary,scenario,step],{encoding:'utf8',timeout:10000});
        assert.equal(stopped.signal,'SIGKILL',stopped.stderr);
        for(let attempt=0;attempt<2;attempt++){
          const resumed=spawnSync(process.execPath,[fixture,directory,'resume',scenario],{encoding:'utf8',timeout:10000});
          assert.equal(resumed.status,0,resumed.stderr);
        }
        const journal=JSON.parse(fs.readFileSync(path.join(directory,'journal.json'),'utf8'));
        const provider=JSON.parse(fs.readFileSync(path.join(directory,'provider.json'),'utf8'));
        assert.equal(journal.completedCount,1);assert.deepEqual(Object.keys(journal.steps),steps);
        const expected=scenario==='checkout'?['quixo:tenant:operation:customer','quixo:tenant:operation:checkout']:['quixo:tenant:operation'];
        if(scenario==='preview'&&boundary==='after_provider_effect'){
          // Preview has no retrievable payable object. A lost response reuses
          // exactly the persisted key/input within the ten-minute preview window.
          expected.push('quixo:tenant:operation');
        }
        assert.deepEqual(provider.writes,expected);
        if(scenario==='checkout'){assert.deepEqual(journal.result,{sessionId:'cs_created',customerId:'cus_created'});}
        if(scenario==='portal'){assert.equal(journal.result.url,'https://billing.stripe.com/p/proof');}
        if(scenario==='preview'){assert.equal(journal.result.nextInvoiceTotalMinor,1500);}
        for(const saved of Object.values(journal.steps)){
          assert.ok(saved.completed_at);assert.equal(saved.result_json.includes('https://'),false,'Steps never retain hosted URLs');
        }
      }finally{fs.rmSync(directory,{recursive:true,force:true});}
    });
  }
}

for(const mode of ['grace','trial']){
  for(const shape of ['partial','zero','scheduled']){
    const scenario=`cleanup_${mode}_${shape}`,steps=shape==='scheduled'?['release_cleanup_schedule','cleanup_subscription']:['cleanup_subscription'];
    const cases=[['after_claim',''],['after_completion',''],...steps.flatMap(step=>
      ['after_intent','after_provider_effect','after_checkpoint'].map(point=>[point,step]))];
    for(const [boundary,step] of cases){
      test(`${scenario}: SIGKILL ${boundary} ${step} recovers once without invoicing`,()=>{
        const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cessation-cleanup-crash-'));
        try{
          const stopped=spawnSync(process.execPath,[fixture,directory,boundary,scenario,step],{encoding:'utf8',timeout:10000});
          assert.equal(stopped.signal,'SIGKILL',stopped.stderr);
          for(let attempt=0;attempt<2;attempt++){
            const resumed=spawnSync(process.execPath,[fixture,directory,'resume',scenario],{encoding:'utf8',timeout:10000});
            assert.equal(resumed.status,0,resumed.stderr);
          }
          const journal=JSON.parse(fs.readFileSync(path.join(directory,'journal.json'),'utf8'));
          const provider=JSON.parse(fs.readFileSync(path.join(directory,'provider.json'),'utf8'));
          assert.equal(journal.completedCount,1);assert.deepEqual(Object.keys(journal.steps),steps);
          assert.deepEqual(provider.writes,(shape==='scheduled'?['cleanup-release','cleanup']:['cleanup']).map(s=>`quixo:tenant:operation:${s}`));
          assert.equal(provider.subscription.status,mode==='grace'?'past_due':'trialing');
          assert.equal(provider.subscription.items.data[0].quantity,shape==='zero'?2:1);
          assert.equal(provider.subscription.cancel_at_period_end,shape==='zero');
          assert.equal(journal.result.nextRenewalQuantity,shape==='zero'?0:1);
          assert.equal(provider.subscription.schedule,null);
          assert.equal(journal.steps.cleanup_subscription.input.body.proration_behavior,'none');
          assert.deepEqual(Object.keys(journal.steps.cleanup_subscription.input.body).sort(),
            shape==='zero'?['cancel_at_period_end','proration_behavior']:['items','proration_behavior']);
        }finally{fs.rmSync(directory,{recursive:true,force:true});}
      });
    }
  }
}


for(const shape of ['increase','reduction']){
  const steps=shape==='increase'?['increase_quantity']:['create_schedule','set_schedule_phases'];
  for(const [boundary,step] of [['after_claim',''],['after_completion',''],...steps.flatMap(s=>['after_intent','after_provider_effect','after_checkpoint'].map(b=>[b,s]))]){
    test(`restore ${shape}: SIGKILL ${boundary} ${step} resumes original billing once`,()=>{
      const directory=fs.mkdtempSync(path.join(os.tmpdir(),'restore-recovery-crash-')),scenario=`restore_${shape}`;
      try{
        const stopped=spawnSync(process.execPath,[fixture,directory,boundary,scenario,step],{encoding:'utf8',timeout:10000});
        assert.equal(stopped.signal,'SIGKILL',stopped.stderr);
        for(let n=0;n<2;n++){const resumed=spawnSync(process.execPath,[fixture,directory,'resume',scenario],{encoding:'utf8',timeout:10000});assert.equal(resumed.status,0,resumed.stderr);}
        const provider=JSON.parse(fs.readFileSync(path.join(directory,'provider.json'),'utf8'));
        const journal=JSON.parse(fs.readFileSync(path.join(directory,'journal.json'),'utf8'));
        assert.deepEqual(provider.writes,(shape==='increase'?['increase']:['schedule','phases']).map(k=>`quixo:tenant:operation:${k}`));
        assert.equal(journal.completedCount,1);assert.equal(journal.result.currentQuantity,shape==='increase'?3:2);
        assert.equal(journal.result.nextRenewalQuantity,shape==='increase'?3:1);
      }finally{fs.rmSync(directory,{recursive:true,force:true});}
    });
  }
}
