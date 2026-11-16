import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {BILLING_PRICE,entitlement,hash} from '../src/api/managementBilling/contract.js';
import {invoiceSubscription,objectId} from '../src/api/managementBilling/stripe.js';

// Execute the deployed harness's actual guards without importing its /app-only
// entry point, constructing a SQL connection, or making provider requests.
const source=readFileSync(new URL('../scripts/verify-deployed-cancellation-recovery.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/verify-deployed-cancellation-recovery.yml',import.meta.url),'utf8');
const between=(text,start,end)=>{
  const from=text.indexOf(start),to=text.indexOf(end,from+start.length);
  assert.ok(from>=0&&to>from,`Source boundaries remain present: ${start}`);
  return text.slice(from,to);
};
const instantiate=(body,bindings)=>new Function(...Object.keys(bindings),body)(...Object.values(bindings));
const operation='11111111-1111-4111-8111-111111111111';
const setupCommandId='22222222-2222-4222-8222-222222222222';
const preparationCommandId='33333333-3333-4333-8333-333333333333';
const paidThrough='2099-01-01T00:00:00.000Z',periodEnd=Date.parse(paidThrough)/1000;
const iso=value=>new Date(value).toISOString();

function paidFixture(quantity=1) {
  const fixture={
    account:{stripe_customer_id:'cus_fixture',stripe_subscription_id:'sub_fixture',stripe_item_id:'si_fixture',
      quantity,subscription_status:'active',initial_payment_verified:true,paid_through:paidThrough,
      cancel_at_period_end:false,stripe_schedule_id:null,pending_quantity:null},
    stock:Array.from({length:quantity},()=>({status:'promoted'})),
    properties:Array.from({length:quantity},()=>({})),listings:Array.from({length:quantity},()=>({opted_out:true})),
    audit:[{action:'inventory.promoted'}],setup:{command:{status:'completed'}},
    preparation:{command:null,steps:[]},target:{command:null},
  };
  const provider={customer:{id:'cus_fixture'},session:{status:'complete'},invoiceLines:[{period:{end:periodEnd}}],
    subscription:{id:'sub_fixture',status:'active',cancel_at_period_end:false,schedule:null,cancel_at:null,canceled_at:null,ended_at:null,
      items:{data:[{current_period_start:periodEnd-86400,current_period_end:periodEnd}]}}};
  return {fixture,provider};
}

const paidHelpers=quantity=>instantiate(
  between(source,'function paidBoundary(provider)','async function promotePaidSetup(')+'\nreturn {paidBoundary,assertPaidAccess};',
  {assert,entitlement,iso,billedQuantity:quantity});

