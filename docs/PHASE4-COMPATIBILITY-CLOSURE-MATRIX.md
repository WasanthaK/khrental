# Phase 4 compatibility closure matrix — 2026-10-13

Status: **ACTIVE / NOT READY TO CLOSE**. This is a verified source/search census, not an exhaustive runtime call graph or proof of endpoint parity.

## Current source census

GitHub repository code search on main reports **118 files** containing `platformClient` (including docs, tests and scripts), and **7 files** containing `platformClientCore`. Counts are repository search matches, **not 118 active runtime dependencies**.

| Priority | Surface | Evidence and current decision | Next release gate |
| --- | --- | --- | --- |
| Security/control-plane | `src/db/runMigration.js` and `npm run migrate` | Package command still executes legacy `platformClient.rpc('exec_sql')`. It is not the approved production migration authority. | Trace operational invocations and distinguish manual tooling before retirement. Do not execute it. |
| Security/control-plane | `src/components/admin/SqlMigration.jsx` | Already absent, with `tests/dead-browser-sql-migration.test.js` asserting this. The earlier inventory is stale. | Preserve removal; prevent reintroduction. |
| Security/control-plane | `scripts/run-production-migrations.mjs` and `.github/workflows/run-production-db-migrations.yml` | Governed production plan/apply workflow is present, with manual confirmation for apply. | Preserve privileged executor, migration ledger and no-DDL startup boundary. Actual executor provisioning remains a separate operational verification. |
| P1 billing | `src/services/invoiceService.js`, `src/services/paymentService.js` | Compatibility calls remain; `createInvoiceRecord` and `updateInvoiceRecord` have payment-service consumers. `getPropertiesWithPendingReadings` has a dashboard consumer. `fetchReadingsForInvoice` has a `UtilityBillingInvoice.jsx` consumer. | Test read/filter parity and protected invoice mutation behavior; do not remove live helpers based on search alone. |
| P1 agreement | `src/services/agreementService.js` | Compatibility operations remain; `listTemplates` is consumed by the template list/form selector and agreement form hook. | Trace templates, property/unit fallbacks, signed-document lifecycle and authorization. |
| P1 identity | `src/services/appUserRepository.js` and `platformClientCore.js` | Compatibility calls remain. `createAppUserRecord` is referenced by `createAppUser.js` and `appUserService.js`. | Preserve invitation/reset/member isolation and tenant identity; dedicated auth acceptance required. |
| P1 operations | Utility billing, maintenance and notifications | Live compatibility call sites remain in utility, lifecycle and UI modules. | Migrate per bounded domain with tenant isolation and lifecycle proofs. |
| P2 legacy candidates | `getCurrentUserPropertyAccess`, `generateInvoicesByProperty` | Indexed search found only definitions/docs, not proved absence of dynamic/manual use. | Verify import/route/operator census before any deletion. |

## Phase 4 release gates

1. Maintain this matrix as paths are verified, marking each operation **live, legacy-but-needed, dead, or unresolved**.
2. Use a single authority for production SQL changes. Never route migration DDL via an unprivileged browser or serving application startup.
3. Migrate one live compatibility operation/domain at a time, with authorization and contract-parity proofs.
4. Preserve billing amounts, invoice state, tenant scope, signature documents, invitation/reset flows, maintenance and utilities.
5. Keep separately verified Azure Ready, exact public SHA and live MSSQL evidence for each production merge; PR-head CI alone is insufficient.
6. Close Phase 4 only when the live inventory is discharged or explicit deferrals are agreed, before launching the Phase 5 full product regression.

## Immediate next bounded engineering item

Audit the **legacy `npm run migrate` caller/operational surface** and add static regression evidence that it does not run from serving startup and that the governed production workflow remains present. This slice must not execute migrations, remove commands or change database permissions. Then choose the first live invoice/agreements/auth compatibility contract for a separate behavior-changing PR.

## Constraints

Evia fenced archive canary remains disabled. Do not activate it as a side-effect of Phase 4 closure. Storage object-level immutability and external R2 credentials remain independent evidence-security questions.
