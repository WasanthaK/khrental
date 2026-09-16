import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReturnPath, getPostLoginPath } from '../src/utils/authRedirect.js';

test('protected tenant deep links survive the login round trip', () => {
  const state = {
    from: {
      pathname: '/portal/invoices',
      search: '',
      hash: ''
    }
  };

  assert.equal(getPostLoginPath(state, '/rentee'), '/portal/invoices');
});

test('return paths preserve query strings and hashes', () => {
  assert.equal(
    buildReturnPath({
      pathname: '/portal/invoices',
      search: '?status=pending',
      hash: '#latest'
    }),
    '/portal/invoices?status=pending#latest'
  );
});

test('missing or unsafe return paths use the supplied fallback', () => {
  assert.equal(getPostLoginPath(null, '/rentee'), '/rentee');
  assert.equal(getPostLoginPath({ from: { pathname: 'https://example.com' } }, '/rentee'), '/rentee');
  assert.equal(getPostLoginPath({ from: { pathname: '//example.com/path' } }, '/rentee'), '/rentee');
});
