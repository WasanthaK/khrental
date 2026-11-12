import {billingClock} from './clock.js';
import crypto from 'node:crypto';
import {normalizePropertyRentalValues} from '../../utils/listingCategories.js';

export const problem = (status, code, message) => Object.assign(new Error(message), {status, code});
export const BILLING_ACCOUNT = 'acct_1UTgcdQ4sARuLNQa';
export const BILLING_PRODUCT = 'prod_VUjs23Auy0fWYE';
export const BILLING_PRICE = 'price_1UTkOuQ4sARuLNQaJnbZ03Hs';
export const BILLING_PORTAL = 'bpc_1UTku3Q4sARuLNQanUojlMVj';
export const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const identifier = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    {throw problem(400, 'BILLING_ID_INVALID', 'A valid record identifier is required.');}
  return value.toLowerCase();
};
const integer = (value, min, max, label) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    {throw problem(400, 'BILLING_VALUE_INVALID', `${label} is outside the supported range.`);}
  return value;
};
export const reason = value => {
  if (typeof value !== 'string' || value.trim().length < 10 || value.trim().length > 1000)
    {throw problem(400, 'BILLING_REASON_REQUIRED', 'Include a decision or research note of 10–1,000 characters.');}
  return value.trim();
};
export const parsePricing = input => {
  const keys=['market','billingCurrency','baseFeeMinor','rentCurrency','includedRentMinor','excessPolicy','effectiveAt','reason'];
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!keys.includes(key)) || keys.some(key=>!(key in input)))
    {throw problem(400,'BILLING_FIELDS_INVALID','Submit the complete pricing rule without additional fields.');}
  if (!input || !['LK','BN'].includes(input.market))
    {throw problem(400, 'BILLING_MARKET_INVALID', 'Select Sri Lanka or Brunei.');}
  // Additional billing currencies/FX and surcharges need an explicit commercial contract.
  if (input.billingCurrency !== 'USD' || input.rentCurrency !== ({LK:'LKR',BN:'BND'})[input.market])
    {throw problem(400, 'BILLING_CURRENCY_INVALID', 'Use USD billing and the selected market’s rent currency.');}
  if (!['pending','none'].includes(input.excessPolicy))
    {throw problem(400, 'BILLING_EXCESS_UNAPPROVED', 'Percentage and FX adjustments are not approved for launch.');}
  if (input.effectiveAt !== null && (typeof input.effectiveAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(input.effectiveAt) ||
      !Number.isFinite(Date.parse(input.effectiveAt)) || new Date(input.effectiveAt).toISOString().replace('.000Z','Z')!==input.effectiveAt.replace('.000Z','Z')))
    {throw problem(400, 'BILLING_DATE_INVALID', 'Use an explicit UTC effective date.');}
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

