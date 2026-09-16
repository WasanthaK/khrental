const normalizePathname = (pathname = '/') => {
  const value = String(pathname || '/').trim();
  if (!value || value === '/') {
    return '/';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
};

const suffixAfterPrefix = (pathname, prefix) => {
  const normalized = normalizePathname(pathname);
  if (normalized === prefix) {
    return '';
  }
  if (!normalized.startsWith(`${prefix}/`)) {
    return null;
  }
  return normalized.slice(prefix.length);
};

/**
 * Explicit aliases for the known tenant portal destinations. React Router can
 * rank these concrete paths ahead of the compatibility splat, so a bookmarked
 * deep link cannot be collapsed to the tenant home route by wildcard matching.
 */
export const LEGACY_TENANT_ROUTE_ALIASES = Object.freeze([
  Object.freeze({ path: 'portal', target: '/rentee' }),
  Object.freeze({ path: 'portal/profile', target: '/rentee/profile' }),
  Object.freeze({ path: 'portal/invoices', target: '/rentee/invoices' }),
  Object.freeze({ path: 'portal/agreements', target: '/rentee/agreements' }),
  Object.freeze({ path: 'portal/maintenance', target: '/rentee/maintenance' }),
  Object.freeze({ path: 'portal/utilities', target: '/rentee/utilities' }),
  Object.freeze({ path: 'portal/utilities/submit', target: '/rentee/utilities/submit' }),
  Object.freeze({ path: 'portal/utilities/history', target: '/rentee/utilities/history' })
]);

/**
 * `/rentee` remains the canonical tenant-portal URL during the compatibility
 * period because existing invitation/login flows already land there. `/portal`
 * is retained only as a redirect so the application has one mounted portal tree.
 */
export const resolveLegacyTenantPath = (pathname = '/portal') => {
  const suffix = suffixAfterPrefix(pathname, '/portal');
  if (suffix === null) {
    return '/rentee';
  }
  return `/rentee${suffix}`;
};

/**
 * `/dashboard` is the canonical administrator/staff workspace. Old `/admin`
 * bookmarks are translated to their closest dashboard equivalent rather than
 * mounting a second admin layout and a second set of pages.
 */
export const resolveLegacyAdminPath = (pathname = '/admin') => {
  const suffix = suffixAfterPrefix(pathname, '/admin');
  if (suffix === null || suffix === '') {
    return '/dashboard';
  }

  if (suffix === '/users' || suffix.startsWith('/users/')) {
    return `/dashboard/team${suffix.slice('/users'.length)}`;
  }

  const directlyMappedPrefixes = [
    '/settings',
    '/rentees',
    '/agreements',
    '/invoices'
  ];

  if (directlyMappedPrefixes.some((prefix) => suffix === prefix || suffix.startsWith(`${prefix}/`))) {
    return `/dashboard${suffix}`;
  }

  return '/dashboard';
};

export const CANONICAL_PORTAL_PATHS = Object.freeze({
  WORKSPACE: '/dashboard',
  TENANT: '/rentee'
});
