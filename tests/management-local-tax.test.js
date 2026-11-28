import assert from 'node:assert/strict';
import test from 'node:test';
import {localTaxSnapshot} from '../src/api/managementBilling/localTax.js';

const id='11111111-1111-4111-8111-111111111111';
const disabled={id,vat_status:'disabled',vat_rate_basis_points:0,vat_invoice_treatment:'none',
  withholding_status:'disabled',withholding_rate_basis_points:0,withholding_basis:'none',
  withholding_settlement_treatment:'none'};

test('disabled treatment preserves the platform fee and records zero tax',()=>{
  assert.deepEqual(localTaxSnapshot(disabled,300000),{
    ruleId:id,platformFeeMinor:300000,
    vat:{status:'disabled',treatment:'none',rateBasisPoints:0,amountMinor:0},
    withholding:{status:'disabled',basis:'none',treatment:'none',rateBasisPoints:0,amountMinor:0},
    grossInvoiceMinor:300000,netCashMinor:300000
  });
});

test('exclusive VAT and settlement withholding use exact half-up minor-unit arithmetic',()=>{
  const result=localTaxSnapshot({...disabled,vat_status:'enabled',vat_rate_basis_points:1800,
    vat_invoice_treatment:'exclusive',withholding_status:'enabled',withholding_rate_basis_points:500,
    withholding_basis:'gross_invoice',withholding_settlement_treatment:'deducted_from_settlement'},300001);
  assert.equal(result.vat.amountMinor,54000);
  assert.equal(result.grossInvoiceMinor,354001);
  assert.equal(result.withholding.amountMinor,17700);
  assert.equal(result.netCashMinor,336301);
});

test('inclusive VAT extracts the tax portion without increasing the issued total',()=>{
  const result=localTaxSnapshot({...disabled,vat_status:'enabled',vat_rate_basis_points:1800,
    vat_invoice_treatment:'inclusive'},118000);
  assert.equal(result.vat.amountMinor,18000);
  assert.equal(result.grossInvoiceMinor,118000);
});

test('incomplete or inconsistent signed treatment fails closed',()=>{
  assert.throws(()=>localTaxSnapshot({...disabled,vat_status:'enabled'},300000),
    {code:'BILLING_LOCAL_TAX_REVIEW'});
  assert.throws(()=>localTaxSnapshot({...disabled,withholding_status:'enabled',
    withholding_rate_basis_points:500},300000),{code:'BILLING_LOCAL_TAX_REVIEW'});
});
