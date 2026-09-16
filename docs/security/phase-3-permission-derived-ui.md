# KH Rentals Phase 3C — Permission-Derived UI and Routes

## Purpose

Phase 3A introduced the canonical Administrator / Staff / Tenant access model and staff permission bundles. Phase 3B moved membership administration onto that model. Phase 3C removes the browser's independent role/permission matrix so that the server, route guards, and navigation use the same permission vocabulary.

## Shared policy

`src/utils/accessPolicy.js` is now the common browser/server policy module. It defines:

- canonical named permissions;
- administrator, tenant, and staff-bundle permission sets;
- effective permission resolution;
- portal-type resolution helpers;
- default landing paths.

`src/api/platform/permissionEngine.js` consumes and re-exports that shared policy instead of maintaining its own duplicate permission table.

`src/utils/permissions.jsx` remains only as a temporary compatibility bridge for older UI components. It translates legacy names such as `view_properties` and `create_invoice` into the shared policy; it no longer contains an independent role matrix.

## Route changes

`src/routes.jsx` now uses:

- canonical portal types for the workspace and tenant portal shells;
- canonical permissions for business feature routes;
- administrator-only guards for diagnostic/development surfaces;
- default-deny behavior for unlinked authenticated accounts.

The previous `admin-tools` exception for a generic `authenticated` role has been removed.

Examples:

- Properties list: `properties.read`
- Property edit: `properties.manage`
- Tenant list: `rentees.read`
- Tenant create/edit: `rentees.manage`
- Invoices: `invoices.read` / `invoices.manage`
- Agreements: `agreements.read` / `agreements.manage`
- Utility billing/review: `utilities.review`
- Maintenance: `maintenance.manage` or `maintenance.read_assigned`
- Team / Tenant Admin: `memberships.manage`
- Settings / diagnostics: `tenant_settings.manage`

## Navigation changes

`src/utils/navigationPolicy.js` maps workspace sections to canonical permissions.

`DashboardLayout` and `MobileNav` derive visible navigation from that policy rather than stored role labels.

This intentionally exposes previously hidden inconsistencies. For example, the legacy UI showed Utility Billing to `finance_staff`, but the canonical Finance bundle does not grant `utilities.read` or `utilities.review`. Phase 3C follows server authorization and therefore does not show Utility Billing to Finance.

## Diagnostics hardening

The following routes are no longer available to a merely authenticated/unlinked account:

- `/dashboard/admin-tools`
- `/auth-debug`
- `/digital-signature-test`
- email diagnostic routes
- file-upload diagnostic routes

They now require administrator-level capabilities or the Administrator portal.

## Tests

`tests/access-policy.test.js` verifies:

- canonical portal resolution and landing paths;
- staff bundle permission differences;
- permission-derived workspace section visibility;
- administrator/tenant separation;
- default denial for unlinked authenticated accounts.

The file is included in `npm run test:authorization`.

## Compatibility retained

This slice deliberately does not yet remove:

- the `/admin` route family;
- the `/portal` tenant-route alias;
- legacy `rentee` terminology in stored data and some user-facing components;
- legacy permission names consumed by older individual pages.

Those are migration/portal-consolidation concerns for Phase 3D. Server authorization remains the final enforcement boundary throughout.

## Phase 3C completion gate

Phase 3C is complete when:

1. authorization tests pass;
2. production build passes;
3. Administrator navigation exposes administrative sections;
4. Property Operations, Finance, Maintenance, and Read Only staff see only sections allowed by the canonical bundle;
5. direct navigation to a disallowed route returns Unauthorized;
6. Tenant remains in the tenant portal and cannot enter `/dashboard`;
7. unlinked authenticated users cannot enter diagnostic/admin surfaces.
