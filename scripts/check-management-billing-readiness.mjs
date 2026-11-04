import {createStripeClient} from '../src/api/managementBilling/stripe.js';
import {BILLING_ACCOUNT,BILLING_PRICE,BILLING_PORTAL} from '../src/api/managementBilling/contract.js';

// Read-only, curated output. Never print keys, provider response bodies, customers or endpoint secrets.
const configured=Boolean(process.env.STRIPE_SANDBOX_SECRET_KEY);
const webhookSecretConfigured=Boolean(process.env.STRIPE_SANDBOX_WEBHOOK_SECRET);
const report={sandboxSecretConfigured:configured,webhookSecretConfigured,accountMatched:false,catalogMatched:false,portalRestricted:false,
  webhookRegistered:false,liveReadinessEstablished:false};
if(configured){
  const stripe=createStripeClient({env:{...process.env,MANAGEMENT_BILLING_SANDBOX_ENABLED:'true',STRIPE_SANDBOX_ACCOUNT_ID:BILLING_ACCOUNT}});
  try{
    await stripe.assertAccount();report.accountMatched=true;
    const price=await stripe.request('GET',`/v1/prices/${BILLING_PRICE}`);
    report.catalogMatched=price.livemode===false&&price.active&&price.unit_amount===500&&price.currency==='usd'&&
      price.recurring?.interval==='month'&&price.recurring.usage_type==='licensed'&&!price.recurring.trial_period_days;
    const portal=await stripe.request('GET',`/v1/billing_portal/configurations/${BILLING_PORTAL}`);
    report.portalRestricted=portal.active&&!portal.features?.subscription_update?.enabled&&!portal.features?.subscription_cancel?.enabled&&!portal.features?.subscription_pause?.enabled;
    const endpoints=await stripe.request('GET','/v1/webhook_endpoints',{limit:100});
    report.webhookRegistered=endpoints.data.some(endpoint=>endpoint.url==='https://app.quixo.homes/api/management-billing/webhook'&&endpoint.status==='enabled'&&endpoint.livemode===false);
  }catch(error){report.errorCode=error.code || 'READINESS_LOOKUP_FAILED';}
}
report.sandboxRuntimeReady=configured&&webhookSecretConfigured&&report.accountMatched&&report.catalogMatched&&report.portalRestricted&&report.webhookRegistered;
console.log('MANAGEMENT_BILLING_READINESS='+JSON.stringify(report));
if(process.env.GITHUB_STEP_SUMMARY){
  const {appendFileSync}=await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Management billing readiness\n\n'+Object.entries(report).map(([key,value])=>`- ${key}: ${value}`).join('\n')+'\n\nRead-only check. No Stripe or application configuration was changed. Sandbox readiness does not establish live merchant readiness.\n');
}
