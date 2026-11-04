import crypto from 'node:crypto';

export const problem = (status, code, message) => Object.assign(new Error(message), {status, code});
export const BILLING_ACCOUNT = 'acct_1UTgcdQ4sARuLNQa';
export const BILLING_PRODUCT = 'prod_VUjs23Auy0fWYE';
export const BILLING_PRICE = 'price_1UTkOuQ4sARuLNQaJnbZ03Hs';
export const BILLING_PORTAL = 'bpc_1UTku3Q4sARuLNQanUojlMVj';
export const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const identifier = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw problem(400, 'BILLING_ID_INVALID', 'A valid record identifier is required.');
  return value.toLowerCase();
};
const integer = (value, min, max, label) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw problem(400, 'BILLING_VALUE_INVALID', `${label} is outside the supported range.`);
  return value;
};
export const reason = value => {
  if (typeof value !== 'string' || value.trim().length < 10 || value.trim().length > 1000)
    throw problem(400, 'BILLING_REASON_REQUIRED', 'Include a decision or research note of 10–1,000 characters.');
  return value.trim();
};
export const parsePricing = input => {
  const keys=['market','billingCurrency','baseFeeMinor','rentCurrency','includedRentMinor','excessPolicy','effectiveAt','reason'];
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!keys.includes(key)) || keys.some(key=>!(key in input)))
    throw problem(400,'BILLING_FIELDS_INVALID','Submit the complete pricing rule without additional fields.');
  if (!input || !['LK','BN'].includes(input.market))
    throw problem(400, 'BILLING_MARKET_INVALID', 'Select Sri Lanka or Brunei.');
  // Additional billing currencies/FX and surcharges need an explicit commercial contract.
  if (input.billingCurrency !== 'USD' || input.rentCurrency !== ({LK:'LKR',BN:'BND'})[input.market])
    throw problem(400, 'BILLING_CURRENCY_INVALID', 'Use USD billing and the selected market’s rent currency.');
  if (!['pending','none'].includes(input.excessPolicy))
    throw problem(400, 'BILLING_EXCESS_UNAPPROVED', 'Percentage and FX adjustments are not approved for launch.');
  if (input.effectiveAt !== null && (typeof input.effectiveAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(input.effectiveAt) ||
      !Number.isFinite(Date.parse(input.effectiveAt)) || new Date(input.effectiveAt).toISOString().replace('.000Z','Z')!==input.effectiveAt.replace('.000Z','Z')))
    throw problem(400, 'BILLING_DATE_INVALID', 'Use an explicit UTC effective date.');
  return {
    market:input.market,
    billingCurrency:input.billingCurrency,
    baseFeeMinor:integer(input.baseFeeMinor, 1, 10000000, 'Monthly fee'),
    rentCurrency:input.rentCurrency,
    includedRentMinor:input.includedRentMinor === null ? null : integer(input.includedRentMinor, 0, 100000000000, 'Included monthly rent'),
    excessPolicy:input.excessPolicy,
    effectiveAt:input.effectiveAt === null ? null : new Date(input.effectiveAt).toISOString(),
    reason:reason(input.reason)
  };
};

export const pricingPreview = (rule, quantity) => {
  integer(quantity, 1, 10000, 'Dwelling quantity');
  return {quantity, monthlyBaseMinor:rule.baseFeeMinor * quantity, currency:rule.billingCurrency,
    ready:rule.includedRentMinor !== null && rule.excessPolicy === 'none' && Boolean(rule.effectiveAt),
    adjustmentApplied:false, taxIncluded:false,
    appliesTo:'new_subscriptions_only'};
};

