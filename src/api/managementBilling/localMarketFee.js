import {parseAgreementTerms} from '../platform/billingLifecycle.js';
import {identifier,parsePricing,problem} from './contract.js';

const rentProblem=()=>problem(409,'BILLING_AGREED_RENT_UNCONFIRMED','Confirm the active agreement’s monthly LKR rent before calculating its fee.');

function agreedRentMinor(agreement) {
  const terms=parseAgreementTerms(agreement.terms);
  if (terms.currency && terms.currency!=='LKR') {throw rentProblem();}
  // Preserve the established agreement fallback when the legacy rent column is zero.
  const contractRent=terms.monthlyRent ?? terms.monthlyrent;
  const rent=agreement.rentamount==null || (Number(agreement.rentamount)===0 && contractRent!=null)
    ? contractRent : agreement.rentamount;
  const match=/^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(rent));
  if (!match) {throw rentProblem();}
  const cents=Number(match[1])*100+Number((match[2]||'').padEnd(2,'0'));
  if (cents>100000000000) {throw rentProblem();}
  return cents;
}

export function localMarketFee(rules,inventory,agreements) {
  if(rules.market!=='LK' || rules.billingCurrency!=='LKR' || rules.excessPolicy!=='agreed_rent_excess'){
    throw problem(400,'BILLING_LOCAL_RULE_REQUIRED','Select the local LKR pricing rule.');
  }
  const active=new Map();
  const managedProperties=new Set(inventory.map(item=>identifier(item.propertyId)));
  const keys=new Set(inventory.map(item=>item.key));
  for(const agreement of agreements){
    const property=identifier(agreement.propertyid);
    if(!managedProperties.has(property)){continue;}
    const key=agreement.unitid?'unit:'+identifier(agreement.unitid):'property:'+property;
    if(active.has(key) || (!agreement.unitid && !keys.has(key))){
      throw problem(409,'BILLING_AGREEMENT_SCOPE','Resolve overlapping or ambiguous active agreements before calculating the fee.');
    }
    active.set(key,agreement);
  }
  const lines=inventory.map(item=>{
    const agreement=active.get(item.key);
    if(agreement && identifier(agreement.propertyid)!==identifier(item.propertyId)){throw rentProblem();}
    const rentMinor=agreement?agreedRentMinor(agreement):0;
    const excess=BigInt(Math.max(0,rentMinor-rules.includedRentMinor));
    const fee=BigInt(rules.baseFeeMinor)+(excess*BigInt(rules.excessRateBasisPoints)+5000n)/10000n;
    return {key:item.key,label:item.label,rentBasis:agreement?'active_agreement':'vacant',monthlyRentMinor:rentMinor,monthlyFeeMinor:Number(fee)};
  });
  const total=lines.reduce((sum,line)=>sum+BigInt(line.monthlyFeeMinor),0n);
  if(total>BigInt(Number.MAX_SAFE_INTEGER)){throw problem(400,'BILLING_VALUE_INVALID','The total exceeds the supported amount.');}
  return {currency:rules.billingCurrency,quantity:lines.length,monthlyTotalMinor:Number(total),lines,taxIncluded:false};
}

export async function workspaceFee(store,q,{rules,versionId,tenantId}) {
  if(versionId) {
    const [version]=await q('SELECT rules_json FROM dbo.management_pricing_versions WHERE id=@versionId',{versionId});
    if(!version){throw problem(404,'BILLING_PRICING_NOT_FOUND','Pricing version not found.');}
    rules=parsePricing(JSON.parse(version.rules_json));
  }
  const [tenant]=await q("SELECT id FROM dbo.tenants WHERE id=@tenantId AND [plan]='development-testing' AND status='active'",{tenantId});
  if (!tenant){throw problem(404,'BILLING_TEST_WORKSPACE_REQUIRED','Choose an active sandbox workspace.');}
  const inventory=await store.inventory(tenantId,q);
  const properties=await q('SELECT id,country_code FROM dbo.properties WHERE tenant_id=@tenantId',{tenantId});
  const markets=new Map(properties.map(row=>[identifier(row.id),row.country_code]));
  if(inventory.some(item=>markets.get(identifier(item.propertyId))!==rules.market)){
    throw problem(409,'BILLING_STOCK_MARKET','The managed dwellings must belong to the selected country.');
  }
  const agreements=await q("SELECT propertyid,unitid,rentamount,terms FROM dbo.agreements WHERE tenant_id=@tenantId AND status='active'",{tenantId});
  return {...localMarketFee(rules,inventory,agreements),pricingVersionId:versionId??null};
}

export const previewWorkspaceFee=(store,input)=>store.locked(input.tenantId,q=>workspaceFee(store,q,input));