test('paid baseline precedes reversal preparation, and target snapshots capture the ending state',async()=>{
  for(const scenario of ['period-end-no-schedule','period-end-release-response-loss','period-end-after-release-response-loss','period-end-cancellation-reversal']){
    const scheduled=scenario.includes('release-response-loss'),reversalResponseLoss=scenario==='period-end-cancellation-reversal';
    const {fixture,provider}=paidFixture(scheduled?2:1),checks=[];
    const check=name=>checks.push(name),scheduleId=scheduled?'sub_sched_fixture':null;
    const prepareRenewalSchedule=async()=>{
      provider.subscription.schedule=scheduleId;provider.schedule={status:'active'};
      fixture.account.stripe_schedule_id=scheduleId;fixture.account.pending_quantity=1;
      fixture.preparation.command={status:'completed'};
      check('normal-cessation-preparation');check('preparation-retry-stable');return {fixture,provider};
    };
    const prepareReversalCancellation=async()=>{
      assert.deepEqual(checks,['paid-no-schedule-baseline']);
      provider.subscription.cancel_at_period_end=true;provider.subscription.cancel_at=periodEnd;
      fixture.account.cancel_at_period_end=true;
      fixture.preparation.command={status:'completed',result_json:JSON.stringify({cancelAtPeriodEnd:true,paidThrough})};
      fixture.audit=[...fixture.audit,{action:'sandbox.cancellation.recovered'}];
      check('normal-cancellation-preparation');check('preparation-cancellation-retry-stable');return {fixture,provider};
    };
    const start="  if(scheduled){({fixture,provider}=await prepareRenewalSchedule(fixture,provider,actorId));}";
    const phase=between(source,start,'  const args={tenantId:operation,actorId,id:operation,cancelAtPeriodEnd:');
    const result=await instantiate('return (async()=>{'+phase+'\nreturn {originalAccount,preparationHistory,beforeTargetAudit};})()',{
      assert,fixture,provider,scheduled,reversalResponseLoss,hasPreparationCommand:scheduled||reversalResponseLoss,actorId:'actor',
      ...paidHelpers(scheduled?2:1),prepareRenewalSchedule,prepareReversalCancellation,
      hash,paidFinancialSnapshot:()=>({invoice:'in_fixture'}),stockSnapshot:value=>value.stock,
      scheduleFingerprint:hash,accountBusiness:value=>({...value}),objectId,scheduleId,
      store:{inventory:async()=>[{}]},operation,check,
    });
    assert.equal(result.originalAccount.cancel_at_period_end,reversalResponseLoss);
    assert.equal(result.preparationHistory,scheduled||reversalResponseLoss?hash(fixture.preparation):null);
    assert.deepEqual(result.beforeTargetAudit,fixture.audit);
    assert.deepEqual(checks,scheduled?['normal-cessation-preparation','preparation-retry-stable','paid-scheduled-baseline']:
      reversalResponseLoss?['paid-no-schedule-baseline','normal-cancellation-preparation','preparation-cancellation-retry-stable']:['paid-no-schedule-baseline']);
  }
});

test('response loss tolerates either local flag, then completion requires the reversed projection',async()=>{
  const {fixture,provider}=paidFixture();
  const helpers=paidHelpers(1),boundary=helpers.paidBoundary(provider);
  const interrupted=between(source,"  assert.equal(fixture.target.intent.scheduleId,scheduled?scheduleId:null);","  progress('wait_for_natural_sql_retry_due');");
  const statement=interrupted.split('\n').find(line=>line.includes('assertPaidAccess(fixture,provider,boundary'));
  assert.ok(statement);
  for(const ending of [true,false]){
    fixture.account.cancel_at_period_end=ending;
    instantiate(statement,{assert,...helpers,fixture,provider,boundary,reversalResponseLoss:true,
      paidFinancialSnapshot:()=>({invoice:'in_fixture'}),originalFinancials:{invoice:'in_fixture'}});
  }
  const completion=source.split('\n').find(line=>line.includes("check(reversalResponseLoss?'original-reversal-recovered'"));
  assert.ok(completion);
  const complete=()=>instantiate('return (async()=>{'+completion+'})()',
    {fixture,provider,boundary,...helpers,confirmedProvider:async()=>provider,reversalResponseLoss:true,check:()=>{}});
  fixture.account.cancel_at_period_end=true;
  await assert.rejects(complete());
  fixture.account.cancel_at_period_end=false;
  await complete();
});

