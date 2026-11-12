import {createBillingStore} from '../src/api/managementBilling/store.js';
import {createRecoveryWorker} from '../src/api/managementBilling/recoveryWorker.js';
import {closeMssqlPool} from '../src/api/mssql/pool.js';

// Deliberately no apply option or provider client. This command is SELECT-only.
try{
  if(process.argv.length>2){throw new Error('This command accepts no arguments and is always read-only.');}
  const worker=createRecoveryWorker({store:createBillingStore(),service:null});
  console.log(JSON.stringify(await worker.run(),null,2));
}catch(error){
  console.error('Recovery inspection failed:',error.code||'RECOVERY_INSPECTION_FAILED');
  process.exitCode=1;
}finally{await closeMssqlPool();}
