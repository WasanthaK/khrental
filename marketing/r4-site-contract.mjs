// R4 shared public website contract.
// Design-stage only: do not import into authentication, tenant, billing, or production listing APIs.
// Source: owner-approved Quixo.Homes visual package; see docs/QUIXO-HOMES-SHARED-WEBSITE-SPEC-20261025.md.
export const PUBLIC_SITE_STAGE = 'draft-noindex';
export const AUTHENTICATED_APP_SIGN_IN = 'https://app.quixo.homes/login';

export const PAGE_TYPES = Object.freeze({
  home: '',
  search: 'search',
  property: 'property',
  owners: 'owners',
  howItWorks: 'how-it-works'
});

export const MARKETS = Object.freeze({
  lk: Object.freeze({
    slug: 'lk', code: 'LK', name: 'Sri Lanka',
    language: 'en-LK', rentalCurrency: 'LKR',
    marketLabel: 'Sri Lanka', countryPath: '/lk/',
    pricingStatus: 'NOT_APPROVED',
    marketingStatus: 'DRAFT_ONLY',
    rentalPeriod: 'month'
  }),
  bn: Object.freeze({
    slug: 'bn', code: 'BN', name: 'Brunei Darussalam',
    language: 'en-BN', rentalCurrency: 'BND',
    marketLabel: 'Brunei Darussalam', countryPath: '/bn/',
    pricingStatus: 'NOT_APPROVED',
    marketingStatus: 'DRAFT_ONLY',
    rentalPeriod: 'month'
  })
});

export const PUBLIC_AUDIENCES = Object.freeze(['seeker', 'owner']);
export const RENTAL_TYPES = Object.freeze(['residential', 'commercial']);
export const LONG_TERM_RENTAL_FIELDS = Object.freeze({
  residential: Object.freeze(['location', 'type', 'rentPerMonth', 'bedrooms', 'bathrooms', 'furnishing', 'parking', 'availability']),
  commercial: Object.freeze(['location', 'type', 'rentPerMonth', 'floorArea', 'permittedUse', 'frontage', 'parking', 'availability'])
});

// Visible UI labels only. No query/POST calls or live action endpoints are authorized.
export const PAGE_CONTENT = Object.freeze({
  home: Object.freeze({
    heading: 'a home for life and business.',
    primaryAudience: 'seeker',
    secondaryAudience: 'owner',
    navigation: Object.freeze(['home', 'search', 'owners', 'howItWorks']),
    searchModes: RENTAL_TYPES,
    actionState: 'PREVIEW_ONLY'
  }),
  search: Object.freeze({
    heading: 'Find a place to call yours.',
    searchModes: RENTAL_TYPES,
    actionState: 'PREVIEW_ONLY'
  }),
  property: Object.freeze({
    heading: 'See the details before you visit.',
    actionState: 'PREVIEW_ONLY',
    includeMonthlyRent: true,
    includeViewingRequestConcept: true
  }),
  owners: Object.freeze({
    heading: 'Have a property to rent?',
    actionState: 'ENQUIRY_DISABLED',
    productTopics: Object.freeze(['properties', 'tenancies', 'agreements', 'invoices', 'maintenance'])
  }),
  howItWorks: Object.freeze({
    heading: 'Renting made clearer.',
    stages: Object.freeze(['search', 'view', 'agree', 'manage']),
    actionState: 'PREVIEW_ONLY'
  })
});

const REQUIRED_PAGES = Object.freeze(Object.keys(PAGE_TYPES));
export const PRODUCTION_GATES = Object.freeze({
  publicSignup: false,
  seekerEnrollment: false,
  publicPropertyPublication: false,
  viewingEnquirySubmission: false,
  stripeCheckout: false,
  publicIndexing: false
});

export function publicPagePath(market, page = 'home') {
  const country = MARKETS[market];
  if (!country) throw new RangeError('Unsupported market');
  if (!Object.hasOwn(PAGE_TYPES, page)) throw new RangeError('Unsupported page');
  const segment = PAGE_TYPES[page];
  return segment ? `/${country.slug}/${segment}/` : `/${country.slug}/`;
}

export function getPublicPageModel(market, page = 'home') {
  if (!Object.hasOwn(PAGE_CONTENT, page)) throw new RangeError('Unsupported page');
  const country = MARKETS[market];
  if (!country) throw new RangeError('Unsupported market');
  return Object.freeze({
    ...PAGE_CONTENT[page],
    page,
    countryCode: country.code,
    countryName: country.name,
    language: country.language,
    currency: country.rentalCurrency,
    rentalPeriod: 'month',
    path: publicPagePath(market, page),
    canonical: `https://quixo.homes${publicPagePath(market, page)}`,
    robots: 'noindex,nofollow',
    authenticatedSignIn: AUTHENTICATED_APP_SIGN_IN,
    isLiveSearch: false,
    hasRealListings: false,
    hasLiveEnquiries: false,
    hasCheckout: false
  });
}

export function assertDraftReleaseBoundary() {
  if (PUBLIC_SITE_STAGE !== 'draft-noindex') throw new Error('R4 release boundary changed');
  if (REQUIRED_PAGES.length !== 5) throw new Error('R4 route contract changed');
  if (Object.values(PRODUCTION_GATES).some(Boolean)) throw new Error('R4 live gate incorrectly enabled');
  for (const market of Object.values(MARKETS)) {
    if (market.marketingStatus !== 'DRAFT_ONLY' || market.pricingStatus !== 'NOT_APPROVED') {
      throw new Error('R4 country launch/pricing authorization missing');
    }
  }
  return true;
}