function providerReadback({ending=false,preparation='pending',step=true,stepCompleted=false}={}) {
  const customer={id:'cus_fixture',livemode:false,balance:0,metadata:{quixo_operation:setupCommandId,quixo_tenant:operation}};
  const session={id:'cs_test_fixture',livemode:false,mode:'subscription',customer:customer.id,
    metadata:{...customer.metadata,inventory_hash:'inventory'},success_url:'https://example.invalid/success',cancel_url:'https://example.invalid/cancel',
    currency:'usd',amount_total:500,status:'complete',payment_status:'paid',subscription:'sub_fixture',invoice:'in_fixture'};
  const subscription={id:'sub_fixture',livemode:false,customer:customer.id,status:'active',collection_method:'charge_automatically',currency:'usd',
    cancel_at_period_end:ending,schedule:null,latest_invoice:'in_fixture',default_payment_method:'pm_fixture',
    items:{has_more:false,data:[{id:'si_fixture',quantity:1,current_period_end:periodEnd,
      price:{id:BILLING_PRICE,currency:'usd',unit_amount:500,recurring:{interval:'month'}}}]}};
  const invoice={id:'in_fixture',livemode:false,status:'paid',customer:customer.id,subscription:subscription.id,currency:'usd',billing_reason:'subscription_create',
    subtotal:500,total:500,amount_due:500,amount_paid:500,amount_remaining:0,pre_payment_credit_notes_amount:0,post_payment_credit_notes_amount:0};
  const paymentIntent={id:'pi_fixture',livemode:false,customer:customer.id,status:'succeeded',amount:500,amount_received:500,currency:'usd',latest_charge:'ch_fixture',payment_method:'pm_fixture'};
  const charge={id:'ch_fixture',livemode:false,customer:customer.id,payment_intent:paymentIntent.id,status:'succeeded',paid:true,captured:true,
    amount:500,amount_captured:500,currency:'usd',amount_refunded:0,refunded:false,disputed:false,payment_method:'pm_fixture'};
  const fixture={account:{stripe_customer_id:customer.id,stripe_subscription_id:subscription.id,stripe_item_id:'si_fixture'},target:{command:null},
    stock:[{status:'promoted'}],setup:{command:{id:setupCommandId,tenant_id:operation,status:'completed'},intent:{inventoryHash:'inventory'},steps:[
      {name:'create_customer',completed_at:'2026-01-01',result_json:JSON.stringify({customerId:customer.id})},
      {name:'create_checkout',completed_at:'2026-01-01',input_json:JSON.stringify({customer:customer.id,success_url:session.success_url,cancel_url:session.cancel_url}),
        result_json:JSON.stringify({sessionId:session.id,customerId:customer.id})},
    ]},preparation:{command:preparation?{id:preparationCommandId,tenant_id:operation,status:preparation,
      payload_hash:hash({cancelAtPeriodEnd:true}),payload_json:JSON.stringify({cancelAtPeriodEnd:true,_subscriptionId:subscription.id}),
      result_json:preparation==='completed'?JSON.stringify({cancelAtPeriodEnd:true,paidThrough}):null}:null,
      recovery:{state:preparation==='completed'?'succeeded':'pending'},
      intent:{cancelAtPeriodEnd:true,_subscriptionId:subscription.id,customerId:customer.id,scheduleId:null},steps:step?[{
        name:'set_cancellation',idempotency_key:'quixo:'+operation+':'+preparationCommandId,
        input_json:JSON.stringify({subscriptionId:subscription.id,cancelAtPeriodEnd:true}),completed_at:stepCompleted?'2026-01-01':null,
        result_json:stepCompleted?JSON.stringify({subscriptionId:subscription.id,cancelAtPeriodEnd:true}):null,
      }]:[]}};
  const reads=new Map([['/v1/customers/'+customer.id,customer],['/v1/checkout/sessions/'+session.id,session],
    ['/v1/subscriptions/'+subscription.id,subscription],['/v1/invoices/'+invoice.id,invoice]]);
  const lists=new Map([['/v1/checkout/sessions',[session]],['/v1/checkout/sessions/'+session.id+'/line_items',[{price:BILLING_PRICE,quantity:1}]],
    ['/v1/subscriptions',[subscription]],['/v1/invoices',[invoice]],['/v1/payment_intents',[paymentIntent]],['/v1/charges',[charge]],
    ['/v1/invoices/'+invoice.id+'/lines',[{livemode:false,invoice:invoice.id,subscription:subscription.id,quantity:1,amount:500,currency:'usd',
      price:BILLING_PRICE,subscription_item:'si_fixture',proration:false,period:{start:periodEnd-86400,end:periodEnd}}]],
    ['/v1/invoice_payments',[{livemode:false,invoice:invoice.id,status:'paid',currency:'usd',amount_paid:500,amount_requested:500,
      payment:{type:'payment_intent',payment_intent:paymentIntent.id}}]],['/v1/refunds',[]],['/v1/credit_notes',[]],['/v1/invoiceitems',[]]]);
  const get=(map,path)=>{assert.ok(map.has(path),'Only expected provider GETs: '+path);return map.get(path);};
  const run=instantiate(between(source,'async function providerState(fixture)','async function confirmedProvider(')+'\nreturn providerState;',
    {assert,objectId,invoiceSubscription,BILLING_PRICE,read:async path=>get(reads,path),listAll:async path=>get(lists,path),
      mode:'cleanup',hostedWaitStarted:true,cleanupAttempted:true,scheduled:false,reversalResponseLoss:true,billedQuantity:1,invoiceAmountMinor:500});
  const loader=between(between(source,'async function loadFixture()','async function customerEvents('),
    '  if(reversalResponseLoss){','  const targetCancelAtPeriodEnd=');
  return {fixture,customer,subscription,run:async()=>{
    instantiate(loader,{assert,hash,iso,reversalResponseLoss:true,preparation:fixture.preparation,
      setup:fixture.setup,stock:fixture.stock,account:fixture.account});
    return run(fixture);
  }};
}

