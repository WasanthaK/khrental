// KH Rentals -> Quixo.Homes publication eligibility. Default advertised, with explicit opt-out.
// This pure policy mirrors the SQL read predicate; it is not a substitute for SQL authorization.
export const AVAILABLE_PARENT_STATES=Object.freeze(['active','available']);
export const ELIGIBLE_UNIT_STATES=Object.freeze(['available']);
export const SUPPRESSED_PARENT_STATES=Object.freeze(['reserved','maintenance','inactive','occupied']);
export const PUBLIC_MARKETS=Object.freeze({LK:'LKR',BN:'BND'});
export const PUBLIC_TYPES=Object.freeze({house:'residential',apartment:'residential',condo:'residential',commercial:'commercial'});
const norm=value=>String(value??'').trim().toLowerCase();

export const publicationEligibility=({
  propertyStatus,units=[],activeUnitIds=[],hasActiveWholePropertyAgreement=false,
  optedOut=false,tenantActive=true,countryCode=null,propertyType=null
}={})=>{
  if(!tenantActive)return {eligible:false,reason:'tenant_inactive'};
  if(optedOut)return {eligible:false,reason:'owner_opted_out'};
  const status=norm(propertyStatus);
  if(SUPPRESSED_PARENT_STATES.includes(status))return {eligible:false,reason:'property_unavailable'};
  if(hasActiveWholePropertyAgreement)return {eligible:false,reason:'whole_property_rented'};
  if(!AVAILABLE_PARENT_STATES.includes(status)&&status!=='rented')
    return {eligible:false,reason:'property_status_unknown'};
  const unitList=Array.isArray(units)?units:[];
  if(unitList.length){
    const occupied=new Set(activeUnitIds.map(String));
    if(!unitList.some(u=>ELIGIBLE_UNIT_STATES.includes(norm(u.status))&&!occupied.has(String(u.id))))
      return {eligible:false,reason:'no_available_units'};
  }else if(!AVAILABLE_PARENT_STATES.includes(status)){
    return {eligible:false,reason:'whole_property_rented'};
  }
  const country=String(countryCode||'').toUpperCase();
  if(!Object.hasOwn(PUBLIC_MARKETS,country))
    return {eligible:false,reason:'public_country_missing'};
  if(!Object.hasOwn(PUBLIC_TYPES,norm(propertyType)))
    return {eligible:false,reason:'unsupported_property_type'};
  return {eligible:true,reason:'available_for_rent',country,category:PUBLIC_TYPES[norm(propertyType)]};
};

export const PUBLIC_LISTING_ENABLED = env =>
  String(env?.PUBLIC_LISTING_READ_ENABLED||'').toLowerCase()==='true' &&
  String(env?.PUBLIC_LISTING_SHARED_RATE_LIMIT_READY||'').toLowerCase()==='true';

export const parseCountry = input => {
  const country=String(input||'').trim().toUpperCase();
  return Object.hasOwn(PUBLIC_MARKETS,country)?country:null;
};

// Business policy: all eligible app properties are candidates for public display.
// Opt-out persists independently of rented/reserved status; returning to available
// restores visibility automatically, provided the market has been assigned.
// Do not derive market by guessing from a private postal address or tenant identity.
