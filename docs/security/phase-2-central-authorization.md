# KH Rentals Phase 2 Central Authorization Service

## Purpose

Phase 2 turns the Phase 1 containment rules into a reusable server-side permission model. The server is authoritative. Frontend route guards and legacy frontend permission strings are usability controls only and do not replace server authorization.

The active tenant membership role is authoritative whenever a membership exists. A legacy role on `app_users` is only a compatibility fallback when there is no active membership role.

## Compatibility and security rules

- Existing administrator behavior remains tenant-scoped and retains the Phase 1 runtime table allowlist.
- Existing tenant (`rentee`) ownership filters, relationship checks, safe insert fields, and restricted update fields remain in place.
- Existing stored staff roles are translated into named server permissions.
- Unknown or unlinked roles remain default-deny.
- Staff property access is tenant-scoped through `staff_property_assignments`.
- The legacy `app_users.associated_property_ids` field is migration/backfill input only once the new assignment table exists.
- A role permission answers **what** a user may do; a property assignment answers **where** a staff user may do it.
- Client-supplied tenant IDs or property IDs are never accepted as proof of authorization.
- Where the server cannot prove the required ownership or property relationship, access stays denied.

## Role normalization

| Stored membership role | Business type | Phase 2 interpretation |
|---|---|---|
| `admin` | Administrator | Full named permission set, still subject to platform safety rules |
| `manager` | Staff | Broad operations on assigned properties; may manage rentees linked to assigned properties |
| `finance_staff` | Staff | Finance operations on assigned properties; rentee read only for assigned-property rentees |
| `maintenance_staff`, `maintenance`, `supervisor`, `staff` | Staff / contractor | Assigned maintenance/task work and limited property visibility as permitted |
| `rentee` | Tenant | Own-record access and constrained tenant actions |
| anything else | Unlinked | No business-data access |

The browser permission helper, protected routes, dashboard navigation, tenant context, and server permission engine all resolve the membership role before the legacy user role.

## Named permissions

The server permission vocabulary includes:

- `properties.read`
- `properties.manage`
- `property_assignments.manage`
- `rentees.read`
- `rentees.manage`
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

`property_assignments.manage` is administrator-only. Managers and other staff cannot grant themselves broader property access.

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
- created/updated timestamps

The unique tenant/property/staff key prevents duplicate logical assignments. Tenant/staff and tenant/property indexes support authorization lookups.

The migration is idempotent and backfills valid JSON values from `app_users.associated_property_ids` only when the user has an active staff-role membership and the property belongs to the same tenant. Rentee associations are deliberately not imported.

`staff_user_id` uses `ON DELETE CASCADE`, so deleting a staff record does not leave a blocking assignment reference. `assigned_by` is retained as an audit identifier without a foreign key, preventing deletion of a former administrator from blocking or destroying historical assignment information. The migration also repairs these constraints if an earlier Phase 2 draft was run manually.

Run the migration with:

```bash
npm run migrate:staff-property-assignments
```

The application deployment workflow does **not** execute this migration automatically. It must be run as an explicit release step before deploying application code that expects the assignment table.

## Assignment administration API and UI

Assignment administration is separate from the generic platform table API:

- `GET /api/property-assignments`
- `POST /api/property-assignments`
- `PATCH /api/property-assignments/:assignmentId`
- `DELETE /api/property-assignments/:assignmentId`

All operations require an authenticated user, an active tenant context, and `property_assignments.manage`. The server verifies the property belongs to the active tenant and the target user has an active staff membership in that tenant.

The Team Member Details screen exposes an administrator-only **Property Access** tab for assigning, deactivating, and reactivating property access. Deactivation is preferred over deletion in the UI so assignment history remains visible.

## Server-resolved assignment context

For an authenticated user with a selected tenant, tenant-context resolution loads active `staff_property_assignments` rows and attaches the resulting property IDs to the active membership as `assignedPropertyIds`.

The context then derives `assignedRenteeIds` on the server by querying agreements in the active tenant whose `propertyid` is in `assignedPropertyIds`. This means staff rentee scope is inferred from trusted agreement/property relationships rather than client-supplied property filters.

If the assignment table does not yet exist, the context layer can use legacy `associated_property_ids` temporarily. Once the new table exists it is authoritative, including when the assignment set is empty. An empty property set therefore also produces an empty assigned-rentee set.

