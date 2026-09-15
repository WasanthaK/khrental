# KH Rentals Phase 2 Central Authorization Service

## Purpose

Phase 2 turns the Phase 1 containment rules into a reusable server-side permission model. The server remains authoritative; frontend route guards and legacy frontend permission strings are usability aids only.

## Compatibility rules

- Existing administrator behavior remains tenant-scoped and retains the Phase 1 runtime table allowlist.
- Existing tenant (`rentee`) ownership filters, agreement relationships, safe insert fields, and restricted update fields remain unchanged.
- Existing stored roles remain valid and are translated into named server permissions.
- Unknown or unlinked roles remain default-deny.
- Staff property access is now explicitly tenant-scoped through `staff_property_assignments`.
- The legacy `app_users.associated_property_ids` field is used only as a migration/backfill source when the new assignment table is created; it is not the long-term authorization source.
- Generic staff access still remains denied where the server cannot prove the required resource relationship.

## Role normalization

| Stored role | Business type | Phase 2 interpretation |
|---|---|---|
| `admin` | Administrator | Full named permission set, still subject to platform API safety rules |
| `manager` | Staff | Broad operational permissions |
| `finance_staff` | Staff | Finance-focused named permissions |
| `maintenance_staff`, `maintenance`, `supervisor`, `staff` | Staff / contractor | Assigned maintenance and task permissions |
| `rentee` | Tenant | Own-record read permissions and constrained tenant actions |
| anything else | Unlinked | No business-data access |

When a tenant membership has a role, the membership role is authoritative over a legacy role stored on the user record.

## Named permissions

The central engine currently defines the following server permission vocabulary:

- `properties.read`
- `properties.manage`
- `property_assignments.manage`
- `invoices.read`
- `invoices.manage`
- `payments.read`
- `payments.manage`
- `agreements.read`
- `agreements.manage`
- `maintenance.read_assigned`
- `maintenance.update_assigned`
- `maintenance.manage`
- `utilities.read`
- `utilities.review`
- `tasks.read_assigned`
- `tasks.update_assigned`
- `profile.read_self`
- `profile.update_self`
- `memberships.manage`
- `tenant_settings.manage`
- `communications.manage`
- `cameras.read`
- `cameras.manage`

`property_assignments.manage` is deliberately administrator-only in the current role map. Managers and other staff cannot grant themselves broader property access.

## Authorization dimensions

Permission checks alone are not sufficient. Phase 2 models four additional constraints:

1. **Tenant membership** — the membership must be active and match the selected tenant when a tenant ID is supplied.
2. **Ownership** — tenant-owned resources must resolve to the current application user.
3. **Job assignment** — assigned maintenance or task work must resolve to the current staff user.
4. **Property assignment** — a property-sensitive operation must resolve to an active property assignment for the current staff user in the active tenant.

The central engine exposes these predicates separately so business endpoints can combine a named permission with the appropriate resource constraint.

## Explicit property-assignment model

Migration `migrations/20260915_01_create_staff_property_assignments.sql` introduces `staff_property_assignments` with:

- `tenant_id`
- `propertyid`
- `staff_user_id`
- `status` (`active` or `inactive`)
- `assigned_by`
- `assignedat`
- `endedat`
- `notes`
- standard created/updated timestamps

The unique tenant/property/staff key prevents duplicate logical assignments. Tenant and staff/property indexes support authorization lookups.

The migration is idempotent and performs a compatibility backfill from valid JSON values in `app_users.associated_property_ids`, but only for users with an active staff-role tenant membership and only when the referenced property belongs to the same tenant. Tenant/rentee associations are not imported into this table.

Run the migration with:

```bash
npm run migrate:staff-property-assignments
```

## Assignment administration API

Assignment administration is intentionally separate from the generic platform query endpoint:

- `GET /api/property-assignments`
- `POST /api/property-assignments`
- `PATCH /api/property-assignments/:assignmentId`
- `DELETE /api/property-assignments/:assignmentId`

All operations require an authenticated user, an active tenant context, and `property_assignments.manage`. The server validates that the target property belongs to the active tenant and that the target user has an active staff membership in that same tenant.

The API never accepts a client-supplied tenant ID as proof of authorization; tenant identity comes from the resolved server tenant context.

## Server-resolved assignment context

For an authenticated user with a selected tenant, tenant-context resolution loads active rows from `staff_property_assignments` and attaches only the resulting property IDs to the active membership as `assignedPropertyIds`.

When the new assignment table does not yet exist, the context layer can read the legacy `associated_property_ids` value as a temporary compatibility fallback. Once the new table exists, it is authoritative even when no assignments are present; an empty assignment set means no property-scoped access.

## Platform-query integration

The Phase 1 platform query authorization consumes the central engine for role interpretation and named permission decisions while preserving its existing safety controls:

- administrator table allowlist
- blocked runtime RPC list
- tenant ownership filters
- tenant property/unit/payment relationship scopes
- tenant field sanitization
- assigned maintenance and task filters for staff
- unfiltered mutation rejection
- unknown-role default deny

Property-capable staff reads are now additionally constrained as follows:

| Resource | Required permission | Server-enforced property filter |
|---|---|---|
| `properties` | `properties.read` | `id IN assignedPropertyIds` |
| `property_units` | `properties.read` | `propertyid IN assignedPropertyIds` |
| `agreements` | `agreements.read` | `propertyid IN assignedPropertyIds` |
| `invoices` | `invoices.read` | `propertyid IN assignedPropertyIds` |
| `utility_readings` | `utilities.read` | `propertyid IN assignedPropertyIds` |
| `cameras` | `cameras.read` | `propertyid IN assignedPropertyIds` |

If a role has the named permission but has no active assignments, the server adds an empty `IN` scope. The query layer converts that to a false predicate, returning no rows rather than broadening access.

Maintenance requests and task assignments continue to use direct job assignment (`assignedto` / `teammemberid`) because that is more specific than property assignment.

Payments remain conservative for staff in the generic query API because the current schema proves their property relationship indirectly through invoices. They stay denied until that relationship is enforced with a trusted server-side join scope rather than a client-provided property ID.

## Release gates

Phase 2 must not be deployed until all of the following pass on the branch:

- Phase 1 platform authorization tests
- Phase 2 permission-engine and negative-access tests
- production build
- pull-request verification workflow
- database migration reviewed before merge/deployment

The pull-request workflow does not execute the Azure deployment job. Deployment remains merge-controlled after verification and review.
