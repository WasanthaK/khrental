# Phase 4 invoice contract-parity audit — 2026-10-09

## Verdict: parity and caller census required before removing live code

This is a source-based inventory, **not** evidence of functional parity in production. No billing runtime, authorization, database, or migration code is changed by this review.

## Observed entrypoints and behavior

| Source | Read/write operation | Observed path and behavior | Change disposition |
| --- | --- | --- | --- |
| `src/services/invoiceService.js` `listInvoices` | list | MSSQL `GET /api/mssql/invoices` first when enabled; catches failures and falls back to `platformClient.from('invoices').select`. Query supports property, rentee, status, period, dates, pagination. MSSQL query builder does **not** encode array statuses or local sort options. | **Keep for now**; test list filter/sort/pagination and error/tenant behavior, then make failure semantics explicit. |
| `invoiceService.createInvoiceRecord` | create | MSSQL `POST /api/mssql/invoices`; on any error, falls back to generic platform `invoices.insert`. | **Do not simply remove or route elsewhere:** both generic writes and MSSQL compatibility writes are guarded with `BILLING_LIFECYCLE_REQUIRED` in the mounted server paths. Identify live consumer and authorized billing lifecycle equivalent first. |
| `invoiceService.updateInvoiceRecord` | update | MSSQL `PUT /api/mssql/invoices/:id`; on error, falls back to generic platform `invoices.update`. | Same restriction: preserve authorization, invoice draft/issue lifecycle, and fail-closed behavior. |
| `src/services/paymentService.js` `generateInvoice`, `updateInvoice` | legacy consumer of create/update | These exported functions call the invoice service wrappers. They are described as legacy single-invoice helpers; repository search did not establish UI callers. | Verify route, dynamic import, user workflow and external/manual consumers before retiring functions; avoid changing invoice state directly. |
| `invoiceService.fetchReadingsForInvoiceByProperty`, `fetchReadingsForInvoice` | reads | Direct compatibility reads of `utility_readings`; legacy schemas use different column names and query relational projections. `fetchReadingsForInvoice` has an indexed `UtilityBillingInvoice.jsx` consumer. | **Live/high-risk**; validate tenant/property constraints, reading state and response shape before MSSQL API substitution. |
| `invoiceService.generateInvoicesByProperty`, `generateInvoices` | create invoice + update reading | Direct generic inserts into `invoices` followed by `utility_readings` updates. Local loop does not demonstrate a single atomic tenant-scoped transaction; search found mostly documentation and definition references. | Do not execute or re-enable; trace callers and replace only through governed monthly billing/lifecycle contracts with atomicity/idempotency safeguards. |
| `invoiceService.getInvoiceSummaryByProperty`, `getPropertiesWithPendingReadings` | dashboard reads | Both consumed by `src/pages/InvoiceManagementDashboard.jsx`; compatibility queries remain. | Active; preserve summary totals, property authorization, pending-reading counts and performance. |
| `invoiceService.getInvoicesByProperty`, `getCurrentUserPropertyAccess` | reads | Compatibility client remains. Search found no indexed external callers for these exports. | Candidate for separate dead-export audit, not assumed dead without full route/import review. |

## Server authority and billing contract

- `server.js` mounts `guardBillingMssqlCompatibility` ahead of `createMssqlRouter` at `/api/mssql` and mounts the dedicated `/api/billing` routers separately.
- `src/api/platform/billingMutationGuard.js` rejects insert/update/delete/upsert for generic `invoices` and `payments` and rejects mutating `/api/mssql/invoices` and `/payments` compatibility routes with **409 `BILLING_LIFECYCLE_REQUIRED`**. Therefore do not describe `POST /api/mssql/invoices` or `PUT /api/mssql/invoices/:id` as supported write contracts just because route handlers exist.
- `src/api/mssql/router.js` still defines GET/POST/PUT invoice compatibility handlers. For GET, tenant role is denied visibility of drafts; `src/api/mssql/repositories.js` constrains invoice selects and updates with `tenant_id`. Ensure the compatibility guard remains ahead of the route and role filtering survives refactoring.
- `src/api/platform/billingRouter.js` implements draft, issue, payment, receipt and lifecycle APIs; `tests/billing-lifecycle.test.js` checks dedicated-mutation policy, draft visibility and various billing lifecycle rules.
- `src/services/paymentService.js` also calls `generateTenancyMonthlyInvoices` for governed monthly billing; do not conflate it with legacy `generateInvoice`.

## Required parity proof before a behavioral migration