test('maintenance reads either pending preparation phase, but requires the exact owned intent and step',async()=>{
  for(const ending of [false,true]){const state=providerReadback({ending});assert.equal((await state.run()).subscription.cancel_at_period_end,ending);}
  for(const mutate of [
    state=>{state.fixture.preparation.intent._subscriptionId='sub_foreign';},
    state=>{state.fixture.preparation.intent.customerId='cus_foreign';},
    state=>{state.fixture.preparation.intent.scheduleId='sub_sched_foreign';},
    state=>{state.fixture.preparation.command.payload_hash=hash({cancelAtPeriodEnd:false});},
    state=>{state.fixture.preparation.command.payload_json=JSON.stringify({cancelAtPeriodEnd:false,_subscriptionId:state.subscription.id});},
    state=>{state.fixture.preparation.steps[0].idempotency_key+=':different';},
    state=>{state.fixture.preparation.steps[0].input_json=JSON.stringify({subscriptionId:'sub_foreign',cancelAtPeriodEnd:true});},
    state=>{state.customer.metadata.quixo_tenant=setupCommandId;},
    state=>{state.subscription.schedule='sub_sched_foreign';},
  ]){const state=providerReadback({ending:true});mutate(state);await assert.rejects(state.run());}
  await providerReadback({ending:false,step:false}).run();
  await assert.rejects(providerReadback({ending:true,step:false}).run());
  for(const options of [{preparation:'completed',stepCompleted:true},{preparation:'pending',stepCompleted:true}]){
    await providerReadback({...options,ending:true}).run();
    await assert.rejects(providerReadback({...options,ending:false}).run());
  }
  await providerReadback({preparation:null,step:false,ending:false}).run();
  await assert.rejects(providerReadback({preparation:null,step:false,ending:true}).run());
});

