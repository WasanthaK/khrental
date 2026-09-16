# Phase 3D: Portal consolidation and terminology

## Goal

Remove parallel browser route trees and make the canonical Phase 3 access model visible in the application structure.

Phase 3C made authorization and navigation capability-driven. Phase 3D makes each portal type use one real route family:

- administrator and staff workspace: `/dashboard`
- tenant / lessee portal: `/rentee`

The historical `/admin` and `/portal` URL families remain only as compatibility redirects.

## Route consolidation

### Administrator / staff

`/dashboard` is the only mounted administrator/staff workspace.

Legacy administrator URLs are translated as follows:

| Legacy URL | Canonical URL |
| --- | --- |
| `/admin` | `/dashboard` |
| `/admin/users` | `/dashboard/team` |
| `/admin/settings` | `/dashboard/settings` |
| `/admin/rentees` | `/dashboard/rentees` |
| `/admin/agreements` | `/dashboard/agreements` |
| `/admin/invoices/*` | `/dashboard/invoices/*` |

The legacy redirect remains administrator-protected. It does not provide staff with a route they could not otherwise access.

### Tenant / lessee

`/rentee` remains the canonical URL during the compatibility period because existing login, invitation, utility and tenant-portal flows already use it.

`/portal/*` is no longer a second mounted copy of the tenant route tree. It redirects, after tenant access validation, to the equivalent `/rentee/*` URL.

## Terminology

User-facing portal and tenant-management surfaces should say **Tenant**, **Tenant / Lessee**, or **Tenant Portal**.

Legacy implementation identifiers are intentionally not bulk-renamed in this phase. Examples include:

- stored role and `user_type`: `rentee`
- database relationship fields such as `renteeid`
- existing file/component/service names such as `RenteeForm` and `renteeService`
- legacy route segment `/dashboard/rentees`

Those identifiers are compatibility contracts and changing them would require a wider data/API migration. They should not be presented to users as role labels.

## Regression protection

`tests/route-policy.test.js` verifies that:

- `/portal` deep links resolve to `/rentee` equivalents;
- `/admin/users` resolves to `/dashboard/team`;
- supported old admin paths resolve to their dashboard equivalents;
- unknown `/admin` paths fail safely to `/dashboard`.

The route-policy test is included in `npm run test:authorization`.

## Database

No database migration is required.

## Completion gate

Phase 3D is complete when:

1. authorization tests pass;
2. the Vite production build passes;
3. Azure deployment health passes;
4. admin login still lands in `/dashboard`;
5. tenant login still lands in `/rentee`;
6. `/portal/invoices` redirects to `/rentee/invoices` for a tenant;
7. `/admin/users` redirects to `/dashboard/team` for an administrator;
8. tenant-facing portal headers and administrator tenant lists use tenant terminology.
