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

## In-app notification delivery truth — 2026-10-14

Live maintenance lifecycle notifiers use `notificationService.notifyUser`.
Its compatibility notification INSERT previously caught and suppressed a
database authorization or persistence failure and then returned
`{ success: true }`, even though the in-app message had not been saved.
The same file has placeholder email/SMS logging, not a substitute for
successful delivery. Staff-notification and cancellation fan-out wrappers
also returned `success: true` when individual notifications failed.

This bounded slice preserves the current scoped notification INSERT and
does **not** introduce a new transport or alter authorization. If the
in-app INSERT returns an error or throws, `notifyUser` now returns
`success: false` with an explicit persistence failure and never claims
placeholder email/SMS delivery. Staff/cancellation aggregators return
a failed summary when any selected recipient write failed, retaining
per-recipient results. Successful in-app storage retains its existing
`success: true` envelope. Maintenance state transitions remain owned by
the server lifecycle and are not rolled back by best-effort notifications.

The actual notification function bodies are tested against successful,
denied, failed and rejected insert boundaries. This does **not** prove
full notification tenant-scope or real email/SMS delivery; those remain
Phase 4/5 end-to-end and capability decisions. No DDL or Evia changes.

## Maintenance post-transition projection read authority — 2026-10-14

`maintenanceLifecycleService` previously reloaded request details via a
generic compatibility query after successful canonical lifecycle actions,
including a joined property/renter/staff/image projection. This introduced
a second, potentially differently authorized read after tenant-scoped
transitions; its failure could also make a successful creation or
assignment appear unsuccessful.

This bounded change reuses the existing authenticated
`GET /api/maintenance-lifecycle/requests/:requestId` projection, whose
server enforces tenant scope, renter ownership, manager property assignment,
and assigned worker access. A small mapper preserves the request fields and
the display-relevant property name/address, renter name/email, assigned
staff name and image list that the server actually returns. A denied,
failed, or malformed lifecycle projection no longer retries generic
`maintenance_requests` reads.

Tests exercise the actual read helper with denied outcomes, response-shape
mapping and source-level tenant/owner SQL guards. **Deferred:** the separate
`maintenance_request_images` generic insert path and other maintenance
screen compatibility reads need specific authorization/contract review.
No lifecycle mutation, email/SMS delivery, SQL schema, permissions, or
Evia canary is altered. Phase 4 remains active.

## Batched maintenance image / notification tenant authority — 2026-10-14

**Implementation grouped into one PR and one production rollout**, avoiding
separate build/deploy cycles for closely related authorization work.

- **Maintenance image attachments:** Replaced the live generic
  `maintenance_request_images` INSERT after lifecycle transitions with
  `POST /api/maintenance-lifecycle/requests/:requestId/images`. The existing
  authenticated tenant context and request loader establish organization
  ownership first. The new guarded writer allows the owning renter, manager
  with assigned property scope, or assigned worker with update permission,
  and only while pending/in-progress. It validates an image URL under the
  active tenant's `images/maintenance` storage namespace and writes the
  actor/tenant/request IDs from the server. The original image object storage
  upload remains separate; failed metadata attachment is not counted as
  successful. No generic writer fallback or schema change is introduced.
- **Notification self-service:** Moved `getUserNotifications` and
  `markNotificationAsRead` onto dedicated tenant-authenticated
  `GET /api/notifications/me` and `PATCH /api/notifications/:id/read`.
  SQL now binds both active tenant and app-user ID for every read/update,
  with stable paged ordering and a 404 for nonexistent/foreign identifiers.
  Client-provided `userId` cannot widen the self-only read.
- **Cross-tenant recipient rejection:** Generic in-app notification inserts
  now require the specified recipient to hold an **active membership in the
  same tenant**, even when requested by an organization admin. The check runs
  before any insert. No implicit auto-email or SMS delivery is claimed.
- **Acceptance:** Added source-backed and executable policy/client tests
  covering owner/staff/property scope, terminal states, foreign storage URL
  and tenant path rejection, notification tenant-and-user SQL predicates,
  same-tenant recipient eligibility, pagination and denied/malformed reads.
  The existing authorization/build suite remains mandatory. Live two-tenant
  browser and real SQL integration acceptance are still separate Phase 4/5
  gates; source-level assertions do not replace that evidence.