const commonChecks=['protected-baseline','fresh-isolated-fixture','normal-checkout-setup','unique-bound-checkout','hosted-payment-completed','paid-stock-promoted'];
const finalChecks=['exact-operation-retries-stable','refresh-retry-stable','original-financials-stock-preserved','protected-scope-unchanged','cleanup-retained'];
function proofFixture(scenario) {
  const scheduled=scenario.includes('release-response-loss'),after=scenario==='period-end-after-release-response-loss',reversal=scenario==='period-end-cancellation-reversal';
  const quantity=scheduled?2:1;
  const checks=[...commonChecks,...(scheduled?['normal-cessation-preparation','preparation-retry-stable','paid-scheduled-baseline']:
    ['paid-no-schedule-baseline',...(reversal?['normal-cancellation-preparation','preparation-cancellation-retry-stable']:[])]),
    ...(after?['release-checkpoint-completed','cancellation-response-lost-after-release']:
      [reversal?'reversal-response-lost':scheduled?'schedule-release-response-lost':'cancellation-response-lost']),
    reversal?'original-reversal-intent-preserved':'original-cancellation-intent-preserved','naturally-due',
    reversal?'original-reversal-recovered':'original-cancellation-recovered',...finalChecks];
  const identity={operation,mode:'verify',scenario,targetCommandId:operation,setupCommandId,...(scheduled||reversal?{preparationCommandId}:{})};
  const result={...identity,checks,customerId:'cus_fixture',sessionId:'cs_test_fixture',customerEventId:'evt_customer',subscriptionId:'sub_fixture',
    initialInvoiceId:'in_fixture',paymentIntentId:'pi_fixture',chargeId:'ch_fixture',currency:'usd',paidThrough,providerPeriodEnd:periodEnd,
    cancelAtPeriodEnd:!reversal,cancellationResult:{cancelAtPeriodEnd:!reversal,paidThrough},
    originalCustomerKey:'quixo:'+operation+':'+setupCommandId+':customer',originalCheckoutKey:'quixo:'+operation+':'+setupCommandId+':checkout',
    originalCancellationKey:'quixo:'+operation+':'+operation,
    customerPosts:1,checkoutPosts:1,cancellationPosts:1,recoveryProviderWrites:scheduled&&!after?1:0,retryProviderWrites:0,refreshProviderWrites:0,
    cleanupPosts:0,cleanupCancellationRequests:1,setupAttempts:1,setupCompletedSteps:2,targetAttempts:2,targetCompletedSteps:scheduled?2:1,
    targetRecoveredAudits:1,releaseScheduleSteps:scheduled?1:0,checkoutSessions:1,subscriptionsCreated:1,invoicesCreated:1,paymentIntentsCreated:1,
    chargesCreated:1,initialInvoiceAmountMinor:quantity*500,billedQuantity:quantity,actualProperties:quantity,actualUnits:0,promotionAuditCount:1};
  for(const key of ['passed','sandbox','normalCheckoutSetup','hostedCheckoutCompleted','responseDiscarded','originalIdempotencyKeyPreserved',
    'originalIntentPreserved','paidAccessRetained','exactCancelRetryStable','exactReconcileRetryStable','originalRecoveryRetryStable','refreshRetryStable',
    'stockUnchanged','stockPrivate','promotedStockRetained','initialInvoicePreserved','noAdditionalFinancialObjects','subscriptionCanceled','sessionCompleted',
    'fixtureInactive','recordsRetained','protectedBillingUnchanged','workerScopeUnchanged','processLocalStagingReadiness']){result[key]=true;}
  for(const key of ['sessionExpired','servingConfigurationChanged','automaticWorkerAccepted','httpAccepted','uiAccepted','credentialLoginAccepted',
    'liveChargingEnabled','wholeProcessCrashAccepted','naturalPaidBoundaryAccepted']){result[key]=false;}
  result.scheduleReleaseAccepted=scheduled;result.cancellationReversalAccepted=reversal;
  const cleanup={...identity,verified:true,fixtureInactive:true,recordsRetained:true,targetJournalRetained:true,setupJournalRetained:true,
    noAdditionalFinancialObjects:true,protectedBillingUnchanged:true,workerScopeUnchanged:true,expiryResponseRecovered:false,cancellationResponseRecovered:false,
    sessionCompleted:true,subscriptionCanceled:true,initialInvoicePreserved:true,noSession:false,sessionExpired:false,noSubscription:false,noInvoice:false,noPayment:false,
    cleanupPosts:0,cleanupCancellationRequests:1,pendingStockRetained:0,promotedStockRetained:quantity,cleanupKind:'paid-subscription-canceled'};
  if(scheduled||reversal){Object.assign(result,{preparationJournalRetained:true,preparationRetryStable:true,preparationAttempts:1,preparationRecoveredAudits:1});cleanup.preparationJournalRetained=true;}
  if(reversal){Object.assign(result,{originalPreparationCancellationKey:'quixo:'+operation+':'+preparationCommandId,preparationCancellationPosts:1,preparationCompletedSteps:1});}
  if(scheduled){
    const schedule={scheduleId:'sub_sched_fixture',scheduleStatus:'released',releasedSubscriptionId:'sub_fixture',subscriptionId:'sub_fixture',
      scheduleRetained:true,scheduleOwnershipConfirmed:true,releasedScheduleRetained:true,attachedScheduleCanceled:false,
      actualProperties:2,actualUnits:0,cessationControls:1,ceasedProperties:1,cleanupScheduleCancellationRequests:0};
    Object.assign(result,schedule,{cessationControlRetained:true,pendingQuantityCleared:true,processLocalCessationReadiness:true,
      releasePosts:1,recoveryReleasePosts:0,recoveryCancellationPosts:after?0:1,preparationSchedulePosts:1,preparationPhasePosts:1,
      preparationRetryProviderWrites:0,preparationCompletedSteps:2,managedDwellings:1,ceasedPropertyId:operation,remainingPropertyId:preparationCommandId,
      originalPreparationScheduleKey:'quixo:'+operation+':'+preparationCommandId+':schedule',
      originalPreparationPhasesKey:'quixo:'+operation+':'+preparationCommandId+':phases',originalReleaseKey:'quixo:'+operation+':'+operation+':release',
      preparationScheduleEventId:'evt_schedule',preparationPhasesEventId:'evt_phases'});
    Object.assign(cleanup,schedule,{scheduleCancellationResponseRecovered:false,cleanupKind:'paid-released-schedule-subscription-canceled'});
  }
  if(after){Object.assign(result,{responseLossStep:'set_cancellation',releaseResponseReturned:true,releaseCheckpointCompletedBeforeCancellation:true,
    releaseCheckpointPreserved:true,releaseCheckpointBeforeHash:'a'.repeat(64),releaseCheckpointAfterHash:'a'.repeat(64),releaseCheckpointCompletedAt:'2026-01-01T00:00:00.000Z'});}
  return {scenario,identity,result,cleanup};
}

