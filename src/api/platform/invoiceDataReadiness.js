// Pure, read-only preflight contract for a future governed invoice redesign.
// This module must not be wired into issuing until the administrator-owned
// invoice profile and beneficiary fields have been migrated and configured.
// Missing business facts must never be synthesized from unrelated records.
const text = value => typeof value === 'string' ? value.trim() : '';
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value));
const amountCents = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export const INVOICE_READINESS_DESTINATIONS = Object.freeze({
  issuer: '/dashboard/settings',
  renter: '/dashboard/rentees',
  property: '/dashboard/properties',
  billing: '/dashboard/invoices'
});

const missingEntry = (field, label, owner, reason = 'missing') => Object.freeze({
  field, label, owner, reason, adminPath: INVOICE_READINESS_DESTINATIONS[owner]
});

/**
 * Validate actual tenant-scoped data for a DRAFT invoice, before generating
 * any bank reference, issuing the invoice or sending email. No DB writes.
 * Fields here are a proposed future contract, not evidence of populated data.
 */
export const inspectInvoiceIssuanceReadiness = ({
  invoice, components, issuerProfile, bankInstructions
} = {}) => {
  const problems = [];
  const need = (value, field, label, owner) => {
    if (!text(value)) problems.push(missingEntry(field, label, owner));
  };
  if (!invoice || typeof invoice !== 'object') {
    problems.push(missingEntry('invoice', 'Draft invoice', 'billing'));
    return { ready: false, missing: problems };
  }
  need(invoice.tenant_id, 'invoice.tenant_id', 'Organization', 'billing');
  need(invoice.renteeid, 'invoice.renteeid', 'Renter association', 'renter');
  need(invoice.propertyid, 'invoice.propertyid', 'Property association', 'property');
  need(invoice.rentee_name, 'invoice.rentee_name', 'Renter name', 'renter');
  if (!validEmail(invoice.rentee_email)) {
    problems.push(missingEntry('invoice.rentee_email', 'Valid renter delivery email', 'renter', 'invalid_or_missing'));
  }
  need(invoice.property_name, 'invoice.property_name', 'Property name', 'property');
  need(invoice.property_address, 'invoice.property_address', 'Property address', 'property');
  need(invoice.billingperiod, 'invoice.billingperiod', 'Billing period', 'billing');
  if (!invoice.duedate || !Number.isFinite(new Date(invoice.duedate).getTime())) {
    problems.push(missingEntry('invoice.duedate', 'Valid payment due date', 'billing', 'invalid_or_missing'));
  }
  // Issued-at and the numeric reference do not exist until successful issue.
  // Requiring either here would deadlock first issuance.
  const total = amountCents(invoice.totalamount);
  const componentAmounts = Array.isArray(components) ? components.map(item => amountCents(item?.amount)) : [];
  const componentsValid = componentAmounts.length > 0 && componentAmounts.every(n => n !== null)
    && components.every(item => text(item?.description) || text(item?.component_type));
  if (!componentsValid || total === null || total <= 0 || componentAmounts.reduce((sum, n) => sum + n, 0) !== total) {
    problems.push(missingEntry('invoice.components', 'Reconciled itemized charges and positive invoice total', 'billing', 'invalid_or_missing'));
  }

  // A trading name is not automatically an authorized legal issuer.
  need(issuerProfile?.legalName, 'issuer.legalName', 'Verified invoice issuer name', 'issuer');
  need(issuerProfile?.postalAddress, 'issuer.postalAddress', 'Invoice issuer postal address', 'issuer');
  if (!validEmail(issuerProfile?.supportEmail) && !text(issuerProfile?.supportPhone)) {
    problems.push(missingEntry('issuer.supportContact', 'Verified invoice support email or phone', 'issuer', 'invalid_or_missing'));
  }

  // Only complete, verified bank instructions are acceptable. The beneficiary
  // cannot be inferred from the property name or the organization name.
  need(bankInstructions?.bankName, 'bank.bankName', 'Bank name', 'property');
  need(bankInstructions?.branch, 'bank.branch', 'Bank branch', 'property');
  need(bankInstructions?.accountNumber, 'bank.accountNumber', 'Bank account number', 'property');
  need(bankInstructions?.beneficiaryName, 'bank.beneficiaryName', 'Verified bank beneficiary name', 'property');
  if (!['unit', 'property'].includes(bankInstructions?.source)) {
    problems.push(missingEntry('bank.source', 'Verified bank destination source', 'property', 'invalid_or_missing'));
  }
  return { ready: problems.length === 0, missing: problems };
};