**Deferred explicitly:** Other maintenance screen generic reads, notification
fan-out and email/SMS delivery, and exhaustive Phase 4 compatibility closure
inventory. No SQL DDL, migration apply, user reset/invitation, billing writer,
Evia or production data mutation is part of this batch.

## Consolidated SQL acceptance and workflow budget — 2026-10-14

This bundled Phase 4 package adds real disposable SQL Server checks to the
already established two-tenant billing/authorization harness for:

- `notificationAccess.listOwnNotificationPage` returns only the owning
  organization and application user, not a different tenant's messages.
- `markOwnNotificationRead` cannot mark a foreign user's or another
  tenant's notification, and leaves those rows unchanged on denial.
- `requireNotificationTenantRecipient` accepts a same-tenant active
  membership and rejects a cross-tenant recipient.
- Maintenance requests and image metadata are seeded in both tenants
  for request/tenant filtering, actor authorization and tenant-root URL
  validation. These are parameterized SQL contract checks against the
  same **disposable Docker SQL** fixture; they are not a substitute for
  full authenticated browser attachment workflow acceptance.

**SQL acceptance finding:** The first real disposable acceptance run uncovered
an existing maintenance owner authorization mismatch when SQL Server
returned the same GUID in uppercase while session/user IDs were
lowercase. Authorization now compares nonempty canonicalized identifiers
in owner, assigned-worker and property-scope checks without changing
the underlying tenant checks, and a regression covers mixed-case GUIDs.
Keep the failed initial CI run in the audit trail; only a clean exact-head
rerun may pass this release gate.

**Action cost control:** Generic `server.js` and platform router changes
no longer trigger extra Evia-specific test jobs or a webhook-secret
configuration run. The exact-head `test:authorization` suite now executes
the Evia webhook, completed-document, V2 OAuth and signing tests in
addition to previously included audit/retention tests; Evia-specific
workflows still run when their actual source, test, storage or workflow
files change. The Production webhook configuration remains manually
dispatchable and still runs on actual `src/api/evia/**` changes.
The main deploy workflow retains PR-head verification and automatically
skips production deployment for commits containing **only** documentation,
tests or workflow files. Mixed code/documentation commits still deploy.

**Remaining before Phase 4 sign-off:** Full authenticated browser
maintenance/notification acceptance; remaining live business compatibility
callers and owned deferrals; migration executor provisioning/ledger
evidence; signature, billing and identity contract sign-off. This batch
does **not** mark Phase 4 complete or activate the Evia canary.

## Phase 4 release gates

1. Maintain this matrix as paths are verified, marking each operation **live, legacy-but-needed, dead, or unresolved**.
2. Use a single authority for production SQL changes. Never route migration DDL via an unprivileged browser or serving application startup.
3. Migrate one live compatibility operation/domain at a time, with authorization and contract-parity proofs.
4. Preserve billing amounts, invoice state, tenant scope, signature documents, invitation/reset flows, maintenance and utilities.
5. Keep separately verified Azure Ready, exact public SHA and live MSSQL evidence for each production merge; PR-head CI alone is insufficient.
6. Close Phase 4 only when the live inventory is discharged or explicit deferrals are agreed, before launching the Phase 5 full product regression.

## Next consolidated engineering package

Complete remaining live compatibility caller inventory and the authenticated
tenant/billing/agreement release acceptance checklist as a single bounded
Phase 4 closure decision. Mark unresolved high-risk items BLOCKED rather than
silently waiving them; separately owned and controlled noncritical deferrals
may move to Phase 5. Do not execute production migrations, change payment
authority, weaken tenant scope, or activate the fenced Evia canary.

## Constraints

Evia fenced archive canary remains disabled. Do not activate it as a side-effect of Phase 4 closure. Storage object-level immutability and external R2 credentials remain independent evidence-security questions.

## Package C — live staff maintenance image attachment closure (2026-10-15)

