import {hash,problem} from './contract.js';
import {billingClock} from './clock.js';
export {billingClock} from './clock.js';

export const recoveryDelay = attempts => Math.min(3600,30*2**Math.max(0,attempts-1));
export const recoveryCode = error => /^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code||'')?error.code:'BILLING_RECOVERY_FAILED';

// A durable intent precedes every external step. Step results are small, explicit
// projections, never a raw provider response, token, hosted URL or invoice body.
export const createRecoveryRunner = ({journal,handlers,clock=billingClock,logger=console}) => {
  const run=async({tenantId,id})=>{
    const claim=await journal.claim({tenantId,id});
    if(claim.completed){return claim.result;}
    if(claim.review){
      logger.error?.('[ManagementBilling] recovery_requires_review',{commandId:id,code:'BILLING_RECOVERY_LIMIT'});
      throw problem(409,'BILLING_RECOVERY_REVIEW','This billing operation requires review.');
    }
    const {token,job}=claim;
    try{
      const handler=handlers[job.kind];
      if(!handler){throw problem(409,'BILLING_RECOVERY_UNSUPPORTED','This operation requires review before recovery.');}
      const step=async(name,{input,key,read,write})=>{
        const saved=await journal.prepareStep({tenantId,id,token,name,input,inputHash:hash(input),key});
        if(saved.completed_at){return JSON.parse(saved.result_json);}
        // Readback is mandatory even within key retention, and is the only
        // permitted completion evidence once the conservative 23h window ends.
        let proof=await read(saved.input);
        if(!proof.confirmed){
          if(clock.now()-new Date(saved.created_at).getTime()>=23*3600000){
            throw problem(409,'BILLING_RECOVERY_EVIDENCE_REQUIRED','The older billing operation needs provider evidence before it can continue.');
          }
          await journal.renew({tenantId,id,token});
          await write(saved.input,saved.idempotency_key);
          proof=await read(saved.input);
          if(!proof.confirmed){throw problem(503,'BILLING_RECOVERY_UNCONFIRMED','The provider has not confirmed this billing step.');}
        }
        await journal.completeStep({tenantId,id,token,name,result:proof.result});
        return proof.result;
      };
      const result=await handler({job,step});
      return await journal.finish({tenantId,id,token,result});
    }catch(error){
      const code=recoveryCode(error);
      const review=error.status===403||error.status===409||job.attempts>=8;
      const saved=await journal.fail({tenantId,id,token,code,review,delaySeconds:recoveryDelay(job.attempts)});
      if(saved?.review){logger.error?.('[ManagementBilling] recovery_requires_review',{commandId:id,code});}
      throw error;
    }
  };
  return {run};
};