function proofRun(data,{mode='verify',change=()=>{}}={}) {
  const records=[],identity={...data.identity,mode};
  const add=(kind,value)=>records.push([kind,{...identity,...value,mode}]);
  if(mode==='inspect'){add('INSPECT',data.inspection);}
  else if(mode==='cleanup'){add('CLEANUP',data.cleanup);}
  else{
    for(const name of data.result.checks){
      add('CHECK',{name});
      if(name==='unique-bound-checkout'){add('READY',{targetCommandId:operation,setupCommandId,...(data.identity.preparationCommandId?{preparationCommandId}:{}),customerId:'cus_fixture',sessionId:'cs_test_fixture',waitSeconds:600});}
      if(name==='protected-scope-unchanged'){add('CLEANUP',data.cleanup);}
    }
    add('PASS',data.result);
  }
  change(records);
  const root=mkdtempSync(join(tmpdir(),'cancellation-proof-'));
  try{
    writeFileSync(join(root,'cancellation-result.txt'),records.map(([kind,value])=>'CANCELLATION_RECOVERY_'+kind+'='+JSON.stringify(value)).join('\n')+'\n');
    for(const name of ['cancellation-exit-code.txt','cancellation-live-exit-code.txt']){writeFileSync(join(root,name),'0');}
    const python=between(workflow,"          import datetime, json, os, re\n","          CANCELLATION_RECOVERY_PROOF\n").split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
    const run=spawnSync('python3',['-c',python],{cwd:root,encoding:'utf8',env:{...process.env,RUNNER_TEMP:root,
      CANCELLATION_RECOVERY_OPERATION:operation,CANCELLATION_RECOVERY_MODE:mode,CANCELLATION_RECOVERY_SCENARIO:data.scenario,
      GITHUB_SHA:'source',EXPECTED_BUILD:'build',SERVING_REVISION:'revision',GITHUB_RUN_ID:'test',GITHUB_RUN_ATTEMPT:'1'}});
    assert.ifError(run.error);assert.equal(run.signal,null);assert.equal(run.stderr,'');
    const summary=JSON.parse(readFileSync(join(root,'cancellation-recovery-summary.json'),'utf8'));
    assert.equal(run.status,summary.workflowProofValid?0:1);
    return summary;
  }finally{rmSync(root,{recursive:true,force:true});}
}

