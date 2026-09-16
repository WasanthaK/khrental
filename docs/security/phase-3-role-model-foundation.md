# KH Rentals Phase 3 — Canonical Role Model Foundation

## Purpose

Phase 1 contained unsafe generic data access and established server-side ownership and tenant-scope rules. Phase 2 centralized named permissions and staff-to-property assignments. Phase 3 begins the next remediation objective from the role/access audit: simplify the application's role model without weakening the Phase 1/2 authorization boundary.

This first Phase 3 slice is intentionally additive and backward-compatible. It does not rewrite existing production role values and it does not yet change navigation or route structure.

## Target model

KH Rentals should expose three portal types:

- `admin` — administrator
- `staff` — staff member or contractor
- `tenant` — tenant / lessee

Staff specialization belongs in a permission bundle rather than a growing list of account roles.

Supported staff bundles in this slice:

| Bundle | Purpose | Legacy compatibility |
|---|---|---|
| `property_operations` | Operate assigned properties, rentees, agreements, billing and maintenance coordination | `manager` |
| `finance` | Finance and billing work for assigned properties | `finance_staff` |
| `maintenance` | Assigned maintenance and task work | `maintenance_staff`, `maintenance`, `supervisor`, legacy `staff` |
| `read_only` | Safe portfolio visibility without business-data mutation | New canonical bundle |

Property assignment remains a separate scope. The bundle answers **what** a staff member may do; `staff_property_assignments` answers **where** they may do it.

## Compatibility strategy

Existing production roles remain valid during migration:

- `manager`
- `finance_staff`
- `maintenance_staff`
- `maintenance`
- `supervisor`
- `staff`
- `rentee`

The server maps legacy staff roles to the equivalent canonical staff bundle. New canonical records can use `role = staff` with `permission_bundle` populated.

The public authorization role-type compatibility value remains `rentee` for the tenant portal during this slice because existing server tests and callers still depend on that value. The new shared access model recognizes both `rentee` and `tenant` as the tenant portal.

## Database change

Migration:

`migrations/20260916_02_add_staff_permission_bundles.sql`

It:

1. adds nullable `tenant_memberships.permission_bundle`;
2. backfills existing staff memberships from their legacy role;
3. constrains the column to the four approved bundle values;
4. leaves existing `tenant_memberships.role` values untouched.

Run with:

```bash
npm run migrate:staff-permission-bundles
```

## Mandatory release order

**The database migration must be executed and verified before deploying the Phase 3 application code.**

The tenant-context query in this slice selects `tenant_memberships.permission_bundle`. Deploying the application before the column exists can cause membership resolution to fail. This is the same explicit migration-before-application discipline used for Phase 2 staff property assignments.

Safe release sequence:

1. merge/review code only after CI passes;
2. execute `npm run migrate:staff-permission-bundles` against the target Azure SQL database with a DDL-capable principal;
3. verify the column, check constraint and backfilled values;
4. deploy the application build;
5. test administrator, property-operations, finance, maintenance and tenant accounts.

## Authorization changes in this slice

`src/utils/accessModel.js` becomes the shared vocabulary for:

- portal type normalization;
- legacy role compatibility;
- staff permission-bundle normalization.

`src/api/platform/permissionEngine.js` now calculates staff permissions from the bundle. The Phase 2 effective permissions for `manager`, `finance_staff` and maintenance roles are preserved through compatibility mapping.

`src/api/tenant/context.js` returns `permission_bundle` as part of the active membership so server authorization can evaluate canonical `role = staff` memberships.

## Tests

The permission-engine suite now covers:

- canonical `staff + property_operations`;
- canonical `staff + finance`;
- canonical `staff + maintenance`;
- canonical `staff + read_only`;
- legacy staff-role compatibility;
- existing administrator, tenant, ownership and assignment controls.

CI must continue to run:

```bash
npm run test:authorization
npm run build
```

## Not included yet

This foundation deliberately does **not** yet:

- rewrite production legacy staff roles to `staff`;
- change Tenant Admin role selectors;
- replace frontend `src/utils/permissions.jsx` with the canonical server permission vocabulary;
- derive all navigation from effective permissions;
- consolidate `/admin` and `/dashboard`;
- consolidate `/rentee` and `/portal`;
- rename user-facing `Rentee` terminology to `Tenant`;
- redesign role-specific dashboards.

Those belong in the next Phase 3 slices after this foundation is verified.

## Next Phase 3 slices

### 3B — Administration and canonical writes

- update administrator member-management UI to expose only Administrator, Staff/Contractor and Tenant/Lessee portal types;
- for staff, select one approved permission bundle plus property assignments;
- write new staff memberships as `role = staff` with `permission_bundle`;
- stop creating new legacy staff role labels;
- preserve edit/display compatibility for existing legacy memberships until migrated.

### 3C — Permission-derived UI

- replace frontend role-specific permission registry with the shared/canonical permission model;
- derive routes and navigation from effective permissions instead of hard-coded role comparisons;
- remove ordinary-authenticated access to diagnostic/admin tools;
- add UI authorization regression tests.

### 3D — Portal consolidation

- consolidate duplicate administrator route families;
- consolidate duplicate tenant route families;
- standardize terminology to Administrator, Staff/Contractor and Tenant/Lessee;
- move staff toward an assignment-focused work queue rather than a smaller administrator dashboard.

## Completion gate for Phase 3

Phase 3 is complete when:

- new memberships use only the three portal types;
- staff capability is expressed through approved bundle(s) and trusted assignment scope;
- legacy role labels are no longer created and can be migrated safely;
- server, routes and navigation derive from the same effective access model;
- no diagnostic/development surface is reachable through ordinary production navigation;
- administrator, each staff bundle and tenant denial/success paths are covered by automated tests.
