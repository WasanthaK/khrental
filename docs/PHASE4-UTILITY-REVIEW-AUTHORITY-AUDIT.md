# Phase 4 — utility-reading review and mutation authority audit

Date: 2026-10-14  
Baseline: PR #262 merged at `1945ef06020af3f1bb93c7a283a44759466efc5e`.
Deployment workflow #38489769099 verified Ready revision `0000265`, exact public SHA and live MSSQL health.  
**Status: live compatibility risk; NOT authority parity. This document changes no runtime behavior.**

## Current call-site and route census

| Live route / surface | Service authority | Read/filter behavior | Writes and concern | Classification |
| --- | --- | --- | --- | --- |
| `/dashboard/utilities` — `UtilityBillingReview.jsx` | `utilityBillingService.fetchReadings`, `approveReading`, `rejectReading`, `updateReadingValue`, `fetchReadingById` | Generic platform `utility_readings` select; status/billing filters; relation expansion | Client-side rate calculation; `approveReading` updates `utility_readings`, may fall back to two separate writes; `rejectReading` tries RPC then multiple fallback writes and may report success based on a non-persisted synthesized response; edit path read-checks pending status then writes without atomic compare-and-swap | **LIVE / mutation migration required** |
| `/dashboard/utilities/review` — `staff/UtilityReadingsReview.jsx` | Direct `platformClient.from` calls | Generic platform reading query | Separate approval path writes `status`, `calculatedbill`, `billing_data` without setting canonical `billing_status='pending_invoice'`; then attempts `utility_billing` insert, logs errors but still reports success; separate rejection sets only `status='rejected'` | **LIVE / competing authority; migration required** |
| `/dashboard/utilities/invoicing` — `UtilityBillingInvoice.jsx` | `fetchReadingsForInvoice` -> `utilityInvoicePreviewReadClient` | Scoped pending/unlinked read | Read-only since PRs #260–#262; no direct invoice creation or reading linkage | **LIVE / keep** |
| Monthly invoice generation | `src/api/platform/monthlyBillingService.js` | Server-managed eligible utility readings, under transaction/tenant scope | Governed invoice creation, `invoice_id` attachment and `billing_status` transition with locking/idempotency | **LIVE / preserve sole invoice authority** |

All three utility dashboard routes are gated by `PERMISSIONS.UTILITIES_REVIEW` in `src/routes.jsx`. Route permission alone does not establish equivalent mutation authority; the server must enforce tenancy, assigned property and allowed transition checks.

## Verified behavior and contract gaps

1. The current MSSQL `utility_readings` table includes `status`, `billing_status`, `calculatedbill`, `invoice_id`, `approved_date`, `rejection_reason`, and `rejected_date`. These fields are coupled to the invoice generator. The generator selects `billing_status='pending_invoice'` and `invoice_id IS NULL` and uses transaction-scoped locks.
2. `approveReading` in the first route probes PostgreSQL-specific `pg_constraint` and calls `test_status_value`; the runtime authorization explicitly blocks `test_status_value`. It falls back to guessed statuses, local rates including hard-coded defaults, and non-atomic updates.
3. `rejectReadingWithProcedure` sends `p_reading_id`, `p_reason`, and `p_rejected_date` to `reject_utility_reading`; the current MSSQL RPC case reads `reading_id`/`readingId`. The RPC is administrator-only in `authorizePlatformRpc` and its mutation only changes `status`. The caller subsequently falls back to split direct updates, including after non-'function not found' errors. Do not infer successful rejection from the RPC attempt.
4. The staff review page still inserts `utility_billing`, absent from the approved admin platform-query table allowlist. Its approval logic can say 'ready for invoice' even if that insert fails, and it does not set `billing_status='pending_invoice'`.
5. The generic `guardBillingPlatformQuery` protects `invoices` and `payments` mutations, not all `utility_readings` updates. Administrator generic utility-reading writes remain allowed by `authorizeAdminQuery`; staff updates are not generally authorized through the current scoped staff read rules. Neither condition substitutes for a governed transition API.

This is source-backed risk evidence, not a claim that any specific production reading is damaged. No production database records were mutated during this audit.

## Proposed next bounded implementation (separate PR)

- Design a single authoritative server-side utility reading **review transition** (approve/reject/edit-pending) with explicit business permission, tenant/property scope, reading ownership and pending-status preconditions. Resolve the authoritative rate source; do not silently use guessed `50/25` defaults for charge creation.
- Use a transaction or compare-and-swap for status, amount, timestamps and billing fields together. Return typed errors, not synthesized success, and reject already invoiced/nonpending or cross-tenant transitions.
- Preserve invoice generation in `monthlyBillingService`: the new review service can make a reading eligible but never create an invoice, attach `invoice_id`, or mark it invoiced.
- Migrate one routed review surface at a time. Retain old routes as explicit, non-mutating or correctly delegated views until acceptance proves role/permission parity; do not remove the staff route on a source-search assumption.
- Add disposable two-tenant MSSQL integration proof, duplicate/concurrency tests, amount/precision checks, failure rollback tests, browser success/error state acceptance, and Evia regression. Require exact-head green and independent production Ready/serving SHA/MSSQL evidence.
- Keep the Evia fenced canary disabled; do not mix storage/identity or DDL work into review transition migration.

## Decision and release gate

**Phase 4 stays OPEN.** Do not assume legacy utility approval/rejection is safe simply because the invoice preview is read-only. Prioritize a single governed utility-review transition before more generic utility-reading compatibility retirement. This audit is classification-only: there is no runtime rollout or behavior change from this document.