test('the real workflow proof accepts all four scenario contracts, including the 18-check false reversal',()=>{
  for(const scenario of ['period-end-no-schedule','period-end-release-response-loss','period-end-after-release-response-loss','period-end-cancellation-reversal']){
    const data=proofFixture(scenario),summary=proofRun(data);
    assert.deepEqual(summary.errors,[],scenario);
    if(scenario==='period-end-cancellation-reversal'){assert.equal(data.result.checks.length,18);assert.equal(summary.proof.cancelAtPeriodEnd,false);}
  }
});

test('proof rejects wrong reversal state, lost preparation identity, and swapped baseline/preparation checks',()=>{
  for(const change of [
    records=>{records.find(([kind])=>kind==='PASS')[1].cancelAtPeriodEnd=true;},
    records=>{records.find(([kind])=>kind==='PASS')[1].cancellationResult.cancelAtPeriodEnd=true;},
    records=>{records.find(([kind])=>kind==='CLEANUP')[1].preparationCommandId=setupCommandId;},
    records=>{const checks=records.filter(([kind])=>kind==='CHECK');[checks[6][1].name,checks[7][1].name]=[checks[7][1].name,checks[6][1].name];},
  ]){assert.equal(proofRun(proofFixture('period-end-cancellation-reversal'),{change}).workflowProofValid,false);}
});

test('reversal maintenance cleanup requires its preparation journal but no schedule-only response field',()=>{
  const reversal=proofFixture('period-end-cancellation-reversal');
  assert.deepEqual(proofRun(reversal,{mode:'cleanup'}).errors,[]);
  delete reversal.cleanup.preparationJournalRetained;
  assert.equal(proofRun(reversal,{mode:'cleanup'}).workflowProofValid,false);
  const scheduled=proofFixture('period-end-release-response-loss');
  assert.deepEqual(proofRun(scheduled,{mode:'cleanup'}).errors,[]);
  delete scheduled.cleanup.scheduleCancellationResponseRecovered;
  assert.equal(proofRun(scheduled,{mode:'cleanup'}).workflowProofValid,false);
});

test('read-only inspection preserves an absent preparation journal without inventing completed work',async()=>{
  const emptyOperation=()=>({command:null,recovery:null,steps:[],intent:null});
  const fixture={tenant:{status:'inactive'},actor:{status:'inactive'},memberships:[],listings:[],audit:[],account:{stripe_subscription_id:null},
    setup:emptyOperation(),preparation:emptyOperation(),target:emptyOperation(),stock:[],properties:[],units:[]};
  const provider={customer:null,session:null,subscription:null,invoice:null,sessions:[],subscriptions:[],invoices:[],paymentIntents:[],charges:[]};
  const emitted=[];
  const inspect=instantiate(between(source,'async function inspect()','\ntry{')+'\nreturn inspect;',{
    assert,progress:()=>{},preflight:async()=>{},loadFixture:async()=>structuredClone(fixture),confirmedProvider:async()=>structuredClone(provider),
    historyCore:value=>value,assertAuditRetained:async(before,after)=>assert.deepEqual(after,before),verifyProtected:async()=>{},
    emit:(kind,value)=>emitted.push({kind,value}),operation,setupCommandId,preparationCommandId,cleanupAction:'cleanup',
    operationAudits:()=>[],scheduled:false,reversalResponseLoss:true,
  });
  await inspect();assert.equal(emitted.length,1);assert.equal(emitted[0].kind,'CANCELLATION_RECOVERY_INSPECT');
  const inspection=emitted[0].value;
  assert.equal(inspection.preparationJournalRetained,true);assert.equal(inspection.preparationCommandStatus,null);
  for(const name of ['preparationAttempts','preparationStepCount','preparationCompletedSteps','preparationRecoveredAudits','providerWrites','localWrites']){assert.equal(inspection[name],0);}
  const data=proofFixture('period-end-cancellation-reversal');data.inspection=inspection;
  assert.deepEqual(proofRun(data,{mode:'inspect'}).errors,[]);
});
