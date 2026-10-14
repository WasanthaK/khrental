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

## Utility invoicing helper caller audit — 2026-10-14

PR #261 merged as `5f8b433bcf610b5fe34c41b65a9a1223408259b4`;
Azure revision 0000264 reached Ready, public SHA matched, live MSSQL
reported ready and the post-merge Evia workflow succeeded.

- **Live:** `fetchReadingsForInvoice` is used by the routed, read-only
  `UtilityBillingInvoice.jsx` screen. It now uses the authenticated
  `utilityInvoicePreviewReadClient` and remains intact.
- **Dead (source-search census):** `markAsInvoiced` has no importing or
  invoking application call sites after PR #260 removed the routed mock-ID
  action. Retire this helper rather than retaining an alternative utility
  linkage mutation path.
- **Dead (local source census):** `discoverValidStatusValues`,
  `READING_STATUS` and its associated cache have no callers after PR #261
  removed the legacy invoice-preview status fallback.
- **Preserved live:** `approveReading` and `rejectReading` are used by
  `UtilityBillingReview.jsx`. `getValidStatusesFromConstraint` remains
  required by the approval path. Keep these as-is for a separate governed
  lifecycle evaluation.
- **Not retired:** `invoiceService.fetchReadingsForInvoice` is a distinct
  exported helper; its own consumer audit is not proved by this slice.
- **Authority:** `monthlyBillingService` retains sole approved invoice
  creation and transactional reading-linkage responsibility.

The source-search census does not prove absence of all possible dynamic
third-party calls; this bounded removal is subject to PR-head build and
regressions. No server or SQL schema change is proposed.

## Utility approval/rejection authority census — 2026-10-14

Production acceptance for PR #262 is independently verified: merge
`1945ef06020af3f1bb93c7a283a44759466efc5e`, Ready revision
`0000265`, public exact SHA, and live MSSQL health; deployment workflow
`38489769099` succeeded.

**High priority / LIVE / not yet governed:** Both routed utility review
screens have competing client-side approval/rejection code. The admin page
has split fallback mutations and the staff page writes a legacy
`utility_billing` table. Read-only invoicing preview remains safe to
preserve, but does not establish review-write authority parity.
See `docs/PHASE4-UTILITY-REVIEW-AUTHORITY-AUDIT.md` for source-backed
contracts, caller paths, permission mismatches and next proof gates.

**Next bounded item:** design and implement a single server-governed
utility review transition, beginning with approval/rejection preconditions,
tenant/property authorization and transactional updates. Preserve invoice
creation/attachment exclusively in monthly billing. Require two-tenant SQL
and browser acceptance before merging behavior changes. Phase 4 OPEN.

## Utility review legacy writer retirement — 2026-10-14

The primary and staff routed utility-review actions now use the governed
server transitions. Pending meter edits also use the scoped compare-and-swap
endpoint as of PR #265 (production deployment acceptance is tracked separately).

A current import and source-search census finds no application consumers of
the retired client-side `approveReading`, `rejectReading`,
`rejectReadingWithProcedure`, `getValidStatusesFromConstraint`,
`updateReadingValue` or `createApproveReadingProcedure` definitions.
This slice removes these obsolete compatibility mutation paths, including
PostgreSQL constraint introspection and an inert procedure-success stub.
Preserve live read helpers, renter submissions, the governed server review
API, and transactional monthly billing as the only invoice-linkage writer.

Classification: retired writers **DEAD by indexed call-site census**;
remaining utility service read and submission functions **LIVE/UNRESOLVED**.
No broad compatibility-client retirement, schema or permission change.
Phase 4 stays OPEN.

## Agreement property and unit authority — 2026-10-14

Live `agreementService` property and unit read helpers are consumed by
agreement form hooks, context, and workflow services. An audit found that
`fetchProperty`, `listProperties`, `fetchPropertyUnit`,
`listPropertyUnits`, and `updatePropertyData` caught errors from the
authoritative MSSQL APIs and retried through generic compatibility queries.
This could turn an authorization denial, missing resource, transient failure,
or ambiguous property update into a second request on a different transport.

The bounded Phase 4 fix propagates the MSSQL error without fallback whenever
MSSQL is explicitly enabled; the compatibility-only mode is preserved when
the API is disabled. No agreement signing, Evia event handling, template
lifecycle, SQL schema or property data is changed. Regression tests exercise
401/403/404/409/5xx failures for all five live operations and prove that no
second generic read/write occurs.

Classification: property and unit helpers **LIVE**; fallback after an
authoritative API failure **RETIRED**. A two-tenant browser agreement form
and signing acceptance remains a separate broader regression gate.

## Agreement directory pagination and response integrity — 2026-10-14

The live Property Details directory uses `listAgreementsByProperty` and
`listAgreementsByUnitIds` from `agreementService`. Both previously fetched
only 500 agreements and silently treated a malformed authoritative MSSQL
response as an empty list. The underlying tenant-scoped SQL list ordered only
by `createdat`, which may tie and lead to omissions or duplicates across
OFFSET/FETCH pages.