const residential = new Set(['house','condo','condominium','apartment','apartment complex']);
export const stagedStock = input => {
  if(!Array.isArray(input)||!input.length||input.length>100)
    {throw problem(400,'BILLING_STOCK_INVALID','Prepare between 1 and 100 property or unit records at a time.');}
  const seen=new Set();
  return input.map(record=>{
    if(!record||!['property','unit'].includes(record.kind)||Object.keys(record).some(k=>!['kind','payload'].includes(k)))
      {throw problem(400,'BILLING_STOCK_INVALID','Choose a property or unit to prepare.');}
    const shared=['bank_name','bank_branch','bank_account_number','terms','availability'];
    const fields=record.kind==='property'?['id','name','address','description','propertytype','country_code','rentalvalues',
      'unitconfiguration','checklistitems','images','availablefrom','squarefeet','yearbuilt','amenities',
      'electricity_rate','water_rate','latitude','longitude',...shared]:
      ['id','propertyid','unitnumber','description','rentalvalues','bedrooms','bathrooms','squarefeet','floor',...shared];
    const source=record.payload;
    if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).some(k=>!fields.includes(k)))
      {throw problem(400,'BILLING_STOCK_FIELDS','Submit property details without management, organization or billing fields.');}
    const payload=Object.fromEntries(fields.filter(k=>source[k]!==undefined).map(k=>[k,source[k]]));
    payload.id=identifier(payload.id);
    if(seen.has(payload.id)){throw problem(400,'BILLING_DUPLICATE_DWELLING','Each prepared record needs a distinct identifier.');}
    seen.add(payload.id);
    const label=record.kind==='property'?'name':'unitnumber';
    if(typeof payload[label]!=='string'||!payload[label].trim()||payload[label].length>(label==='name'?255:100))
      {throw problem(400,'BILLING_STOCK_LABEL','Include a valid property name or unit number.');}
    payload[label]=payload[label].trim();
    if(record.kind==='property'){
      if(!residential.has(payload.propertytype)||!['LK','BN'].includes(payload.country_code))
        {throw problem(400,'BILLING_STOCK_MARKET','Choose a residential property in Sri Lanka or Brunei.');}
      payload.rentalvalues=normalizePropertyRentalValues(payload.rentalvalues,{requireCategory:true});
      if(payload.rentalvalues.listingCategory!=='residential'){throw problem(400,'BILLING_STOCK_MARKET','Choose the residential listing category.');}
    }else{
      payload.propertyid=identifier(payload.propertyid);
      for(const field of ['bedrooms','bathrooms','squarefeet']){if(payload[field]!==undefined&&payload[field]!==null&&
        (!Number.isFinite(payload[field])||payload[field]<0||(['bedrooms','bathrooms'].includes(field)&&!Number.isSafeInteger(payload[field]))))
        {throw problem(400,'BILLING_STOCK_INVALID','Room counts and floor area must be valid non-negative numbers.');}}
    }
    if(typeof payload.floor==='string'&&payload.floor.length>100){throw problem(400,'BILLING_STOCK_INVALID','Floor must be at most 100 characters.');}
    for(const field of ['address','description','floor']){if(payload[field]!==undefined&&payload[field]!==null&&typeof payload[field]!=='string')
      {throw problem(400,'BILLING_STOCK_INVALID','Use text for property descriptions and addresses.');}}
    for(const field of ['bank_name','bank_branch','bank_account_number','unitconfiguration']){
      if(payload[field]!==undefined&&payload[field]!==null&&(typeof payload[field]!=='string'||payload[field].length>255))
        {throw problem(400,'BILLING_STOCK_INVALID','Bank details and unit configuration must be text of at most 255 characters.');}
    }
    if(payload.availability!==undefined&&!['active','available','reserved','maintenance','inactive'].includes(payload.availability))
      {throw problem(400,'BILLING_STOCK_INVALID','Choose an initial availability without creating a tenancy.');}
    for(const field of ['squarefeet','electricity_rate','water_rate','latitude','longitude','yearbuilt']){
      const value=payload[field];
      if(value===undefined||value===null){continue;}
      const max=field==='latitude'?90:field==='longitude'?180:field==='yearbuilt'?9999:100000000;
      const min=['latitude','longitude'].includes(field)?-max:0;
      if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(field==='yearbuilt'&&!Number.isSafeInteger(value)))
        {throw problem(400,'BILLING_STOCK_INVALID','Use valid property measurements, coordinates and utility rates.');}
    }
    if((payload.latitude==null)!==(payload.longitude==null))
      {throw problem(400,'BILLING_STOCK_INVALID','Include both latitude and longitude.');}
    if(payload.availablefrom!==undefined&&payload.availablefrom!==null&&
      (typeof payload.availablefrom!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(payload.availablefrom)||
       !Number.isFinite(Date.parse(payload.availablefrom))||new Date(payload.availablefrom).toISOString().replace('.000Z','Z')!==payload.availablefrom.replace('.000Z','Z')))
      {throw problem(400,'BILLING_STOCK_INVALID','Use a valid UTC availability date.');}
    for(const field of ['amenities','checklistitems']){
      if(payload[field]!==undefined&&(!Array.isArray(payload[field])||payload[field].length>100||
        payload[field].some(value=>typeof value!=='string'||value.length>1000)))
        {throw problem(400,'BILLING_STOCK_INVALID','Amenities and checklist items must be lists of text.');}
    }
    if(payload.terms!==undefined&&(!payload.terms||typeof payload.terms!=='object'||Array.isArray(payload.terms)))
      {throw problem(400,'BILLING_STOCK_INVALID','Property terms must be an object.');}
    if(payload.rentalvalues!==undefined){
      if(!payload.rentalvalues||typeof payload.rentalvalues!=='object'||Array.isArray(payload.rentalvalues))
        {throw problem(400,'BILLING_STOCK_INVALID','Rental values must be an object.');}
      for(const field of ['rent','deposit']){
        const value=payload.rentalvalues[field];
        if(value!==undefined&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100000000))
          {throw problem(400,'BILLING_STOCK_INVALID','Rent and deposit must be valid non-negative amounts.');}
      }
    }
    if(payload.images!==undefined&&(!Array.isArray(payload.images)||payload.images.length>50||payload.images.some(image=>
      typeof image!=='string'&&(!image||typeof image!=='object'||Array.isArray(image)||typeof image.image_url!=='string'||
      Object.keys(image).some(key=>!['image_url','image_type','uploaded_at','order','is_profile'].includes(key))))))
      {throw problem(400,'BILLING_STOCK_INVALID','Use registered property images and their display metadata.');}
    if(JSON.stringify(payload).length>32000){throw problem(400,'BILLING_STOCK_INVALID','This property record is too large.');}
    return {kind:record.kind,payload};
  });
};
export const dwellingInventory = ({tenantId, properties, units}) => {
  const tenant = String(tenantId).toLowerCase();
  const seen = new Set();
  const result = [];
  for (const property of properties) {
    if (String(property.tenant_id).toLowerCase() !== tenant || !residential.has(String(property.propertytype || '').toLowerCase())) {continue;}
    const children = units.filter(u => String(u.propertyid).toLowerCase() === String(property.id).toLowerCase());
    if (children.some(u => String(u.tenant_id).toLowerCase() !== tenant))
      {throw problem(409, 'BILLING_INVENTORY_SCOPE', 'A dwelling has inconsistent organization ownership.');}
    if(property.management_state==='ceased'){continue;}
    // Occupancy and public visibility deliberately do not enter this calculation.
    for (const item of children.length ? children.filter(u=>u.management_state!=='ceased') : [property]) {
      const kind = children.length ? 'unit' : 'property';
      const key = `${kind}:${String(item.id).toLowerCase()}`;
      if (seen.has(key)) {throw problem(409, 'BILLING_DUPLICATE_DWELLING', 'Duplicate dwelling identity.');}
      seen.add(key);
      result.push({key, propertyId:property.id, unitId:kind === 'unit' ? item.id : null,
        label:kind === 'unit' ? `${property.name} · ${item.unitnumber}` : property.name});
    }
  }
  return result.sort((a,b) => a.key.localeCompare(b.key));
};

