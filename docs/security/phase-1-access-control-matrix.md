# KH Rentals Phase 1 Access Control Matrix

## Purpose

This matrix is the acceptance specification for the first KH Rentals security release. It defines the minimum server-side access rules for the three business user groups agreed for the product: administrator, staff or contractor, and tenant or lessee.

The server is authoritative. Frontend navigation and route guards may improve usability, but they do not grant or enforce access.

## Role interpretation

| Stored value | Business user type | Phase 1 interpretation |
|---|---|---|
| `admin` | Administrator | Full tenant administration and operational access |
| `staff`, `manager`, `finance_staff`, `maintenance_staff`, `maintenance`, `supervisor` | Staff or contractor | Temporary legacy mapping; access must be limited by server policy |
| `rentee` | Tenant or lessee | Own active tenancy and own records only |
| `authenticated`, empty, or unknown | Unlinked account | Account setup only; deny business data by default |

## Platform query API

The generic `POST /api/platform/query` endpoint must apply both a tenant filter and the resource rule below. A client-supplied `tenant_id`, owner ID, assignment ID, or role never expands access.

| Resource | Administrator | Staff or contractor | Tenant or lessee |
|---|---|---|---|
| `app_users` | Read and manage within tenant | Read minimum fields when required for assigned work; no role or membership changes | Read own profile only; update approved profile fields only |
| `properties` | Read and manage | Read assigned properties; manage only with property permission | Read property attached to own active agreement only |
| `property_units` | Read and manage | Read units in assigned properties | Read own rented unit only |
| `agreements` | Read and manage | Read or manage only with agreement permission | Read own agreements only; no generic writes |
| `agreement_templates` | Read and manage | Read; manage only with template permission | No direct access |
| `invoices` | Read and manage | Read or manage only with finance permission | Read own invoices only; no generic writes |
| `payments` | Read and manage | Read or verify only with finance permission | Read own payments and submit proof through a business endpoint |
| `utility_readings` | Read and manage | Read or review only with utility permission | Read own readings and submit a reading for own unit |
| `maintenance_requests` | Read and manage | Read assigned or permitted properties; update assigned work fields only | Read own requests and create a request for own unit |
| Maintenance images and comments | Read and manage | Access only through an authorized maintenance request | Access only through own maintenance request |
| Notifications and letters | Read and manage | Access only with communications permission | Read own notifications and letters only |
| Tasks and assignments | Read and manage | Read own assignments; update approved task fields | No direct access |
| Cameras and monitoring | Read and manage | Read or manage only with camera permission | No access |
| Tenant membership and settings | Read and manage | No access unless explicitly delegated later | No access |
| Schema, migration, webhook, or diagnostic tables | No generic runtime access | No access | No access |

### Generic write restrictions

- Deny generic `delete` and `upsert` to tenant users.
- Deny generic writes to identity, membership, role, authentication, schema, webhook, and configuration resources for staff and tenants.
- Allow tenant-created maintenance requests and utility readings only after the server replaces tenant, lessee, property, and unit identifiers with verified values.
- Use purpose-built endpoints for payment proof, maintenance status, utility review, agreement lifecycle actions, invitations, and role changes.
- Reject unfiltered update and delete operations for every role.

## Platform RPC API

| RPC | Administrator | Staff or contractor | Tenant or lessee | Required Phase 1 action |
|---|---|---|---|---|
| `exec_sql` | Deny at runtime | Deny | Deny | Remove from runtime allowlist |
| `create_policy`, `enable_rls` | Deny at runtime | Deny | Deny | Remove from runtime allowlist |
| Schema creation procedures | Deny at runtime | Deny | Deny | Remove from runtime allowlist |
| `get_table_columns`, `test_status_value` | Admin diagnostic only | Deny | Deny | Remove from normal application flows |
| `reject_utility_reading` | Allow | Allow with utility review permission | Deny | Enforce permission and tenant ownership |
| `update_agreement_status` | Allow | Allow with agreement permission | Deny | Enforce permission and valid transition |
| `get_rentees_by_property`, `get_rentees_by_unit` | Allow | Allow only for permitted properties | Deny | Filter by assignments and return minimum fields |

## MSSQL routes

| Endpoint group | Administrator | Staff or contractor | Tenant or lessee |
|---|---|---|---|
| `/api/mssql/me` and `/tenant-context` | Own context | Own context | Own context |
| `/api/mssql/admin/*` | Allow | Deny | Deny |
| `/api/mssql/app-users*` | Allow | Restricted directory lookup only if required | Own record only |
| `/api/mssql/properties*` | Allow | Assigned properties | Own agreement property only |
| `/api/mssql/property-units*` | Allow | Units within assigned properties | Own agreement unit only |
| `/api/mssql/invoices*` | Allow | Finance permission | Own invoices read-only |
| `/api/mssql/agreement-templates*` | Allow | Agreement permission | Deny direct access |
| `/api/mssql/agreements*` | Allow | Agreement permission | Own agreements read-only; signing through a constrained endpoint only |

## Email and invitations

- Only administrators may invite users or resend invitations.
- The server must force the verified sender address and an approved template.
- The recipient must match the invited user record in the active tenant.
- Direct arbitrary email requests are denied.
- Invitation attempts are rate limited and audited without logging secrets or password material.

## Storage

- Bucket creation and deletion are administrator-only deployment or maintenance operations.
- Every object path is rooted under the verified tenant.
- Tenant files must also be rooted under an authorized record or user path; tenant scoping alone is insufficient.
- Upload, list, download, and delete operations must authorize the referenced agreement, invoice, maintenance request, or profile.
- Public URLs must not expose private tenancy documents.

## Frontend route expectations

| Workspace | Administrator | Staff or contractor | Tenant or lessee |
|---|---|---|---|
| Admin and staff dashboard | Full | Permission-derived modules only | Deny |
| Tenant portal | Support impersonation only if later designed and audited | Deny | Own portal |
| Team, tenant administration, settings | Allow | Deny unless explicitly delegated | Deny |
| Diagnostics, SQL migration, test email, test upload, signature demos | Disabled in production | Disabled | Disabled |
| Account setup | Allow when needed | Allow when needed | Allow when needed |

The duplicate `/rentee` and `/portal` trees should not be changed during the first containment patch unless required for a security fix. Route consolidation belongs to the later experience release.

## Required negative tests

1. A tenant cannot list `app_users`, agreements, invoices, payments, utilities, or maintenance records belonging to another tenant in the same organization.
2. A tenant cannot change `renteeid`, `tenant_id`, property, unit, assignment, approval, financial, status, or role fields.
3. A tenant cannot create, update, delete, or link an application user.
4. Staff without finance permission cannot read or modify invoices and payments.
5. A contractor cannot view or update an unassigned maintenance request.
6. Non-admin users cannot invoke administrative or schema RPCs.
7. Non-admin users cannot create or delete storage buckets.
8. An unknown or unlinked role cannot read business tables.
9. A requested tenant ID without an active membership is rejected.
10. Unfiltered update and delete requests are rejected.
11. Direct URL access cannot bypass server authorization.
12. Cross-tenant identifiers return not found or forbidden without revealing record details.

## Release gates

- Automated tests cover every negative test above.
- Existing administrator workflows still pass smoke tests.
- Tenant portal smoke tests use two tenant accounts in the same KH Rentals organization to prove record isolation.
- Staff tests include at least a finance profile and a maintenance contractor profile.
- Lint, authorization tests, production build, container smoke test, deployment, and live health check pass.
- No production database mutation is used to demonstrate an authorization weakness.