This bounded Phase 4 slice reads complete sequential 500-row pages, validates
every page and unique agreement ID, and fails explicitly instead of claiming
there are no agreements after malformed, duplicate or truncated results.
MSSQL ordering now uses `a.createdat DESC, a.id ASC` as a stable
tie-breaker. Tenant, unit, property and status predicates stay on the server.
No agreement mutation, signing/Evia, property status, SQL schema or invoices
are changed. Pure pagination tests cover more than 500 results, exact-page
boundaries and explicit failures. Full authenticated browser acceptance
remains a separate Phase 4/5 gate.

## Agreement template directory read parity — 2026-10-14

`agreementService.listTemplates` has live consumers in the agreement form,
template selector, template form and template list. Its authoritative MSSQL
read requested only `pageSize=500`, silently truncating tenants with more
templates. The SQL endpoint ordered by `name ASC` without a stable tie-break.
This bounded follow-on uses the already-tested paged, fail-closed agreement
collection contract, requests successive tenant-scoped template pages,
validates record IDs and completeness, and orders SQL template pages by
`name ASC, id ASC`. Explicit schema-unavailable behavior still returns
`[]`; an authoritative denied or malformed read does not retry through
the compatibility client or appear as an empty success.

Existing create/update/delete permissions and signature/retained-document
lifecycle remain unchanged. The authorization regression and real pagination
tests cover 1001 templates, missing-schema behavior and SQL ordering.
Phase 4 remains ACTIVE until live auth, other compatibility domains, the
migration-authority review and final census/closure are discharged.

## App-user mutation authority — 2026-10-14

The app-user repository exposes four **LIVE** writes used by account and
invitation workflows: `createAppUserRecord`, `linkAppUserRecord`,
`updateAppUserRecord` and `deleteAppUserRecord`. When the scoped MSSQL
API was enabled, these previously retried a failed authoritative request
through `platformClient.from('app_users')`; even an ambiguous transport
error or a 404 could induce a second write with changed authorization
semantics. This bounded slice retains the existing return envelopes and
explicitly disabled-MSSQL compatibility branch but **fails closed** for
all MSSQL write failures, including 401/403/404/409/5xx/network.
Pre-existing email-conflict normalization remains unchanged.

Regression tests isolate all four actual function bodies and prove no
generic second mutation, preserve their correct API methods, and verify the
tenant-context middleware remains mounted on the server. **No auth
credentials, invitation/reset tokens, users or schema are changed in this
slice.** Identity reads, invitations and registration are separately
LIVE/UNRESOLVED and need a dedicated contract/tenant acceptance before
full Phase 4 closure.

## Identity lookup / invitation-read authority — 2026-10-14

The live `appUserRepository` identity read helpers
`findAppUserByEmailRecord`, `findAppUserByAuthIdRecord`,
`checkAppUserInvitationStatusRecord`, `fetchAppUserRecord` and
`fetchAppUsersRecord` previously retried a failed authoritative MSSQL
request via `platformClient.from('app_users')`, including 401/403/404,
ambiguous transport errors and server failures. The list helper also
treated a malformed MSSQL result as `[]`. This bounded slice preserves
the existing API return envelopes (success/failure objects, single-record
throws and list arrays), tenant-authenticated server routes, and explicit
compatibility mode when MSSQL is off, but does not retry a denied MSSQL
read under a different client. Invalid lists now fail explicitly.

An additional create-user precondition prevents `createAppUserRecord`
from attempting an INSERT after the duplicate-email lookup failed; it
does not treat an authorization or connectivity failure as proof that an
email is unused. The source-backed runtime tests prove each read's
no-fallback behavior for authorization denials and 5xx/network failures,
distinguish successful no-match/empty lists, reject malformed lists, and
prove failed duplicate-email preflight cannot attempt a create.

No invitation token changes, password resets, tenant membership changes,
SQL schema changes, or production user mutations occur in this slice.
Invite/registration and complete tenant browser acceptance remain separate
release gates; Phase 4 stays ACTIVE.

## Production migration runbook and authority audit — 2026-10-14

A source-search and deployment census found no live serving-startup caller of
`src/db/runMigration.js`; its package `migrate` command remains as manual
legacy SQL-RPC tooling, not the approved production executor. The container
starts `node server.js` after environment generation, and the serving
deployment workflow does not run schema DDL. The governed production
migration workflow already supports read-only `plan`, manually confirmed
`apply`, GitHub's Production environment and a dedicated executor or
privileged direct SQL connection.

Older `database.md` and `docs/free-cloud-deployment.md` runbook sections
still advised one-off direct SQL files during production provisioning and
suggested runtime DDL capability for auth tables. Those instructions are
reconciled to the governed workflow without applying any SQL. A new
source-backed authorization-suite regression asserts serving startup stays
DDL-free, plan/apply tools remain distinct, confirmation and dedicated
migration markers persist, and both production guides direct operators to
the controlled workflow. Legacy commands are **retained** for caller/usage
inventory; they are not declared production-authorized.

This is **static evidence only**, not proof that the dedicated
`khrental-db-migrator` job exists, is privileged, can reach Azure SQL or
has a reconciled `dbo.schema_migrations` ledger. Verify those separately
before production apply. No database grant, schema, canary, migration or
production user mutation is performed in this slice.

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