const residential = new Set(['house','condominium','apartment','apartment complex']);
export const dwellingInventory = ({tenantId, properties, units}) => {
  const tenant = String(tenantId).toLowerCase();
  const seen = new Set();
  const result = [];
  for (const property of properties) {
    if (String(property.tenant_id).toLowerCase() !== tenant || !residential.has(String(property.propertytype || '').toLowerCase())) continue;
    const children = units.filter(u => String(u.propertyid).toLowerCase() === String(property.id).toLowerCase());
    if (children.some(u => String(u.tenant_id).toLowerCase() !== tenant))
      throw problem(409, 'BILLING_INVENTORY_SCOPE', 'A dwelling has inconsistent organization ownership.');
    // Occupancy and public visibility deliberately do not enter this calculation.
    for (const item of children.length ? children : [property]) {
      const kind = children.length ? 'unit' : 'property';
      const key = `${kind}:${String(item.id).toLowerCase()}`;
      if (seen.has(key)) throw problem(409, 'BILLING_DUPLICATE_DWELLING', 'Duplicate dwelling identity.');
      seen.add(key);
      result.push({key, propertyId:property.id, unitId:kind === 'unit' ? item.id : null,
        label:kind === 'unit' ? `${property.name} · ${item.unitnumber}` : property.name});
    }
  }
  return result.sort((a,b) => a.key.localeCompare(b.key));
};

export const entitlement = (account, now = Date.now()) => {
  if (!account) return {state:'not_enrolled', management:false, historicalAccess:true};
  if (account.risk_hold) return {state:'review_required', management:false, historicalAccess:true};
  if (account.comp_type === 'ongoing' || (account.comp_type === 'fixed' && Date.parse(account.comp_expires_at) > now))
    return {state:'complimentary', management:true, historicalAccess:true};
  const paidUntil = Date.parse(account.paid_through || '');
  if (account.initial_payment_verified && account.subscription_status === 'active' && paidUntil > now)
    return {state:account.cancel_at_period_end ? 'ending' : 'active', management:true, historicalAccess:true};
  // Initial failures, trials, unpaid and terminal subscriptions never acquire a grace trial.
  const graceStart = Date.parse(account.grace_started_at || '');
  if (account.subscription_status === 'past_due' && account.initial_payment_verified &&
      Number.isFinite(graceStart) && now >= graceStart && now < graceStart + 7 * 86400000)
    return {state:'grace', management:true, historicalAccess:true, graceEndsAt:new Date(graceStart + 7 * 86400000).toISOString()};
  return {state:account.initial_payment_verified ? 'read_only' : 'payment_pending', management:false, historicalAccess:true};
};

export const verifyStripeSignature = ({body, signature, secret, now = Date.now()}) => {
  if (!Buffer.isBuffer(body) || !secret || typeof signature !== 'string')
    throw problem(400, 'STRIPE_SIGNATURE_INVALID', 'Invalid webhook signature.');
  const parts = signature.split(',').map(part => part.split('='));
  const timestamps = parts.filter(([key]) => key === 't');
  const timestamp = timestamps.length === 1 && /^\d+$/.test(timestamps[0][1]) ? Number(timestamps[0][1]) : NaN;
  if (!Number.isSafeInteger(timestamp) || Math.abs(now / 1000 - timestamp) > 300)
    throw problem(400, 'STRIPE_SIGNATURE_INVALID', 'Invalid webhook signature.');
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest();
  const valid = parts.filter(([key, value]) => key === 'v1' && /^[0-9a-f]{64}$/.test(value || ''))
    .some(([,value]) => crypto.timingSafeEqual(expected, Buffer.from(value, 'hex')));
  if (!valid) throw problem(400, 'STRIPE_SIGNATURE_INVALID', 'Invalid webhook signature.');
  let event;
  try { event = JSON.parse(body.toString('utf8')); } catch { throw problem(400, 'STRIPE_EVENT_INVALID', 'Invalid webhook body.'); }
  if (!/^evt_[a-zA-Z0-9]+$/.test(event?.id || '') || typeof event.type !== 'string' || !event.data?.object || event.livemode !== false)
    throw problem(400, 'STRIPE_EVENT_INVALID', 'Only valid sandbox events are accepted.');
  if (event.account && event.account !== BILLING_ACCOUNT)
    throw problem(400, 'STRIPE_ACCOUNT_INVALID', 'Webhook account does not match this integration.');
  return event;
};
