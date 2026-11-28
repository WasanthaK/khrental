import {BILLING_ACCOUNT,problem} from './contract.js';
import {workspaceFee} from './localMarketFee.js';
import {localTaxSnapshot} from './localTax.js';
import {invoiceSubscription,objectId} from './stripe.js';

const review=()=>problem(409,'BILLING_LOCAL_INVOICE_REVIEW','Review this sandbox renewal before continuing.');
const marker='lk_recurring_fee_v1';
const metadataInteger=value=>typeof value==='string'&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))
  ?Number(value):null;

function savedTax(meta){
  if(!meta.tax_rule){return null;}
  const tax=localTaxSnapshot({
    id:meta.tax_rule,
    vat_status:meta.vat_status,
    vat_rate_basis_points:metadataInteger(meta.vat_rate_basis_points),
    vat_invoice_treatment:meta.vat_invoice_treatment,
    withholding_status:meta.withholding_status,
    withholding_rate_basis_points:metadataInteger(meta.withholding_rate_basis_points),
    withholding_basis:meta.withholding_basis,
    withholding_settlement_treatment:meta.withholding_settlement_treatment
  },metadataInteger(meta.platform_fee_minor));
  if(String(tax.vat.amountMinor)!==meta.vat_amount_minor||
    String(tax.withholding.amountMinor)!==meta.withholding_amount_minor||
    String(tax.grossInvoiceMinor)!==meta.invoice_total_minor||
    String(tax.netCashMinor)!==meta.net_cash_minor){throw review();}
  return tax;
}

function validateBinding(invoice,account){
  if(account.stripe_account_id!==BILLING_ACCOUNT||invoice.object!=='invoice'||invoice.livemode!==false||invoice.currency!=='lkr'||
    invoice.billing_reason!=='subscription_cycle'||account.market!=='LK'||
    objectId(invoice.customer)!==account.stripe_customer_id||!account.stripe_subscription_id||
    invoiceSubscription(invoice)!==account.stripe_subscription_id||!account.pricing_version_id||
    !Array.isArray(invoice.lines?.data)||invoice.lines.has_more!==false){throw review();}
}

function feeReceipt(invoice,account){
  validateBinding(invoice,account);
  const lines=invoice.lines.data;
  const base=lines.filter(l=>l.parent?.subscription_item_details?.subscription_item===account.stripe_item_id &&
    l.parent.subscription_item_details.proration===false && objectId(l.pricing?.price_details?.price)===account.stripe_price_id);
  const extra=lines.filter(l=>l.parent?.type==='invoice_item_details' && l.metadata?.quixo_fee===marker);
  if(base.length!==1||extra.length>1||lines.length!==1+extra.length||!Number.isSafeInteger(base[0].amount)||
    base[0].amount<0||base[0].currency!=='lkr'){throw review();}
  if(!extra.length){return {base:base[0]};}
  const line=extra[0],meta=line.metadata;
  const tax=savedTax(meta);
  const platformFeeMinor=tax?.platformFeeMinor??metadataInteger(meta.fee_total_minor);
  const invoiceTotalMinor=tax?.grossInvoiceMinor??platformFeeMinor;
  if(meta.quixo_invoice!==invoice.id||meta.pricing_version!==account.pricing_version_id.toLowerCase()||
    !meta.issuer_name||!meta.issuer_country||!meta.issuer_assignment||line.currency!=='lkr'||
    !Number.isSafeInteger(line.amount)||line.amount<0||platformFeeMinor===null||
    base[0].amount+line.amount!==invoiceTotalMinor){throw review();}
  return {base:base[0],receipt:{invoiceId:invoice.id,status:invoice.status,currency:'LKR',
    monthlyFeeMinor:platformFeeMinor,invoiceTotalMinor,pricingVersionId:meta.pricing_version,tax,
    issuer:{assignmentId:meta.issuer_assignment,legalName:meta.issuer_name,country:meta.issuer_country}}};
}

// Runs only on an explicitly scoped sandbox renewal. The invoice item retains
// the historical issuer alongside the once-rounded fee, including a zero excess.
export async function applyLocalRenewal({store,q,stripe,account,loadInvoice,invoiceId,issuerMarket='LK'}){
  if(!/^[A-Z]{2}$/.test(issuerMarket)){throw review();}
  const invoice=await loadInvoice(invoiceId);
  if(invoice.id!==invoiceId){throw review();}
  const {base,receipt}=feeReceipt(invoice,account);
  if(receipt){return receipt;}
  if(invoice.status!=='draft'||!Number.isSafeInteger(invoice.created)||invoice.created<=0){throw review();}
  const fee=await workspaceFee(store,q,{versionId:account.pricing_version_id,tenantId:account.tenant_id});
  const [version]=await q("SELECT rules_json FROM dbo.management_pricing_versions WHERE id=@id AND stripe_price_id=@price AND status='sandbox_published'",
    {id:account.pricing_version_id,price:account.stripe_price_id});
  if(!version||base.quantity!==fee.quantity||base.amount!==JSON.parse(version.rules_json).baseFeeMinor*fee.quantity){throw review();}
  const [issuer]=await q('SELECT * FROM dbo.management_invoice_issuer_at(@issuerMarket,@asOf)',
    {issuerMarket,asOf:new Date(invoice.created*1000)});
  const [taxRule]=await q('SELECT * FROM dbo.management_market_tax_rule_at(@issuerMarket,@asOf)',
    {issuerMarket,asOf:new Date(invoice.created*1000)});
  if(!issuer||!taxRule){throw review();}
  const tax=localTaxSnapshot(taxRule,fee.monthlyTotalMinor);
  const amount=tax.grossInvoiceMinor-base.amount;
  const body={customer:account.stripe_customer_id,invoice:invoiceId,currency:'lkr',amount,
    description:'Monthly agreed-rent fee adjustment and approved tax · '+issuer.legal_name+' ('+issuer.country_code+')',
    metadata:{quixo_fee:marker,quixo_invoice:invoiceId,pricing_version:account.pricing_version_id.toLowerCase(),
      platform_fee_minor:String(fee.monthlyTotalMinor),invoice_total_minor:String(tax.grossInvoiceMinor),
      tax_rule:tax.ruleId,vat_status:tax.vat.status,vat_rate_basis_points:String(tax.vat.rateBasisPoints),
      vat_invoice_treatment:tax.vat.treatment,vat_amount_minor:String(tax.vat.amountMinor),
      withholding_status:tax.withholding.status,withholding_rate_basis_points:String(tax.withholding.rateBasisPoints),
      withholding_basis:tax.withholding.basis,withholding_settlement_treatment:tax.withholding.treatment,
      withholding_amount_minor:String(tax.withholding.amountMinor),net_cash_minor:String(tax.netCashMinor),
      issuer_assignment:issuer.assignment_id,issuer_name:issuer.legal_name,issuer_country:issuer.country_code}};
  await stripe.request('POST','/v1/invoiceitems',body,'quixo-lk-renewal-'+invoiceId);
  const updated=await loadInvoice(invoiceId);
  const saved=feeReceipt(updated,account).receipt;
  if(updated.id!==invoiceId||!saved||saved.monthlyFeeMinor!==fee.monthlyTotalMinor||
    saved.tax?.ruleId!==tax.ruleId||saved.issuer.assignmentId!==issuer.assignment_id){throw review();}
  return saved;
}

export function issuedLocalReceipt(invoice,account){
  if(!invoice.status_transitions?.finalized_at||invoice.status==='draft'){throw review();}
  const {receipt}=feeReceipt(invoice,account);
  if(!receipt){throw review();}
  return receipt;
}