export const entitlement = (account, now = billingClock.now()) => {
  if (!account) {return {state:'not_enrolled', management:false, historicalAccess:true};}
  if (account.risk_hold) {return {state:'review_required', management:false, historicalAccess:true};}
  if (account.comp_type === 'ongoing' || (account.comp_type === 'fixed' && Date.parse(account.comp_expires_at) > now))
    {return {state:'complimentary', management:true, historicalAccess:true};}
  const paidUntil = Date.parse(account.paid_through || '');
  if (account.initial_payment_verified && account.subscription_status === 'active' && paidUntil > now)
    {return {state:account.cancel_at_period_end ? 'ending' : 'active', management:true, historicalAccess:true};}
  // Initial failures, trials, unpaid and terminal subscriptions never acquire a grace trial.
  const graceStart = Date.parse(account.grace_started_at || '');
  if (account.subscription_status === 'past_due' && account.initial_payment_verified &&
      Number.isFinite(graceStart) && now >= graceStart && now < graceStart + 7 * 86400000)
    {return {state:'grace', management:true, historicalAccess:true, graceEndsAt:new Date(graceStart + 7 * 86400000).toISOString()};}
  return {state:account.initial_payment_verified ? 'read_only' : 'payment_pending', management:false, historicalAccess:true};
};

// Handoff cessation policy: access withdrawal never cancels a complimentary
// overlay's existing paid obligations or retries an unpaid purchase.
export const localCessationAllowed = (account, now = billingClock.now()) => {
  const access=entitlement(account,now);
  if(!account||account.risk_hold){return false;}
  if(access.state==='complimentary'){return true;}
  return ['incomplete','incomplete_expired','unpaid','canceled'].includes(account.subscription_status)||
    (account.subscription_status==='past_due'&&access.state==='read_only');
};

// Source preparation only: no organization is opted into write enforcement by
// enrollment, payment or a caller-supplied request field. Full-path acceptance
// must precede configuring this server-owned rollout scope.
export const managementWriteEnforced = (tenantId, env = process.env) => {
  const enabled = env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED;
  if (enabled === undefined || enabled === 'false') {return false;}
  const scope = String(env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS || '').split(',').map(value => value.trim());
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (enabled !== 'true' || scope.some(value => !uuid.test(value))) {
    throw problem(503, 'BILLING_ENFORCEMENT_CONFIGURATION', 'Management access could not be verified. Try again later.');
  }
  return scope.map(value => value.toLowerCase()).includes(identifier(tenantId));
};

export const assertInventoryMutation=({tenantId,table,action,env=process.env})=>{
  if((env.MANAGEMENT_INVENTORY_SCHEMA_READY!=='true'&&env.MANAGEMENT_CESSATION_SCHEMA_READY!=='true')||!['properties','property_units'].includes(table)||!managementWriteEnforced(tenantId,env)){return;}
  if(['insert','upsert'].includes(action)){throw problem(409,'BILLING_STOCK_PREPARATION_REQUIRED',
    'Prepare new dwellings in Management subscription, then review and confirm billing before managing them.');}
  if(action==='delete'){throw problem(409,'BILLING_CESSATION_REQUIRED',
    'Removing managed stock requires the management-cessation checks. Existing records have been retained.');}
};

