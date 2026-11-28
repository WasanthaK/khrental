import {problem} from './contract.js';

const review=()=>problem(409,'BILLING_LOCAL_TAX_REVIEW','Review the approved tax treatment before continuing.');
const integer=(value,min,max)=>{
  const parsed=typeof value==='string'&&/^\d+$/.test(value)?Number(value):value;
  if(!Number.isSafeInteger(parsed)||parsed<min||parsed>max){throw review();}
  return parsed;
};
const halfUp=(amount,rate,denominator=10000n)=>
  Number((BigInt(amount)*BigInt(rate)*2n+denominator)/(2n*denominator));

export function localTaxSnapshot(rule,platformFeeMinor){
  if(!rule||!Number.isSafeInteger(platformFeeMinor)||platformFeeMinor<0){throw review();}
  const vatStatus=rule.vat_status;
  const vatTreatment=rule.vat_invoice_treatment;
  const vatRate=integer(rule.vat_rate_basis_points,0,10000);
  const withholdingStatus=rule.withholding_status;
  const withholdingBasis=rule.withholding_basis;
  const withholdingTreatment=rule.withholding_settlement_treatment;
  const withholdingRate=integer(rule.withholding_rate_basis_points,0,10000);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rule.id)||
    !['disabled','enabled'].includes(vatStatus)||!['none','exclusive','inclusive'].includes(vatTreatment)||
    (vatStatus==='disabled'&&(vatRate!==0||vatTreatment!=='none'))||
    (vatStatus==='enabled'&&(vatRate===0||vatTreatment==='none'))||
    !['disabled','enabled'].includes(withholdingStatus)||
    !['none','platform_fee','gross_invoice'].includes(withholdingBasis)||
    !['none','deducted_from_settlement'].includes(withholdingTreatment)||
    (withholdingStatus==='disabled'&&(withholdingRate!==0||withholdingBasis!=='none'||withholdingTreatment!=='none'))||
    (withholdingStatus==='enabled'&&(withholdingRate===0||withholdingBasis==='none'||withholdingTreatment!=='deducted_from_settlement'))){
    throw review();
  }
  const vatMinor=vatStatus==='disabled'?0:vatTreatment==='exclusive'
    ?halfUp(platformFeeMinor,vatRate)
    :halfUp(platformFeeMinor,vatRate,10000n+BigInt(vatRate));
  const grossInvoiceMinor=platformFeeMinor+(vatTreatment==='exclusive'?vatMinor:0);
  const withholdingBaseMinor=withholdingBasis==='platform_fee'?platformFeeMinor:
    withholdingBasis==='gross_invoice'?grossInvoiceMinor:0;
  const withholdingMinor=withholdingStatus==='enabled'?halfUp(withholdingBaseMinor,withholdingRate):0;
  return {
    ruleId:rule.id.toLowerCase(),platformFeeMinor,
    vat:{status:vatStatus,treatment:vatTreatment,rateBasisPoints:vatRate,amountMinor:vatMinor},
    withholding:{status:withholdingStatus,basis:withholdingBasis,treatment:withholdingTreatment,
      rateBasisPoints:withholdingRate,amountMinor:withholdingMinor},
    grossInvoiceMinor,netCashMinor:grossInvoiceMinor-withholdingMinor
  };
}