1. **Call-site matrix:** identify static/dynamic imports and routes for each exported invoice helper, including `paymentService`, `UtilityBillingInvoice`, dashboard, and monthly billing; mark live/dead/uncertain.
2. **Authorization matrix:** property and tenant isolation, renter access limited to own non-draft invoices, staff billing permission, 404/403 behavior, no cross-tenant inference.
3. **Read parity:** filters (including arrays), date boundaries, stable pagination/sort, normalizing field names, utility readings joins and dashboard totals.
4. **Write protection:** 409 on generic and MSSQL compatibility invoice/payment mutations, no fallback that changes money after an MSSQL error; dedicated draft/issue/verify/payment endpoints only.
5. **Atomicity/idempotency:** never issue duplicate invoices or orphan updated readings; test at the API/store boundary, not only via source regex.
6. **Production acceptance:** operator-reported green PR deployment is not independent evidence of latest Azure Ready revision, exact serving SHA, or healthy MSSQL. Capture separately or document a reviewed waiver.

## Recommended next engineering slice

A **bounded, tests-first contract hardening PR** for invoice mutation failures and authorization, after verifying the legacy single-invoice form's actual callers. Prefer preventing a confusing compatibility retry over broad invoice rewrites. Preserve `/api/billing` workflows and do not delete invoice helpers solely on indexed search evidence. Do not alter payment totals or invoice statuses without transaction/tenant proofs.

See `docs/PHASE4-CLOSURE-READINESS.md` and `docs/EXECUTION-PLAN.md` for phase gates.

## 2026-10-14: legacy invoice generation guard

Source-search identified no indexed application consumers of the exported legacy `generateInvoicesByProperty` and `generateInvoices` functions. Unlike the governed monthly billing service, their former implementations performed separate generic invoice inserts and utility-reading linkage writes. The bounded Phase 4 follow-on retains these exported names and their legacy result envelopes, but makes both **fail closed** with `BILLING_LIFECYCLE_REQUIRED`. This avoids implicit database writes through an unapproved path while preserving explicit failure for any unknown caller.

The existing `listInvoices`, dashboard summary, pending-reading projections, and governed monthly billing APIs are unchanged. Absence of indexed callers is not proof against unknown external/manual callers; that uncertainty is why the exported functions are retained as non-mutating compatibility stubs. Authorization/build, runtime regression, and production exact-SHA acceptance still apply. Phase 4 stays open.

## 2026-10-14: property-access helper safety guard

An indexed source/caller census found no active application imports of `getCurrentUserPropertyAccess`. Its legacy fallback returned every property when no staff profile existed, without proving entitlement. This bounded security slice retains the function's result-envelope contract but fails closed with `PROPERTY_ACCESS_AUTHORITY_REQUIRED`. Real tenant and staff property selection must use server-enforced permission/tenant-scoped APIs, not this legacy fallback. Live invoice listing, property summary, pending-reading dashboard reads, and governed billing are unchanged. Unknown dynamic/manual callers remain possible and must handle the explicit failure. Phase 4 stays active.

## 2026-10-14: live invoice summary read and presentation correctness

The routed `InvoiceManagementDashboard.jsx` consumes live
`getInvoiceSummaryByProperty` and `getPropertiesWithPendingReadings`.
`getInvoiceSummaryByProperty` paginates authorized `listInvoices`
results to completion, but the dashboard previously retained stale summary
totals when an invoice-read request failed, or all selected properties
were cleared. It also generated last-day date cutoffs at midnight,
excluding most of the last calendar day from the inclusive
`createdat <= toDate` MSSQL query.

This bounded slice changes dashboard presentation and date-filter
construction only. A failed or superseded request cannot display its
previous totals as current; loading, failed and unselected states show
unavailable figures rather than `$0`. A successfully loaded empty result
may still display zero. Inclusive month/year end-of-day bounds are tested
for calendar rollover and leap years. No financial writes, SQL schema,
API authorization, invoice payment state, or monthly billing logic change.

Retain the existing tenant-scoped API and its fail-closed error behavior.
Browser-backed financial dashboard acceptance and two-tenant read
parity remain broader Phase 4/5 release gates.


## 2026-10-14: invoice-list response shape and month-end SQL parity

The live `listInvoices` service has both MSSQL and retained platform-query
transports. Source inspection confirmed that a non-array MSSQL response
previously mapped silently to `[]`, which can misstate a failed financial
read as zero invoices. A bounded Phase 4 correction uses a shared, executable
response contract to reject missing/malformed invoice lists, preserving the
existing error envelope and never retrying a failed authoritative MSSQL
request through the alternate transport.

The disposable two-tenant SQL Server test already covers SQL-side renter
ownership, no draft leakage, repeated status filters, allowlisted sorting
and pagination. This slice adds positive month-end (October 31 late evening)
and negative next-month (November 1 at midnight) `createdat` read parity,
plus same-tenant other-renter denial, matching the inclusive dashboard
date-range calculation. The tests use disposable records only and remove
their fixtures before the subsequent billing acceptance checks.

The live dashboard API and monthly billing writer remain unchanged.
Remaining phase gates include read-path browser acceptance, full migration
census, and production Ready/exact SHA/live MSSQL evidence.