export const cessationBlockers=({agreements=[],invoices=[],payments=[],settlements=[],deposits=[],maintenance=[],holds=[],pending=[],staged=[],riskHold=false})=>{
  const blockers=[];
  const add=(code,message,count)=>{if(count){blockers.push({code,message,count});}};
  add('TENANCY_OPEN','Close or cancel the remaining tenancy/agreement work.',agreements.filter(a=>!['closed','cancelled'].includes(String(a.status||'').toLowerCase())).length);
  add('FINANCIAL_OPEN','Resolve outstanding invoices, drafts or refund balances.',invoices.filter(i=>{
    const state=String(i.status||'').toLowerCase();
    if(state==='cancelled'){return Number(i.paid)!==0;}
    return !['issued','overdue','paid'].includes(state)||i.totalamount===null||i.totalamount===undefined||i.outstanding===null||i.outstanding===undefined||!Number.isFinite(Number(i.outstanding))||Number(i.outstanding)!==0;
  }).length);
  add('PAYMENT_OPEN','Finish the pending payment reviews.',payments.length);
  add('SETTLEMENT_OPEN','Finish the remaining settlements.',settlements.length);
  add('DEPOSIT_OPEN','Resolve the outstanding deposit or refund work.',deposits.length);
  add('MAINTENANCE_OPEN','Complete or cancel the outstanding maintenance.',maintenance.length);
  add('RESERVATION_OPEN','Withdraw or resolve the current rental offers and reservations.',holds.length);
  add('BILLING_OPERATION_OPEN','Resolve the unfinished billing operation first.',pending.length);
  add('PREPARED_STOCK_OPEN','Confirm or withdraw prepared additions for this property first.',staged.length);
  add('BILLING_REVIEW_HOLD','Resolve the billing review hold first.',riskHold?1:0);
  return blockers;
};

export const complimentaryChange = (input, now = billingClock.now()) => {
  if (!input || !['fixed', 'ongoing', 'revoke'].includes(input.mode)) {
    throw problem(400, 'BILLING_COMP_INVALID', 'Choose fixed-term, ongoing or revoke complimentary access.');
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw problem(400, 'BILLING_VERSION_INVALID', 'Reload the current billing account before changing access.');
  }
  const expires = input.expiresAt;
  if (input.mode === 'fixed') {
    if (typeof expires !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(expires) ||
        !Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= now ||
        new Date(expires).toISOString().replace('.000Z', 'Z') !== expires.replace('.000Z', 'Z')) {
      throw problem(400, 'BILLING_COMP_EXPIRY_INVALID', 'Fixed-term access requires a valid future UTC expiry.');
    }
  } else if (expires !== null) {
    throw problem(400, 'BILLING_COMP_EXPIRY_INVALID', 'Ongoing access and revocation must not include an expiry.');
  }
  return {mode:input.mode, expiresAt:input.mode === 'fixed' ? new Date(expires).toISOString() : null,
    expectedVersion:input.expectedVersion, reason:reason(input.reason)};
};

export const verifyStripeSignature = ({body, signature, secret, now = billingClock.now()}) => {
  if (!Buffer.isBuffer(body) || !secret || typeof signature !== 'string')
    {throw problem(400, 'STRIPE_SIGNATURE_INVALID', 'Invalid webhook signature.');}
  const parts = signature.split(',').map(part => part.split('='));
  const timestamps = parts.filter(([key]) => key === 't');
  const timestamp = timestamps.length === 1 && /^\d+$/.test(timestamps[0][1]) ? Number(timestamps[0][1]) : NaN;
  if (!Number.isSafeInteger(timestamp) || Math.abs(now / 1000 - timestamp) > 300)
    {throw problem(400, 'STRIPE_SIGNATURE_INVALID', 'Invalid webhook signature.');}
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest();
  const valid = parts.filter(([key, value]) => key === 'v1' && /^[0-9a-f]{64}$/.test(value || ''))
    .some(([,value]) => crypto.timingSafeEqual(expected, Buffer.from(value, 'hex')));
  if (!valid) {throw problem(400, 'STRIPE_SIGNATURE_INVALID', 'Invalid webhook signature.');}
  let event;
  try { event = JSON.parse(body.toString('utf8')); } catch { throw problem(400, 'STRIPE_EVENT_INVALID', 'Invalid webhook body.'); }
  if (!/^evt_[a-zA-Z0-9]+$/.test(event?.id || '') || typeof event.type !== 'string' || !event.data?.object || event.livemode !== false)
    {throw problem(400, 'STRIPE_EVENT_INVALID', 'Only valid sandbox events are accepted.');}
  if (event.account && event.account !== BILLING_ACCOUNT)
    {throw problem(400, 'STRIPE_ACCOUNT_INVALID', 'Webhook account does not match this integration.');}
  return event;
};
