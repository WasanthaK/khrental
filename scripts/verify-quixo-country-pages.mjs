// Run: node scripts/verify-quixo-country-pages.mjs
// Read-only verification: generated static pages match one shared template.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COUNTRY_PAGES, renderCountryPage } from '../marketing/country-pages.mjs';

assert.deepEqual(COUNTRY_PAGES.map(x => x.slug), ['lk', 'bn']);
for (const country of COUNTRY_PAGES) {
  const html = readFileSync(new URL('../marketing/' + country.slug + '/index.html', import.meta.url), 'utf8');
  assert.equal(html, renderCountryPage(country), 'Country page differs from shared template: ' + country.slug);
  assert.match(html, /meta name="robots" content="noindex,nofollow"/);
  assert.match(html, /Local subscriptions and public sign-up are not open yet/);
  assert.match(html, /https:\/\/app\.quixo\.homes\/login/);
  assert.match(html, new RegExp('data-country="' + country.code + '"'));
  assert.ok(!/checkout|register|stripe\.com|\b(?:US\\$|BND\\s*\\d|LKR\\s*\\d)\b/i.test(html), 'Unapproved payment/registration CTA');
}
const root = readFileSync(new URL('../marketing/index.html', import.meta.url), 'utf8');
assert.match(root, /data-site="quixo-homes-marketing"/);
console.log('QUIXO_COUNTRY_DRAFTS=PASS markets=LK,BN shared_template=true preview_noindex=true paid_signup_off=true');