Caller census identified an actual routed staff page, `src/pages/MaintenanceDetails.jsx`, still importing `addMaintenanceRequestImage` through the `maintenanceService.js` compatibility facade. That name previously resolved to the generic `maintenanceServiceLegacy.js` writer, which inserted `maintenance_request_images` metadata without server-side request/tenant/property authority. The canonical `POST /api/maintenance-lifecycle/requests/:requestId/images` already exists and verifies the tenant, request ownership/assigned staff/manager property scope, open state and tenant-local image path before SQL insertion, with the actor derived from the authenticated server context.

This batch explicitly exports `addMaintenanceRequestImage` from a scoped adapter, shadowing the legacy star re-export. It preserves the current page's `{success, data, error}` envelope and existing file upload mechanism, preflights request read access before uploading bytes, forwards only image URL/type/description (never client-provided uploaded-by), then requires an acknowledged server attachment. A denied preflight, upload, server denial or missing acknowledgment cannot appear as successful attachment; no fallback generic metadata insert is performed. `general` and `progress` legacy UI types map to the server's `additional` image category.

**Not claimed:** full retirement of `maintenanceServiceLegacy.js`, proof that unused historical pages have no residual generic writes, real R2 file acceptance for a production renter, or final cross-tenant browser coverage. Those remain in the Package C compatibility/acceptance register. The explicit export is the narrow live-callsite boundary; all other legacy exports remain pending individual census.

No schema migration, real production data mutation, webhook signing, billing or email changes. Verify exact-head authorization/build and disposable two-tenant SQL/browser before merge; record exact Azure Ready SHA and MSSQL after any runtime deployment. Phase 4 remains OPEN, Phase 5 gated.

## Package C — routed staff/renter maintenance detail reads (2026-10-15)

Both routed detail pages previously made generic compatibility queries against `maintenance_requests` using supplied request IDs (and the renter page an additional browser-side rentee-ID predicate). The staff page also contained a development-only button that directly queried `maintenance_request_images` and could backfill request UI state from a separate, differently authorized read.

The new `getAuthorizedMaintenanceDetail` delegates only to `GET /api/maintenance-lifecycle/requests/:requestId` and the validated `mapMaintenanceLifecycleProjection`. Server SQL restricts organization and ID, then `assertReadAccess` checks the owning renter, property-scoped manager or assigned worker. The server independently filters internal comments for renters. Malformed responses and denied access do **not** fall back to generic compatibility queries. The development-only direct image query/button is removed.

This is **bounded detail-read closure**, not generic client retirement. Renter comments and other adjacent legacy reads/writes still require separate caller/contract inspection; completion/assignment/notification side effects remain unchanged. CI must run the exact-head build/authorization suite plus disposable two-tenant SQL/browser acceptance and perform independent Azure Ready/public SHA/MSSQL proof if merged. Phase 4 remains active and Phase 5 gated.

## Package C — maintenance staff and renter list-read containment (2026-10-15)

Both routed maintenance list pages, `src/pages/MaintenanceList.jsx` and `src/pages/rentee/RenteeMaintenance.jsx`, previously called generic `platformClient.from('maintenance_requests')` table reads. They now call a dedicated paginated `GET /api/maintenance-lifecycle/requests` endpoint, using the authenticated tenant middleware and actor/membership derived exclusively on the server. Renters see requests matching their verified user identity; managers have organization-wide visibility only when administratively authorized, otherwise restricted to assigned properties; assigned workers see their assigned requests. The endpoint binds tenant ID in every SQL query, uses stable creation-date/ID ordering and tenant-filtered batched images, and rejects invalid pagination. Failed list reads clear stale results rather than reusing a generic client or another tenant's cached rows.

This package is code-level isolation coverage pending disposable two-tenant SQL and browser acceptance. It does not retire `maintenanceServiceLegacy`, authorize migration apply, change production records or prove external mailbox and Evia canaries. Phase 4 remains open, Phase 5 gated.

## Package C — maintenance request eligible property selector (2026-10-16)

