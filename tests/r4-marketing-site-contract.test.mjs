import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_SITE_STAGE, PUBLIC_AUDIENCES, RENTAL_TYPES, PAGE_TYPES,
  MARKETS, PRODUCTION_GATES, publicPagePath,
  getPublicPageModel, assertDraftReleaseBoundary
} from '../marketing/r4-site-contract.mjs';

test('R4 two-market shared design contract stays draft-only', () => {
  assert.equal(PUBLIC_SITE_STAGE, 'draft-noindex');
  assert.deepEqual(Object.keys(MARKETS), ['lk', 'bn']);
  assert.deepEqual(PUBLIC_AUDIENCES, ['seeker', 'owner']);
  assert.deepEqual(RENTAL_TYPES, ['residential', 'commercial']);
  assert.deepEqual(Object.keys(PAGE_TYPES), ['home', 'search', 'property', 'owners', 'howItWorks']);
  assert.equal(assertDraftReleaseBoundary(), true);
  assert.equal(Object.values(PRODUCTION_GATES).every(x => x === false), true);
});

test('no bogus third market or page, no unapproved regional price', () => {
  assert.throws(() => publicPagePath('br'), /Unsupported market/);
  assert.throws(() => publicPagePath('lk', 'checkout'), /Unsupported page/);
  assert.throws(() => getPublicPageModel('bn', 'register'), /Unsupported page/);
  assert.equal(MARKETS.lk.pricingStatus, 'NOT_APPROVED');
  assert.equal(MARKETS.bn.pricingStatus, 'NOT_APPROVED');
});

test('all 10 localized page models are noindex, correctly scoped, and have no live activity', () => {
  let checks = 0;
  for (const [market, meta] of Object.entries(MARKETS)) {
    for (const page of Object.keys(PAGE_TYPES)) {
      const m = getPublicPageModel(market, page);
      assert.equal(m.countryCode, meta.code);
      assert.equal(m.language, meta.language);
      assert.equal(m.currency, meta.rentalCurrency);
      assert.equal(m.rentalPeriod, 'month');
      assert.equal(m.robots, 'noindex,nofollow');
      assert.equal(m.canonical, 'https://quixo.homes' + m.path);
      assert.ok(m.path.startsWith('/' + market + '/'));
      assert.equal(m.authenticatedSignIn, 'https://app.quixo.homes/login');
      assert.equal(m.isLiveSearch || m.hasRealListings || m.hasLiveEnquiries || m.hasCheckout, false);
      checks++;
    }
  }
  assert.equal(checks, 10);
});

test('seeker-first and owner workflows are separate; no nightly stay semantics', () => {
  const home = getPublicPageModel('lk', 'home');
  assert.equal(home.primaryAudience, 'seeker');
  assert.equal(home.secondaryAudience, 'owner');
  assert.deepEqual(home.searchModes, ['residential', 'commercial']);
  const property = getPublicPageModel('bn', 'property');
  assert.equal(property.includeMonthlyRent, true);
  assert.equal(property.includeViewingRequestConcept, true);
  const owners = getPublicPageModel('lk', 'owners');
  assert.deepEqual(owners.productTopics, ['properties', 'tenancies', 'agreements', 'invoices', 'maintenance']);
  assert.ok(!JSON.stringify({home, property, owners}).match(/nightly|guest count|checkout\.stripe\.com/i));
});
