# KH Rentals Phase 2 Central Authorization Service

## Purpose

Phase 2 turns the Phase 1 containment rules into a reusable server-side permission model. The server remains authoritative; frontend route guards and legacy frontend permission strings are usability aids only.

## Compatibility rules

- Existing administrator behavior remains tenant-scoped and retains the Phase 1 runtime table allowlist.
- Existing tenant (`rentee`) ownership filters, agreement relationships, safe insert fields, and restricted update fields remain unchanged.
- No database migration is introduced in Phase 2.
- Existing stored roles remain valid and are translated into named server permissions.
- Unknown or unlinked roles remain default-deny.
- Generic staff access is not broadened where the current schema cannot prove the required resource assignment.

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

## Authorization dimensions

Permission checks alone are not sufficient. Phase 2 models four additional constraints:

1. **Tenant membership** — the membership must be active and match the selected tenant when a tenant ID is supplied.
2. **Ownership** — tenant-owned resources must resolve to the current application user.
3. **Job assignment** — assigned maintenance or task work must resolve to the current staff user.
4. **Property assignment** — a property-sensitive operation must resolve to a property assigned to the current staff user.

The central engine exposes these predicates separately so business endpoints can combine a named permission with the appropriate resource constraint.

## Current property-assignment compatibility decision

The current database does not contain a dedicated `property_assignments` table. Phase 2 therefore does not invent a migration or trust client-supplied property IDs as proof of assignment. Existing operational relationships (assigned maintenance and task records) remain the trusted assignment sources. Generic staff queries that cannot prove the required property relationship remain denied.

A future explicit property-assignment table can replace the assignment lookup without changing the named permission API.

## Platform-query integration

The Phase 1 platform query authorization now consumes the central engine for role interpretation and named permission decisions while preserving its existing safety controls:

- administrator table allowlist
- blocked runtime RPC list
- tenant ownership filters
- tenant property/unit/payment relationship scopes
- tenant field sanitization
- assigned maintenance and task filters for staff
- unfiltered mutation rejection
- unknown-role default deny

## Release gates

Phase 2 must not be deployed until all of the following pass on the branch:

- Phase 1 platform authorization tests
- Phase 2 permission-engine and negative-access tests
- production build
- pull-request verification workflow

The pull-request workflow does not execute the Azure deployment job. Deployment remains merge-controlled after verification and review.