The renter maintenance creation form now sources selectable properties exclusively from the existing authenticated `GET /api/tenancies/me/summary` active-agreement projection. This endpoint selects by server-established tenant and renter ID, not legacy `app_users.associated_property_ids`. Invalid responses fail closed; property selection clears on tenant change and submission checks membership of the server-derived choice. The existing creation endpoint continues enforcing active tenancy independently. The legacy generic property lookup is removed only from this form. CI authorization and disposable two-tenant SQL workflows must pass before merge. No DDL, live Evia signing or Phase 5 authority is introduced.

## Package C — explicit maintenance compatibility exports (2026-10-16)

The public maintenance service facade previously wildcard-exported the historical generic CRUD module. A caller census found live routed screens using governed create/assign/start/complete/cancel/comment/image operations; an old unmounted component referenced generic read/comment aliases, while unrestricted direct update/delete helpers had no verified active caller. This change keeps historical source on disk but replaces the wildcard public export with explicit aliases. Legacy read aliases now call authenticated lifecycle/list readers (caller-provided user ID and role are ignored); comment alias delegates to canonical lifecycle comments. Generic update and delete aliases reject without executing SQL. This is a bounded public facade closure, not a claim that obsolete source files or unmounted UI components can safely be deleted.

Authorization/build and disposable two-tenant SQL acceptance are required before merge. There is no migration apply, real production mutation, external email or Evia canary. Phase 4 remains open and Phase 5 gated.

## Package C — live payment reminder authenticated client (2026-10-16)

The routed Invoice Details page invokes `paymentService.sendPaymentReminder`. That method previously used an unscoped relative `fetch` rather than the standard authenticated active-tenant billing request. It now delegates to `sendInvoicePaymentReminder` in the established platform billing client, which supplies session and active tenant request context. The method retains the previous `{success, data/error}` envelope and requires a provider-accepted, matching-invoice acknowledgement before displaying success. The server continues to own invoice management, assigned-property restrictions and reminder delivery events. No provider delivery outcomes, invoice totals, payment verification, schema or migration authority are changed. Source-backed regression and the disposable SQL acceptance workflow gate this change. Phase 4 remains active and Phase 5 gated.


## Package C consolidated live-caller disposition — 2026-10-16 (main `09b443ceaeaa1ba9050dc958b9f20a894deb13a1`)

This is the **existing** Package C caller census and closure decision, not a new migration, CI framework, or approval to delete compatibility code. Classification is grounded in checked-in named imports/references, mounted server routes, existing test contracts and the current source baseline. Indexed source search cannot exclude unknown dynamic imports, operator invocations, or third-party manual callers; treat those as **unresolved**, not proven dead. Older dated audit passages above remain historical evidence and must not be read as current implementation.

