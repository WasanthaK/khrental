import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const client=read('../src/services/platformClient.js');
const payment=read('../src/services/paymentService.js');
test('payment reminder uses authenticated tenant context and correct dedicated action',()=>{
 assert.match(client,/sendInvoicePaymentReminder = async/);
 assert.match(client,/billingRequest\(`\/invoices\/\$\{encodeURIComponent\(invoiceId\)\}\/send-reminder`/);
 assert.match(client,/buildRequestContextHeaders/);
 assert.match(payment,/await sendInvoicePaymentReminder\(invoiceId\)/);
 assert.doesNotMatch(payment,/fetch\(`\/api\/billing\/invoices/);
});
test('reminder success requires exact invoice acknowledgement',()=>{
 assert.match(payment,/data\.sent !== true/);
 assert.match(payment,/data\.invoiceId/);
 assert.match(payment,/return \{ success: false, error: error\.message \}/);
 const router=read('../src/api/platform/billingAdjustmentsRouter.js');
 assert.match(router,/router\.post\('\/invoices\/:invoiceId\/send-reminder'/);
 assert.match(router,/requireInvoiceManage\(req\)/);
 assert.match(router,/requirePropertyScope\(req, invoice\.propertyid\)/);
});
