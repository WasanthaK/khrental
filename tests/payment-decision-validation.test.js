import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createBillingRouter } from '../src/api/platform/billingRouter.js';

test('actual payment route rejects non-boolean decisions before database access', async () => {
  const app=express(); app.use(express.json());
  app.use((req,_res,next)=>{
    req.tenantContext={tenantId:'11111111-1111-4111-8111-111111111111',user:{id:'actor',role:'admin'},
      membership:{tenant_id:'11111111-1111-4111-8111-111111111111',role:'admin',status:'active'}};
    next();
  });
  app.use(createBillingRouter());
  // Express selects an error handler using its four-argument arity.
  // eslint-disable-next-line no-unused-vars
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try {
    for (const approved of [undefined,null,'false','true','',0,1,[],{},['false']]) {
      const response=await fetch(`http://127.0.0.1:${server.address().port}/invoices/22222222-2222-4222-8222-222222222222/verify-payment`,{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved,notes:'Synthetic reason'})});
      assert.equal(response.status,400,JSON.stringify(approved));
      assert.equal((await response.json()).code,'PAYMENT_DECISION_BOOLEAN_REQUIRED');
    }
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});