| Surface and concrete callers | Current class | Evidence and release decision |
| --- | --- | --- |
| `invoiceService.listInvoices` → invoice summary; `getInvoiceSummaryByProperty` and `getPropertiesWithPendingReadings` → `InvoiceManagementDashboard.jsx` | **LIVE — retain** | MSSQL list failures do not retry via another transport; validated rows, status/date/sort/paging and summary failure handling are already covered by `invoice-fail-closed`, `invoice-list-read-contract`, dashboard tests and the disposable two-tenant SQL fixture. Do not replace the remaining compatibility-only transport without parity. |
| `invoiceService.createInvoiceRecord` / `updateInvoiceRecord` → `paymentService.generateInvoice` / `updateInvoice` | **LEGACY-BUT-NEEDED AS FAIL-CLOSED ALIASES; UNKNOWN MANUAL CALLERS** | Both core writers throw `BILLING_LIFECYCLE_REQUIRED`. Source search found no routed application consumer of the single-invoice wrappers; that is not proof against dynamic/manual use. Keep failures explicit, never replace with a generic INSERT/UPDATE or bypass dedicated `/api/billing` lifecycle. |
| `invoiceService.generateInvoicesByProperty` / `generateInvoices`, `getCurrentUserPropertyAccess` | **LEGACY-BUT-NEEDED AS NON-MUTATING DENIAL CONTRACTS** | No indexed live caller; currently fail closed. Keep until manual/dynamic caller disposition is approved. |
| `invoiceService.fetchReadingsForInvoice`, `fetchReadingsForInvoiceByProperty`, `getInvoicesByProperty` | **UNRESOLVED / candidate dead export, not retired** | Search found definitions, tests or docs but no proven routed consumer. **Important correction:** `UtilityBillingInvoice.jsx` imports `fetchReadingsForInvoice` from **`utilityBillingService.js`**, which uses `utilityInvoicePreviewReadClient.js`, **not** the similarly named function in `invoiceService.js`. No broad deletion without import/build parity and operator census. |
| `paymentService.uploadPaymentProof` → `PaymentProofUpload.jsx`; `verifyPaymentProof` → `PaymentVerification.jsx`; `markInvoiceAsPaid`, `sendPaymentReminder` → `InvoiceDetails.jsx` | **LIVE — retain governed lifecycle** | Server-owned payment/receipt and scoped image-byte access; reminder now uses the tenant-aware authenticated billing request (PR #306) and exact invoice acknowledgment. Controlled delivery state is not proof of external mailbox receipt. Reuse existing payment/SQL/browser acceptance. |
| `paymentService.generateMonthlyInvoices`; `checkOverdueInvoices` | **UNRESOLVED wrapper callers** | Monthly issuance authority is the mounted `monthlyBillingRouter` / `monthlyBillingService` plus scheduler, **not** the similarly named payment-service wrapper. No indexed routed caller for the wrapper or overdue checker; do not infer scheduler uses them. |
| `agreementService.getTemplate`, `listTemplates`, `createTemplate`, `updateTemplate`, `deleteTemplate` | **LIVE — retain** | Concrete callers: `SimpleTemplateForm`, `AgreementTemplateForm`, `AgreementTemplateList`, `AgreementTemplateSelector`, form hook/context/workflow. Dedicated tenant-scoped MSSQL API and `AGREEMENTS_MANAGE` mutations remain authoritative; `agreement-template-fail-closed.test.js` already covers denial and 1001-item pagination. Real Evia signature and retained PDF is a separate external gate. |
| `agreementService` property/unit and agreement directory helpers | **LIVE — retain** | Form, agreement-detail and property directory consumers; existing no-fallback permission and pagination tests. Maintain the signed-document immutability and exact-tenant byte read restrictions; do not merge compatibility transports. |
| `appUserRepository` identity read/write helpers | **LIVE — retain** | `appUserService`, `createAppUser` and invitation/recovery workflows; existing fail-closed, invitation and two-tenant session tests. Never auto-fallback from authoritative identity write/read to generic `app_users` mutation. |
| `maintenanceService.js` public facade, notification self-service, utility review/preview | **LIVE — retain governed interfaces** | PRs #301–#305 constrain routed maintenance list/detail/image/create and explicit facade exports; renter/staff notifications and utility transitions already have SQL/browser fixtures. `maintenanceServiceLegacy.js` remains present but is not wildcard-exported. Unknown historical/manual callers stay unresolved; no mass deletion. |
| `src/db/runMigration.js` / `npm run migrate`; `src/db/executeSql.js` and named `migrate:*:mssql` commands | **UNRESOLVED MANUAL TOOLS — never production authority** | The first uses `platformClient.rpc('exec_sql')`, the second direct SQL without production migration ledger. No serving startup invocation; existing `phase4-compatibility-closure` and migration runbook tests enforce separation. Retain pending explicit operator usage decision. **Only** the existing governed Production plan/apply executor is approved; read-only dedicated executor and checksum-ledger evidence remains unverified. |
| `src/components/admin/SqlMigration.jsx` | **ALREADY REMOVED** | The older Phase 4 migration audit was stale. `tests/dead-browser-sql-migration.test.js` asserts absence. Do not resurrect a browser SQL executor. |

**Acceptance reuse (no new suites):** `npm run test:authorization` supplies targeted contract/security checks; `npm run test:billing:sqlserver` reuses the **one** disposable SQL Server with tenant A/B, real-session HTTP and existing Vite/Puppeteer routes. The workflow path filter may contain duplicates, but creating another workflow/test file would not improve coverage. Actual external mail receipt, controlled Evia signer completion and dedicated production migration executor evidence remain independently **BLOCKED** in `PHASE4-CONSOLIDATED-ACCEPTANCE.md`.

**Disposition:** The bounded Package C **source caller census is reconciled**; no additional safe removal has been established from the available evidence. This is not exhaustive dynamic/manual-call certification and **does not close Phase 4**.

## Owner-deferred provider checks: independent Package C disposition (2026-10-16)

**Review scope:** existing source callers, `package.json` commands, mounted authorization contract and the previous Package C classification. This reconciles the known **source** decision; it is not an exhaustive runtime instrumentation audit and does not assert that unknown third-party/manual consumers do not exist. No code has been removed or rewritten as a result.

| Surface | Verified evidence | Disposition / operating control |
| --- | --- | --- |
| Mounted platform SQL RPC authority | `src/api/platform/authorization.js` includes `exec_sql` in `BLOCKED_RUNTIME_RPCS`; `tests/platform-authorization.test.js` and `phase4-compatibility-closure.test.js` cover the governed boundaries. | **Runtime denied; retain guard.** This does not make a separately connected SQL administrator unable to run SQL. |
| `npm run migrate` → `src/db/runMigration.js` | `package.json` still names this command; script executes `platformClient.rpc('exec_sql')` for each SQL file. Startup/deploy/runbook tests assert the command is not part of serving startup. | **Historical/manual — not production-authorized.** Operator usage unresolved; do not execute or delete until owner supplies an invocation/use decision. |
| `execute-sql` and named `migrate:*` package commands → `src/db/executeSql.js` | Executes `pool.request().batch(sqlScript)` directly, with no checksum ledger, Production environment approval or recorded plan/apply confirmation in this script. | **Manual/direct SQL — prohibited as production schema authority.** Retain for explicitly controlled local/disposable/administrative use; release owner must prohibit use against production except through separately approved governed controls. Historic usage unresolved. |
| Historical `src/scripts/*` RPC repairs and configuration utilities | Several legacy one-offs reference `exec_sql`; source search shows no deployment/startup import proving a live runtime pathway. Some historic docs still mention them. | **Unknown manual callers — retain, do not invoke.** No inferred deletion, production sign-off or provider access. |
| Single-invoice, property-access and legacy generation aliases | `invoiceService` create/update and generators reject via `BILLING_LIFECYCLE_REQUIRED`; property-access helper denies instead of expanding access. | **Safe fail-closed compatibility contracts — retain.** Document unknown dynamic/manual callers; do not enable old writes. |
| Invoice reads, agreement/template CRUD and identity repository | Concrete callers and existing authorization/SQL tests recorded above. Some compatibility transports still exist, intentionally without retry after authoritative denial. | **LIVE — retain, parity guarded.** No unconditional transport retirement. Critical cross-tenant/permission acceptance remains a release condition. |
| Payment proof/reminder, utility preview/review, maintenance/notification facades | Governed callers, explicit authenticated clients and existing two-tenant SQL/HTTP/browser coverage in Package C. | **LIVE — retain.** Provider inbox and real signing must be accepted separately; existing fixture proof does not count as live receipt. |
| No indexed routed caller: invoice utility-reading exports, overdue/monthly payment wrappers | Search yields definitions, tests, documentation or historical names, but not a proved routed caller. Another `fetchReadingsForInvoice` exists in `utilityBillingService.js` and is live. | **UNRESOLVED — no deletion**. The absence of a source-search hit does not dispose of dynamic imports or manual consumers. |

**Independent disposition completed:** No newly proven safe broad cleanup was found. Existing fail-closed authorities and tenant-scoped live contracts remain the supported operation; historical SQL and uncertain wrapper callers remain retained under explicit no-ungoverned-production-use controls. This avoids scope creep without misclassifying unproved callers as deleted or release-accepted. Final dynamic/manual-caller risk acceptance needs release-owner sign-off and is **not silently granted**. The owner has deferred controlled SendGrid/Evia checks; neither is waived. Consult the latest closure block in `docs/EXECUTION-PLAN.md` and the release register in `docs/PHASE4-CONSOLIDATED-ACCEPTANCE.md`.