## Central platform-query enforcement

The central platform authorization layer preserves the Phase 1 controls:

- administrator runtime table allowlist
- blocked schema/raw-SQL RPCs
- tenant ownership and relationship scopes
- tenant field sanitization
- direct maintenance/task assignment filters
- unfiltered mutation rejection
- unknown-role default deny

For staff with the relevant permission, direct property resources are filtered with the server-resolved assignment list:

| Resource | Permission | Server property scope |
|---|---|---|
| `properties` | `properties.read` | `id IN assignedPropertyIds` |
| `property_units` | `properties.read` | `propertyid IN assignedPropertyIds` |
| `agreements` | `agreements.read` | `propertyid IN assignedPropertyIds` |
| `invoices` | `invoices.read` | `propertyid IN assignedPropertyIds` |
| `utility_readings` | `utilities.read` | `propertyid IN assignedPropertyIds` |
| `cameras` | `cameras.read` | `propertyid IN assignedPropertyIds` |

If the role has the named permission but no active assignments, an empty `IN` scope becomes a false SQL predicate and returns zero rows.

Manager maintenance reads and updates are property-scoped. Maintenance staff/task workers retain the more specific direct assignment checks (`assignedto` / `teammemberid`).

Manager/finance agreement and invoice mutations are also property-scoped. Update payloads cannot change `propertyid`, preventing a user from moving an authorized record to an unassigned property. Agreement/invoice inserts require a `propertyid` that is already present in the server-resolved assignment list.

Managers may read and manage only rentee records whose IDs occur on agreements for their assigned properties. Finance staff may read the same assigned-property rentees but cannot mutate them. The server applies both `user_type = 'rentee'` and `id IN assignedRenteeIds`; an empty assignment set returns zero rentees. Self-profile access takes precedence so staff can still access their own permitted profile fields.

A manager may create a new rentee record because that operation is not yet tied to a property, but normal staff read/manage access begins only after an agreement links that rentee to a property assigned to the manager. This prevents creation itself from granting durable tenant-wide visibility.

Property creation remains administrator-only in Phase 2. A newly created property has no approved staff assignment, so allowing staff creation would conflict with the explicit assignment model. Managers operate and update properties after an administrator assigns them.

The legacy staff-side maintenance-create form currently models the creator as `renteeid`; therefore Phase 2 does not broaden manager maintenance creation through that form. Managers continue to read, update, prioritize, and assign existing maintenance work within assigned properties.

## Legacy MSSQL compatibility surface

KH Rentals still contains an older `/api/mssql` business API and many clients try that API before falling back to the platform client. Phase 2 must not allow it to become a second authorization engine or bypass central permissions.

The server therefore treats `/api/mssql` as a compatibility surface:

- `/health`, `/me`, and `/tenant-context` remain available for their existing purposes.
- Effective administrators may use legacy MSSQL business routes.
- Other business CRUD requests are rejected with `CENTRAL_AUTHORIZATION_REQUIRED`, causing existing clients to use `/api/platform/query` where the central permission/resource rules apply.
- Non-admin agreement and invoice creation are narrow compatibility exceptions, but the request is first passed through `authorizePlatformQuery`; payload sanitization and assigned-property validation therefore remain central.
- Agreement-template GET routes are a narrow read compatibility exception for users with `agreements.read`; the MSSQL router still applies active-tenant scoping.

This preserves existing MSSQL-first clients without maintaining two independent permission systems.

## Payments remain conservative

Staff payment access remains default-deny in the generic platform API because a payment's property relationship is indirect through invoices. A future change should enforce that relationship with a trusted server-side join/resource scope. A client-provided property ID is not sufficient proof.

## Release gates

Phase 2 must not be deployed until all of the following are complete on the final branch head:

- Phase 1 platform authorization tests pass
- Phase 2 permission-engine and negative-access tests pass
- production build passes
- pull-request verification workflow passes
- pull-request deploy job remains skipped
- database migration is reviewed and explicitly executed against the target database before the application deployment
- the final PR diff is reviewed after all authorization fixes

The PR should remain draft until these gates are satisfied. Production remains on the verified Phase 1 deployment until an explicit merge/release decision is made.