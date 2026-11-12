import {createBillingStore} from '../src/api/managementBilling/store.js';
import {createStripeClient} from '../src/api/managementBilling/stripe.js';
import {createBillingInvariantInspector,readOnlyStripe} from '../src/api/managementBilling/invariants.js';
import {closeMssqlPool} from '../src/api/mssql/pool.js';

try{
  if(process.argv.length!==3){throw new Error('Supply exactly one workspace UUID. This command is read-only.');}
  const inspector=createBillingInvariantInspector({store:createBillingStore(),stripe:readOnlyStripe(createStripeClient())});
  const result=await inspector.inspect(process.argv[2]);
  console.log(JSON.stringify(result,null,2));
  if(result.status!=='consistent'){process.exitCode=2;}
}catch(error){
  console.error('Billing invariant inspection failed:',error.code||'BILLING_INSPECTION_FAILED');process.exitCode=1;
}finally{await closeMssqlPool();}
