// Invoice master data is administrator-entered; never fill missing business facts.
const fail = (field, message) => Object.assign(new Error(message), {
  status: 400, code: 'INVALID_INVOICE_MASTER_DATA', details: { field }
});
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const clean = (value, field, max) => {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw fail(field, 'Enter a valid text value.');
  const v = value.trim();
  if (v.length > max || /[\u0000-\u001f\u007f]/.test(v)) throw fail(field, 'Value is too long or contains invalid characters.');
  return v;
};
const contact = (data, key, max = 255) => clean(data[key], key, max);
const email = (data, key) => {
  const v = contact(data,key,320);
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw fail(key,'Enter a valid email address.');
  return v;
};
const phone = (data,key) => {
  const v = contact(data,key,100);
  if (v && !/^[+0-9() .-]{5,100}$/.test(v)) throw fail(key,'Enter a valid contact telephone number.');
  return v;
};
const assertKeys = (data, keys) => {
  if (!isObject(data)) throw fail('body','Provide a structured invoice profile.');
  const extras = Object.keys(data).filter(key => !keys.includes(key));
  if (extras.length) throw fail(extras[0], 'Field is not editable in invoice master data.');
};
const issuerKeys=['legalName','postalAddress','supportEmail','supportPhone','website'];
export const normalizeIssuerProfile = input => {
  assertKeys(input, issuerKeys);
  const result = {
    legalName: contact(input,'legalName',200),
    postalAddress: contact(input,'postalAddress',500),
    supportEmail: email(input,'supportEmail'),
    supportPhone: phone(input,'supportPhone'),
    website: contact(input,'website',300)
  };
  if (result.website && !/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:[/?#][^\s]*)?$/i.test(result.website)) {
    throw fail('website','Use an HTTPS website URL.');
  }
  return result;
};
const partyKeys=['managementMode','externalManagerName','externalManagerAddress',
  'externalManagerEmail','externalManagerPhone','propertyOwnerName','propertyOwnerAddress',
  'issuerRole','issuerAuthorityConfirmed'];
export const normalizePropertyParties = input => {
  assertKeys(input, partyKeys);
  const managementMode = input.managementMode || 'tenant';
  if (!['tenant','outsourced'].includes(managementMode)) throw fail('managementMode','Choose organization-managed or outsourced.');
  const issuerRole = input.issuerRole || 'organization';
  if (!['organization','owner','manager'].includes(issuerRole)) throw fail('issuerRole','Choose an authorized issuer role.');
  const result = {
    managementMode, issuerRole,
    externalManagerName: contact(input,'externalManagerName',200),
    externalManagerAddress: contact(input,'externalManagerAddress',500),
    externalManagerEmail: email(input,'externalManagerEmail'),
    externalManagerPhone: phone(input,'externalManagerPhone'),
    propertyOwnerName: contact(input,'propertyOwnerName',200),
    propertyOwnerAddress: contact(input,'propertyOwnerAddress',500),
    issuerAuthorityConfirmed: input.issuerAuthorityConfirmed === true
  };
  if (input.issuerAuthorityConfirmed !== undefined && typeof input.issuerAuthorityConfirmed !== 'boolean') {
    throw fail('issuerAuthorityConfirmed','Explicit confirmation must be a boolean.');
  }
  if (managementMode === 'outsourced' &&
      (!result.externalManagerName || !result.externalManagerAddress ||
       (!result.externalManagerEmail && !result.externalManagerPhone))) {
    throw fail('externalManagerName','Outsourced management requires name, address and a verified contact channel.');
  }
  if (managementMode === 'tenant' && ['externalManagerName','externalManagerAddress','externalManagerEmail','externalManagerPhone'].some(k => !!result[k])) {
    throw fail('managementMode','Remove external manager details for organization-managed properties.');
  }
  if (issuerRole === 'manager' && managementMode !== 'outsourced') throw fail('issuerRole','Manager override requires outsourced management.');
  if (issuerRole === 'owner' && (!result.propertyOwnerName || !result.propertyOwnerAddress)) {
    throw fail('propertyOwnerName','Owner-issued invoices need the verified owner name and address.');
  }
  if (issuerRole !== 'organization' && !result.issuerAuthorityConfirmed) {
    throw fail('issuerAuthorityConfirmed','Confirm contractual authority before selecting another invoice issuer.');
  }
  if (issuerRole === 'organization' && result.issuerAuthorityConfirmed) {
    throw fail('issuerAuthorityConfirmed','Issuer override confirmation is only for a different issuer.');
  }
  return result;
};
export const normalizePropertyBilling = input => {
  assertKeys(input,['beneficiaryName','billingContactName','billingContactEmail','billingContactPhone','parties']);
  return {
    beneficiaryName:contact(input,'beneficiaryName',255),
    billingContactName:contact(input,'billingContactName',255),
    billingContactEmail:email(input,'billingContactEmail'),
    billingContactPhone:phone(input,'billingContactPhone'),
    parties:normalizePropertyParties(input.parties || {})
  };
};
export const normalizeUnitBilling = input => {
  assertKeys(input,['beneficiaryName']);
  return {beneficiaryName:contact(input,'beneficiaryName',255)};
};
export const editableFieldsChanged = (oldValue, nextValue) =>
  Object.keys(nextValue).filter(field=>JSON.stringify(oldValue?.[field]??null)!==JSON.stringify(nextValue[field]));
