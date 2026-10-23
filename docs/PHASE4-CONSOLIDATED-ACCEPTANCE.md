# Phase 4 consolidated acceptance gate — 2026-10-14

Status: **ACTIVE — BLOCKED FROM PHASE 5**. This document distinguishes source-contract evidence, real disposable SQL acceptance, authenticated HTTP acceptance and production browser acceptance. A pass in one tier never substitutes for another tier.

## Latest source baseline

- PR #280 baseline SHA `945d4b140e8f448d93efc24715e64fb3040eb26c` passed PR-head disposable SQL acceptance and its main deployment workflow #792 succeeded. Independent Azure revision/public fingerprint/live MSSQL evidence remains a separate production verification task.
- PR #281 merged as `2a283aa24cb3bcbac53186b15065bb9e12eccf22` after exact PR-head authorization/build #794, disposable SQL #77 and Evia #173 all passed at `ad357f5bc52bbda75e26fd3d4d22ab52af97b968`. Its post-merge serving revision and MSSQL must be checked separately.
- Existing real disposable SQL proof: `scripts/test-billing-two-tenant-sqlserver.mjs` checks billing invoice creation/idempotency, rent and utility component amounts, tenant filtering, authenticated renter invoice/account reads, signing/Evia semantics, utility-review transitions, and maintenance-image/notification SQL isolation.
- Existing browser proof is primarily protected billing/utility navigation and selected renter invoice/utility behavior. Full logged-in invitation, signing, payment-verification and maintenance journeys are **not** established by the prior SQL or anonymous browser checks.
- This package expands that existing Docker fixture with **real SQL-backed bearer session HTTP requests** through the actual notification and maintenance Express routers, including read/mark isolation, maintenance projection, request/tenant denial and image attachment metadata. Image object bytes are not uploaded; real email/SMS delivery is not exercised.

## Exit matrix: every critical workflow needs an owner and evidence

| Contract | Present evidence | Required remaining acceptance | Decision |
| --- | --- | --- | --- |
| Invitations and account recovery | `docs/P0.3-INVITATION-ACCEPTANCE-STORIES.md` records historical production invite/send/resend/redeem/team-user acceptance; security/UI unit tests exist. | Reconfirm on current exact SHA using two tenant identities: only active target membership, no redeemed/expired-token reuse, correct sign-in and role workspace, proper status refresh, no cross-tenant invite, password reset/recovery. Safe SendGrid provider acknowledgment and actual controlled-mailbox receipt are separate evidence. | **BLOCKED** until current-build acceptance |
| Agreements and signing | SQL fixture covers manual sign, duplicate/late Evia events and tenant isolation; document retention tests and template/pagination contracts exist. | Authenticated browser create/edit/template→sign→retained signed PDF for owned tenant; deny foreign tenant/property/unit, revoke/delete/sign denial, preserve external signing evidence. Confirm canary remains OFF. | **BLOCKED** until browser parity |
| Billing and utilities | PR #283 merged real-session two-tenant SQL HTTP proof→reject/resubmit→partial/full verification, verified-only receipts, financial ledger and denial tests. This follow-on adds read-only renter browser receipt/account proof to the same disposable fixture and extends same-tenant-other-renter denial, subject to exact-head CI. Legacy invoice mutations remain blocked. | Authenticated browser draft→issue with safe controlled email, actual R2 proof upload, staff verification UI, dashboard accuracy and payment failure UX. The synthetic HTTP proof does **not** establish real bank verification or object delivery. | **BLOCKED** until complete lifecycle |
| Maintenance and notifications | PRs #281–#288 established renter/staff workflows and manager assignment, and production revision `0000285` was verified. PR #289 merged atomic lifecycle notifications and two-tenant SQL inbox/read-state proof; its new production revision still requires confirmation. This active package adds real renter/staff browser inbox, mark-as-read, safe maintenance links and tenant isolation, pending exact-head CI. | Real R2 image bytes and provider-backed email/SMS/push, controlled customer UX and production rollout remain distinct acceptance gates. | **BLOCKED** until all workflows proven |
| Tenant isolation | Tenant A/B disposable SQL with real bearer sessions proves selected billing/utility/signing/storage paths; this package expands maintenance/notifications. | Repeat cross-tenant URL/header/API reads/writes for invitation, agreements, financials, maintenance, attachment delivery and notifications. Confirm no partial write or leaked data on denied requests. | **BLOCKED** until full matrix |
| Production migration execution | Source-backed DDL-free serving startup, governed plan/apply workflow and static gates. Legacy `npm run migrate` still exists, not canonical. | Read-only Azure evidence of dedicated migration executor provisioning/grants/network path and checksum ledger `dbo.schema_migrations`; reconcile operational legacy commands. **No production DDL apply** during acceptance. | **BLOCKED** operational evidence |
| Compatibility exports | `docs/PHASE4-COMPATIBILITY-CLOSURE-MATRIX.md` classifies many operations. `invoiceService.createInvoiceRecord` and `updateInvoiceRecord` now throw rather than mutate; legacy invoice generators fail closed. `paymentService.generateInvoice` and `updateInvoice` still import those blocked wrappers; `platformClient` remains live in specifically declared domains. | Per-export static/dynamic route/caller inventory with live/needed/dead/unresolved classification, safe removal only after parity. Update stale historic audit descriptions instead of treating them as current runtime facts. | **BLOCKED** until operation inventory |
| Deployment evidence | PR #280 merged; no assumption that green PR CI proves current production serving revision. | Verify merged exact SHA on Azure Ready revision, public fingerprint, MSSQL health; capture successful CI run IDs and failed-run remediation evidence. | **BLOCKED** pending verification |

## Payment lifecycle HTTP acceptance follow-on — October 15, 2026

- PR #282 merged as `69f960b7bd8b4f7f2a3cf920a9cf4d8da279fdd0` after exact-head central authorization/build, two-tenant SQL + routed renter maintenance/agreement browser, and Evia tests passed. It changed acceptance fixtures, docs and CI-only deployment budget; no new serving Azure revision was required.
- Current bounded test-only package extends the disposable two-tenant SQL fixture to exercise the **real** `/api/billing` payment-proof, verification and account HTTP routes with real renter and administrator sessions. It uses independent **issued-state synthetic fixture invoices** to avoid calling the real outbound invoice issuance email API; payment proof URLs are synthetic persisted metadata, **not** proof of R2 upload.
- Assert unauthorized/foreign payment submission/approval denial, no balance reduction on unverified/rejected proof, mandatory rejection reason, resubmission, prevention of duplicate pending or duplicate verification, partial verified payment, final full payment, exactly corresponding receipts, and tenant-specific ledger events.
- This acceptance is an **HTTP + SQL financial mutation proof** if CI passes, not yet full routed UI payment-upload, issue-with-delivery, or SendGrid external acceptance. Those remain separate mandatory release gates. No production data or credentials are accessed.

## Work sequencing and release efficiency

1. Finish **this single PR** with authenticated HTTP proof and current inventory/checklist. PR-head `test:authorization`, `npm run build`, and disposable two-tenant SQL acceptance must pass. Do not merge red.
2. A follow-on **consolidated UI acceptance package** uses disposable tenant A/B and controlled mailboxes, reuses a single browser/SQL fixture, and covers invitation, agreement, billing and maintenance critical journeys. Browser checks must exercise actual routed screens and server-issued sessions rather than source-only regexes.
3. A final **compatibility/operational-closure package** reconciles per-export imports, operational DDL authority, owned deferrals and exact production evidence. High-risk tenant, billing, signing and auth gaps cannot be waived silently.
4. Phase 4 closes only on an explicit pass ledger. Only then advance the canonical plan into Phase 5 product regression, accessibility, failure UX, deployment/release hardening and product polish.

## Non-goals

No production SQL/identity mutation, no production invitation emails, no payment changes, no Evia canary activation, no object delete, and no assertion that synthetic fixtures constitute successful production acceptance.

## Phase 4 — identity-wide invitation recovery safety (2026-10-15)

After PR #290 merged and Azure revision `0000287` served SHA `93b4e32a0fe1cba752d9b2ac27c1051474b0543d` with ready MSSQL, the next focused package addresses a cross-organization account-claim gap. A person may have active memberships in multiple organizations, but invitation acceptance is a *global identity claim*, not an invitation claim limited to the user's original organization. The invitation writer now searches historical accepted invitations by app-user ID across organizations. A formerly claimed identity without usable auth linkage must stay `ACCOUNT_RECOVERY_REQUIRED` even when re-invited from another active organization. No new secret should be generated for that operation.

The existing disposable two-tenant SQL test fixture now includes the existing invitation schema and verifies that cross-organization re-invitation is refused without a new token row, while an unclaimed target can still be invited and resend revokes its earlier token. This is source/SQL acceptance only until exact-head CI runs green; it is not a live invitation email, browser redemption journey, or proof of password reset. Phase 4 remains **ACTIVE**, with full invitation redemption/recovery, controlled mailbox delivery, agreement signing, R2 bytes, compatibility census, and production migration authority pending.

## Phase 4 — authenticated invitation HTTP journey (2026-10-15)

The preceding identity-wide recovery fix (PR #291) merged as `1fd4f9b8a252f5656504ec0640cfbde939071fb9`; keep its production Azure Ready, public SHA and live MSSQL evidence as a separate deploy gate.

This incremental **test-only** slice extends the existing disposable SQL Server two-tenant fixture with the real `createInvitationRouter` alongside the already exercised SQL-backed bearer-session platform router. It verifies unauthorized renter/anonymous issuance denial; an administrator's wrong-tenant selection and foreign-target denial without an invitation row; valid invitation and superseding resend; revoked-token validation/redeem failure; accepted-token one-time redemption with exactly one persisted linked account; immediate bearer context and normal password sign-in; replay refusal, no re-invite of claimed identity, and foreign tenant context denial. The canonical invitation status must become `registered` only after a verified credential.

The fixture issues no real emails or SMS, logs no invitation token/password, uses no test bypass, and mutates only disposable Docker SQL. It does **not** prove a browser Accept Invite form, controlled external mailbox, password recovery or live production identities. Preserve those as Phase 4 blockers. Do not widen auth, invitation, Evia or SQL migration authority or start Phase 5.

## Phase 4 — real Accept Invite browser gate (2026-10-15)

PR #291 merged and production Azure revision `0000288` passed the exact serving image `1fd4f9b8a252f5656504ec0640cfbde939071fb9`, readiness and live MSSQL checks. PR #292 merged test-only as `31169f57456ef8fdb5b790c53fa31f8297e1fb4b` after its exact-head SQL/auth/Evia acceptance passed; main-branch Evia passed.

This next **test-only** acceptance package reuses the *same* existing disposable Docker SQL database, Vite-hosted real React application, real Express invitation endpoints and already established bearer sessions. It creates two fresh target identities in separate organizations and verifies real `/accept-invite` email binding, password form submission, server-issued session persistence, actual renter workspace redirect, resulting tenant context and foreign-tenant denial. A stale existing session is presented to one journey to prove it does not replace the invited session. The former token from resend and both used tokens must render unavailable without offering a credential-creation form. The fixture checks one auth identity and an accepted invitation row for each account, then normal password sign-in. Tokens/passwords never go into logs or documentation.

This is disposable **browser and SQL evidence**, not a controlled production mailbox delivery, actual staff invitation from UI, live Azure renter login or password-recovery completion. No production data or schema change; keep Phase 4 open, with real external SendGrid receipt, password recovery, agreement/Evia signing with retained PDFs, R2 object bytes, compatibility caller census and privileged migration executor evidence outstanding.

## Phase 4 — password recovery browser + controlled delivery (2026-10-15)

Following the green exact-head PR #293 two-tenant invitation browser acceptance and its production deployment of `b46fcdcda615ceb36be88ad8e9b8dedcc2c05bd9` on Azure revision `0000289`, this bounded slice makes the reset page prevalidate server-owned reset tokens before rendering a new-password form. It also fails closed when an email transport returns an unsuccessful result instead of throwing. The public request response remains generic for account-enumeration resistance, while delivery failure revokes the token.

The existing disposable SQL Server + Vite + Puppeteer harness applies the existing password-reset migration and mounts the production reset router ahead of its platform compatibility routes. A controlled in-process mailbox captures reset links but makes **no external provider call**. The test checks unknown-account generic response, authenticated account reset issuance, resent-token invalidation, expired/revoked/used token rejection in the actual React UI, successful password change through the page, SQL-backed one-time consumption, global old-session revocation, rejection of old credentials, new-password login, and isolation of the second organization. Simulated mail delivery failures must leave revoked tokens and the same generic HTTP response.

This proves real React, Express, SQL and controlled delivery-contract behavior when exact-head CI passes; it is **not evidence of external SendGrid acceptance, actual controlled mailbox receipt from the provider, or production account reset**. Phase 4 stays open with provider receipt, full agreements/Evia retained PDF UX, actual R2 object bytes, compatibility caller inventory and privileged migration executor evidence pending.

## Agreement signing and retained-document capability closure — October 15, 2026

This consolidated candidate closes two live-surface gaps, distinct from the existing signing-state SQL tests: (1) authorized renter reads of canonical agreements must filter by their authenticated app-user ID, never the supplied renteeId; and (2) authenticated tenant membership **alone** cannot authorize signed-PDF bytes. The signed-PDF storage guard now requires exact agreement owner or tenant administrator with agreement-management permission, matching completed agreement state and retained SQL URL, and for Evia fenced staged objects an **already processed matching publication lease**. It rejects unpublished, mismatched and foreign signed documents before byte transport. Existing stricter audit-trail access stays independent.

The actual renter and staff agreement views must select retained signed PDF over a pre-signature document; if a signed PDF is missing, they cannot silently show the unsigned original as signed. This package also improves the retained-PDF availability message in the routed management list. The pre-existing disabled Evia canary remains OFF, manual-sign transaction guards and webhook lease fences remain unchanged.

**Acceptance tier:** actual disposable Docker SQL, server-issued sessions, real Express agreement/storage routers, Vite-hosted React management list and a controlled PDF byte handler; a green exact-head suite can prove authorization, publication and UI selection. It cannot prove live Evia signing, real R2 object persistence/immutability, controlled SendGrid mailbox receipt, or end-to-end live template→sign→archived document; these stay explicit Phase 4 blocking rows, along with privileged production migration authority and compatibility census. No production data or DDL changes.

## Package A — authenticated document bytes and real R2 document probes (2026-10-15)

PR #295 merged at `d2a25ec6fefc8eff92a2ac40c5e2a8956ca17b53` and production Azure revision `0000291` became Ready, with public build fingerprint and MSSQL checks green. The current package replaces bare protected-document iframe/download navigation with authenticated tenant-header requests followed by temporary in-tab PDF object URLs, revoked when the viewer closes, swaps document or changes tenant. A failed/denied/non-PDF response displays an error instead of presenting an empty iframe as success. The legacy details page follows the same byte-delivery rule.

The existing *real routed* disposable two-tenant Puppeteer acceptance now checks the actual PDF response bytes and content type, a same-origin blob iframe and download link, and cleanup on close, while preserving foreign renter/tenant/document publication denials. The existing production R2 health job is extended from the images prefix to a disposable `documents` PDF object, verifying exact uploaded bytes, content type and cleanup on the real configured R2 driver.

**Evidence boundary:** R2 probe bytes are actual provider-backed objects when its Azure deployment job runs successfully; the per-agreement browser flow still exercises a controlled PDF backing handler and disposable SQL, not live Evia or an archived production agreement. Full template→live signing→R2 archive→authorized browser retrieval on a controlled production account remains **OPEN**. Provider-backed email receipt, billing proof lifecycle and privileged migration/compatibility signoff remain their own Phase 4 gates. No canary activation, production tenant data mutations or production DDL.

## Package A signing authority acceptance — 2026-10-15

Production Package A PR #296 completed successfully at exact SHA `0580b5e4e91538c30e43b3a947830c8801c4d059` on Azure Ready revision `0000292`, with live MSSQL and real R2 documents/images bytes and cleanup verified by deployment #38685539009. Authenticated viewer bytes were previously proven through the disposable two-tenant SQL/browser acceptance.

**Pre-live-signing security correction:** the generic agreement and template mutation routes must require canonical `AGREEMENTS_MANAGE` permission; arbitrary tenant members cannot write contracts or manually sign. Generic create/update must reject forged terminal statuses, completed signatories and signed-document provenance. A signed agreement is immutable under generic updates, including harmless-looking metadata, with a server SQL predicate rather than a stale client check. Evia polling must be read-only; only server-authoritative webhook/retention or dedicated transactional manual-signing code may finalize an agreement. Provider-returned external PDF URLs are not locally retained proof and must not be persisted as the authoritative signed PDF.

The existing two-tenant SQL/browser fixture is expanded to assert unauthorized renter/foreign manager writes, no unsigned-to-signed spoofing, protection of retained URL and signed row immutability, in addition to retained PDF bytes. Standalone policy tests run inside Evia CI to prevent signature-write regressions.

**Still externally gated:** a controlled real provider signature request, signatory completion, verified webhook/callback, local R2 PDF + audit trail, and authorized browser retrieval for that exact agreement. No production signing or agreement mutation is performed by these tests. Phase 4 remains open until the actual end-to-end journey and remaining billing/email/operational exit gates pass.

## Package B — protected billing proof bytes, invoice scope and staff preview (October 15, 2026)

Following Ready Azure revision 0000293, this consolidated package protects real payment evidence: the upload service uses unique invoice-bound keys under `invoices/tenants/{tenant}/payment_proofs/{invoice}/{uuid}.{pdf|png|jpg}`; the billing API verifies the exact tenant+invoice URL resolves to actual stored PDF/image bytes before recording a pending payment. Renter-upload and download access require ownership of that invoice, and staff reads require payments-management permission and assigned-property/admin scope. Generic deletes of payment-proof evidence are denied. Historic legacy proof paths remain read-compatible with ownership guards, but cannot be newly submitted as proof.

The staff verification UI retrieves proof bytes using authenticated tenant headers and renders a temporary blob URL, revoked at closure. Approval remains disabled when the evidence is absent, inaccessible, or invalid. The existing disposable SQL/React payment-proof acceptance must upload real isolated local-storage object bytes rather than relying only on synthetic metadata; existing rejected/resubmitted/partial/full verified receipts remain mandatory. The deployment R2 health proof adds an ephemeral invoices-bucket image object with exact read-back and cleanup alongside the previously verified documents and images probes.

No claim is made about a real bank transaction, external controlled customer email, or production invoice mutation. Controlled issuance/delivery and live-provider receipt are separate remaining Phase 4 gates.

## Phase 4 Package B — governed issue and email provider acceptance (2026-10-15)

After PR #298 was verified in Azure revision `0000294` at SHA `497ecc9b0877e30edb82f00c686defac59c3d67a`, the next release package resolves the pre-commit email send race in the invoice issue path. Invoice issuance is a single serializable SQL transaction recording both `invoice_issued` and a durable `invoice_email_attempted` event before an external provider call; only an issued invoice may generate an email. Provider acceptance, definite rejection and uncertain outcome are persisted separately in the existing `billing_lifecycle_events` ledger, with no schema or production DDL change. An uncertain attempt stays blocked from automatic resend; staff can explicitly retry only a definitively rejected/unsent attempt. Duplicate issue and parallel retry requests cannot send a second message.

The existing staff draft editor and invoice details show issued status separately from provider delivery status. A controlled in-process email provider and disposable two-tenant SQL/browser acceptance must validate draft creation/issue, authorized renter visibility, rejected email followed by safe retry, duplicate and unauthorized-tenant denial, and payment-proof verification/receipts under a real auth session. Provider acceptance does not prove external mailbox receipt.

**Still required outside these tests:** authorized real recipient mailbox, actual SendGrid event/receipt, real signing canary and final privileged migration/compatibility acceptance. No customer invoice, production finance records, actual email address or production DDL is modified by this package.


## Phase 4 Package C — consolidated evidence reconciliation (2026-10-16)

Canonical scope is unchanged. See the existing `PHASE4-COMPATIBILITY-CLOSURE-MATRIX.md` Package C caller disposition for live/legacy/unresolved operations. No new test frameworks, SQL migrations, production data mutations or signoff criteria have been introduced.

| Existing gate | Evidence at current baseline | Disposition |
| --- | --- | --- |
| Exact production application deployment | Main commit `09b443ceaeaa1ba9050dc958b9f20a894deb13a1`; deployment [#38829467148](https://github.com/WasanthaK/khrental/actions/runs/38829467148) passed; Azure Ready revision `0000302`, matching public build SHA and live `/api/mssql/health` reported ready (deployment log). | **PASS** for serving application SHA/health, not for privileged migration-executor readiness. |
| Unit/contract authorization and app build | Existing main production workflow's verify job passed at above SHA; PR #306's `test:authorization` and build passed. | **PASS** for those tests, not independently a live mail/signing probe. |
| Disposable two-tenant SQL/HTTP/browser suite | Existing PR #306 SQL acceptance [#38826087386](https://github.com/WasanthaK/khrental/actions/runs/38826087386) passed. Existing fixture includes authenticated invitations/recovery, maintenance/notifications, utility review, invoice issuance/provider-stub transitions, payment proof/receipt workflows and selected routed browser screens. | **PASS** for covered disposable fixture behavior only. Do not claim actual provider mailbox receipt or live Evia signing. |
| Real R2 bytes and retained agreement/document evidence | Package A/B acceptance and Azure R2 probes are documented above; synthetic/controlled PDF UI assertions and controlled object reads are separately described. | **PARTIAL**: local/ephemeral object proof is not an actual completed production Evia signer journey. |
| Invoice delivery and mailbox | Controlled provider accepted/failed/unknown states and retry discipline are implemented and fixture-tested. | **BLOCKED**: real controlled recipient mailbox and provider event receipt not captured. |
| Evia live signing | Existing signing guards, immutable document access, webhook/audit/storage tests and fenced canary OFF. | **BLOCKED**: an explicitly approved real signer → webhook → archived signed PDF + audit trail → authorized browser receipt has not been evidenced. |
| Dedicated production migration executor | Governed plan/apply and strict read-only verification code exists; `dbo.schema_migrations` validation, job identity/grants and isolated network reachability are in the existing verification contract. | **BLOCKED**: no successful, retained actual production verification execution ID/grants/ledger evidence established. Do not run `apply` as an evidence shortcut. |
| Compatibility caller census | Reconciled live invoice/payment, template/agreement, identity, maintenance, utility, notifications and legacy migration-tool entrypoints in the existing compatibility matrix. | **PARTIAL**: checked-in named call sites classified; dynamic/manual/operator caller usage remains unresolved. Do not delete unknown exports. |

**Release decision: Phase 4 NOT READY TO CLOSE; Phase 5 remains gated.** The already implemented code-level Package C corrections and tested serving SHA are recorded; the remaining high-risk requirements are external/operational proof and final controlled acceptance, not permission to invent duplicate test systems. The existing release owner must authorize any live emails, Evia signing or privileged environment actions and retain redacted artifacts. No automatic production schema apply.

## Package C operational migration evidence — reconciled from existing GitHub runs, 2026-10-16

The preceding Package C table's “no actual production verification” must be read as **no current strict, all-migration read-only verification**, not as “the migration job never existed or never worked”. Existing run logs provide positive historical evidence:

- [Provisioning run #36498501746](https://github.com/WasanthaK/khrental/actions/runs/36498501746), September 28: the dedicated `khrental-db-migrator` manual Container Apps job was created with a distinct managed-identity principal. This workflow did **not** grant SQL permissions.
- [Earlier read-only verification #36535388905](https://github.com/WasanthaK/khrental/actions/runs/36535388905), September 29: an isolated job ran to successful completion. This predates the current **strict ledger/checksum/schema/grant** verification contract; do not relabel it as that newer acceptance.
- [Governed production migration runs #36946616128](https://github.com/WasanthaK/khrental/actions/runs/36946616128), [#37323211091](https://github.com/WasanthaK/khrental/actions/runs/37323211091) and [#37454655068](https://github.com/WasanthaK/khrental/actions/runs/37454655068), October 2/5/6: dedicated in-network executor executions succeeded. The October 6 logs show `Migration ledger: present` and an authenticated SQL run against `khrentalsdb`; the October 5 run applied and verified the property utility configuration migration. These demonstrate historical executor connectivity and adequate permissions for those selected migration operations, **not** a fresh complete privilege inventory.
- [Latest evidenced production read-only migration plan #38702971142](https://github.com/WasanthaK/khrental/actions/runs/38702971142), October 15: **five `APPLIED`** entries and **one `SATISFIED_UNTRACKED`** entry, `20261006_01_repair_auth_store_runtime_columns`. Inspection reported the required auth columns/index already present; no `PENDING` schema change was reported by that plan. This is historical read-only evidence and does not certify that state has not changed since.

**The precise remaining gate:** obtain a current governed plan; review *all* entries, checksums and SQL target; use the **existing** manual Production `Run production database migrations` `apply` only upon explicit operator approval and `APPLY-PRODUCTION` confirmation. The runner's satisfied-untracked branch calls `verify` and records a checksum ledger row **without replaying DDL** *if the runtime inspection still reports satisfied*. If it instead reports `PENDING` or different checksums, stop and escalate; the generic `apply` path can execute schema SQL and must not be treated as inherently ledger-only. After authorized reconciliation, run the **existing** manually dispatched `Verify production database migration executor` workflow with `VERIFY-MIGRATION-EXECUTOR` and retain its execution ID, complete per-migration `LEDGERED / SCHEMA_OK` output, distinct identity and grant checks, SQL network evidence and final Success result. Do not provision another job or invent a second verifier.

**Status:** Historical provisioning and successful production migration execution **EVIDENCED**; current strict six-migration verification and any ledger-only reconciliation **BLOCKED pending manual Production execution and retained results**. No apply or production database write was carried out by this reconciliation. Phase 5 remains gated.

## Owner-held provider acceptance and independent release-readiness register — 2026-10-16

**Phase 4 remains ACTIVE / BLOCKED FROM PHASE 5.** The owner asked to complete controlled real email and Evia tests separately later, while work proceeds on *independent* acceptance and compatibility disposition. This is a scheduling decision only — not a waiver, evidence of success, or approval to send customer mail/sign real agreements.

| Release gate | Current accepted evidence | Outstanding evidence / owner | Current decision |
| --- | --- | --- | --- |
| Application serving revision and SQL health | [Deploy #38874383888](https://github.com/WasanthaK/khrental/actions/runs/38874383888): Azure Ready `0000303`, public `buildSha=c2cedf0ae4787f688297d949d42f5f9a8acca484`, `mssql connection=ready`. | None for this application serving-SHA gate unless runtime behavior changes. | **PASS** |
| Source-code authorization and UI build | Latest PR #311 / merged deploy #38874383888 authorization/build green; the existing disposable two-tenant SQL/browser fixture previously passed for the enumerated behavior. | Preserve existing guarded regression scope; user acceptance of final production flows is distinct. | **PASS for tested scope; not blanket E2E approval** |
| Production migration plan | [#38877959860](https://github.com/WasanthaK/khrental/actions/runs/38877959860) and [#38880543731](https://github.com/WasanthaK/khrental/actions/runs/38880543731): five ledger entries, auth repair `SATISFIED_UNTRACKED`, zero `PENDING`, read-only and no mutation. | Operator reports `apply` and strict verification green; obtain exact *new* run IDs, job execution name and six `LEDGERED/SCHEMA_OK` outputs before declaring strict closure. No automatic repeat apply. | **PLAN PASS; APPLY/STRICT RESULT REPORTED, NOT INDEPENDENTLY EVIDENCED** |
| Real SendGrid invoice mailbox | Governed issue/attempt/accepted/failed/unknown lifecycle fixture is passing in its covered scope. | **Release owner, PARKED**: isolated test renter/invoice and controlled recipient, provider accepted/delivered event, matching invoice/time and owner's mailbox confirmation. No Gmail account connection or permission required. Never issue customer invoices. | **DEFERRED BY OWNER; REQUIRED BEFORE CLOSE** |
| Real Evia signing and archival | Existing webhook, signed-document immutability, R2 byte and authenticated browser tests cover controlled/synthetic paths; earlier Phase 2 signer acceptance is historical. | **Release owner, PARKED**: separately approved real signer → verified callback → immutable R2 signed PDF + audit → authorized read; foreign/unauthorized denied. Keep canary OFF without explicit approval. | **DEFERRED BY OWNER; REQUIRED BEFORE CLOSE** |
| Compatibility/migration entrypoints | Source caller census reviewed; explicit fail-closed invoice/identity paths, live governed contracts and barred `exec_sql` are evidenced in `PHASE4-COMPATIBILITY-CLOSURE-MATRIX.md`. | Unknown dynamic/manual operational callers and ungoverned direct-SQL CLI use need release-owner disposition; **do not** treat as harmless/dead without owner sign-off. | **SOURCE DISPOSITION COMPLETE; OPERATOR SIGN-OFF OPEN** |
| Final tenant/billing/agreement production release decision | Scoped two-tenant SQL, browser and production health evidence retained as described above. | Release owner confirms real critical business workflows, reviews nonwaivable tenant/finance/signature/security gates and accepts explicitly owned low-risk deferrals. | **BLOCKED** |

**Closure policy:** Unperformed provider tests stay pending; no guessed SendGrid events, personal email access, real signer actions, live financial mutations, new test framework or new migrations. A controlled CI fixture is not a real provider receipt. A green GitHub `plan` cannot be reinterpreted as `apply` or all-six strict verification. Do not start Phase 5 or sign off Phase 4 until the evidence above is reconciled and the designated release owner accepts the remaining release decision.

**Independent work now discharged:** Source-level caller classification, supported production migration authority versus unsafe historical tools, no-mass-deletion decision, existing regression/serving evidence register and deferred external owner handoff. The next remaining actions are operator/provider business acceptance and evidence reconciliation, *not* an unsolicited new engineering package.

## Phase 5 regression consolidation and production release acceptance checklist — 2026-10-16

**Controlling release decision: NOT APPROVED.** The release owner explicitly authorized Phase 5 development/regression in parallel with the owner-held Phase 4 SendGrid and Evia tests, not Phase 4 completion, live provider canaries, arbitrary production mutations, or a release waiver. This section is the current end-of-Phase-5 evidence handoff and supersedes earlier *Phase 5 development pending* language above **only for engineering scheduling**. The missing Phase 4 operational acceptance remains mandatory.

### Verified release-candidate evidence and limits

| Gate | Evidence verified from existing actions/logs | Verdict and limit |
| --- | --- | --- |
| **Serving production revision** | [Main push/deploy #38899514979](https://github.com/WasanthaK/khrental/actions/runs/38899514979): `0edeb80eb91840857a4d758d32360acbfa2fb231`; Azure Ready revision `0000307`; `/bin/sh scripts/start-container.sh`; public `build-info.json` reports exact SHA; `/api/mssql/health` returns `{"ok":true,"provider":"mssql","connection":"ready"}`. | **PASS, current application deployment**. This supersedes the old Ready `0000303` runtime SHA for serving status. This was a *push* workflow that actually deployed, although the PR CI job's deploy was skipped. |
| **Phase 5 consolidated source tests + build** | At that same main commit, [#38899514979](https://github.com/WasanthaK/khrental/actions/runs/38899514979) `verify` passed syntax, `npm run test:authorization` **568/568**, and `npm run build`. Source/test packages merged: [#314](https://github.com/WasanthaK/khrental/pull/314) property/unit, [#315](https://github.com/WasanthaK/khrental/pull/315) admin/role, [#316](https://github.com/WasanthaK/khrental/pull/316) billing proof, [#317](https://github.com/WasanthaK/khrental/pull/317) maintenance notices, [#318](https://github.com/WasanthaK/khrental/pull/318) agreement/signed-PDF and [#319](https://github.com/WasanthaK/khrental/pull/319) final cross-domain gate. Four older omitted test files were added to the existing command; legacy invitation UI assertions were corrected to test the authoritative lifecycle helper. | **PASS for source/unit/HTTP-stub contract coverage.** Not a new two-tenant production SQL/browser acceptance or actual provider test. Phase 5 release-hardening source scope is complete; do not invent further test packages just to advance status. |
| **Disposable two-tenant SQL/HTTP/browser** | [#38826087386](https://github.com/WasanthaK/khrental/actions/runs/38826087386) passed: controlled invoice issuance/provider-stub accepted/failed/unknown/no-resend, payment proof rejection/resubmission/verification/receipts, and authorized two-tenant browser isolation; existing maintenance/notification and signing-fixture proofs are described earlier in this document. | **PASS for the enumerated historical fixture/commit**, not a new execution at `0edeb80e`, and not evidence of a real customer mail, live Evia completion or absolute absence of runtime regressions. Decide explicitly if another bounded disposable SQL/browser run is required because runtime code changes after that fixture; do not demand automatic full rerun solely for test/doc changes. |
| **Governed production migration PLAN** | Manual [#38877959860](https://github.com/WasanthaK/khrental/actions/runs/38877959860) and [#38880543731](https://github.com/WasanthaK/khrental/actions/runs/38880543731) both green **plan** jobs against then-serving `0000303`: five `APPLIED`, one `SATISFIED_UNTRACKED` (`20261006_01_repair_auth_store_runtime_columns`), zero `PENDING`. Accessible later workflow-dispatch history does not show a newly retained Production `apply` or strict six-migration verifier execution. | **PLAN PASS; STRICT APPLY/VERIFY EVIDENCE OPEN.** Owner reported apply/strict green; do not discredit report, invent exact run IDs, infer the sixth ledger row is committed, or rerun `apply`. |
| **Real controlled invoice mail** | Billing issue/retry lifecycle and SendGrid provider-acceptance test doubles already passed; no controlled live invoice mailbox/provider-event receipt was supplied. | **OWNER-HELD / NOT RUN**. Provider `2xx` is *acceptance*, not delivered message. Personal Gmail access is not required. |
| **Real Evia signer/archive** | Protected signed-PDF route, fenced lease proof, immutable archive/audit and cross-tenant fixture tests passed; fenced canary is OFF. | **OWNER-HELD / NOT RUN**. A real callback/provider completion and retained PDF + audit bytes have not been independently accepted. Keep canary OFF. |
| **Dynamic/manual compatibility callers and legacy SQL tools** | Source census is reconciled in `PHASE4-COMPATIBILITY-CLOSURE-MATRIX.md`; `exec_sql` is blocked in runtime, but historical direct-SQL CLI files remain on disk with unknown manual users. | **OWNER OPERATIONAL DISPOSITION REQUIRED.** No mass deletion, newly authorized schema path or inferred waiver. |
| **Final business/security sign-off** | Existing isolated unit/fixture and latest serving health checks above. | **BLOCKED** pending confirmed tenant/billing/agreement acceptance, migration proof, external provider evidence and explicit authorized release decision. |

### Release-owner handoff — outstanding actions only

- [ ] **Migration executor evidence:** reconcile the operator-reported green `apply` and `VERIFY-MIGRATION-EXECUTOR` with exact existing GitHub run URL(s), SQL target, job execution ID, distinct executor identity/grant checks and **all six** `LEDGERED / SCHEMA_OK` log outputs. If the runs were not retained, record that as unverified; do not rerun production `apply` as a substitute or grant broader SQL permissions. Compare any fresh read-only plan against the then-serving revision if needed.
- [ ] **SendGrid live invoice acceptance (owner only):** choose an isolated test renter, explicitly authorize issuing its test invoice through the governed lifecycle, retain redacted invoice/event reference, SendGrid accepted/delivered evidence and personally confirm recipient mailbox receipt. Do not share Gmail permissions or personal inbox contents; no customer invoices.
- [ ] **Evia live signing acceptance (owner only):** explicitly approve a fenced test, validate real signer/callback, exact tenant/agreement signed PDF and audit document immutability and permitted/denied browser access. Canary stays OFF until the separate approval; no customer signing request.
- [ ] **Operational caller risk disposition:** owner acknowledges that `npm run migrate`, `src/db/executeSql.js` and named `migrate:*` tools are **not** governed Production schema authority; decide how to constrain unknown operator/dynamic clients and record any *noncritical* accepted deferral. Tenant isolation, credential, billing mutation, signer provenance and permission failures cannot be waived.
- [ ] **Final business acceptance:** designated release owner reviews the covered tenant, property/unit, invoicing/receipts, maintenance/notification and agreement workflows, reviews discrepancies and records a concrete `APPROVE` or `DO NOT APPROVE` release decision with date and evidence references.
- [ ] **Close Phase 4 + Phase 5 release gate only after prerequisites:** update this ledger with the proof links and the release-owner decision. An engineering-green test suite or successful deployment alone never automatically approves a release.

**Ownership and guardrails:** No additional GitHub workflow, migration, test-email credential connector, browser automation of the owner's inbox, real Evia canary, schema mutation or Phase 5 feature scope is authorized by this checklist. The owner can complete both parked provider tests on their own schedule. Preserve the verified application state in the meantime. Any future behavior-changing fix requires the existing exact-SHA deploy/health discipline.

## Release evidence reconciliation — 2026-10-20 (controlling status)

This newer update supersedes the 2026-10-16 **unverified production
migration apply / strict verification** item, but leaves all independent
external provider and business release gates open.

| Gate | Evidence / limitation | Current verdict |
| --- | --- | --- |
| Production migrations **through October 18 (7 managed entries)** | [Apply #39185870984](https://github.com/WasanthaK/khrental/actions/runs/39185870984), job 117848083384, dedicated execution khrental-db-migrator-ivffmmn: owner-confirmed apply through 20261018_01_invoice_payment_references, formerly untracked auth-store repair adopted after schema inspection. [Strict verify #39186676663](https://github.com/WasanthaK/khrental/actions/runs/39186676663), job 117850452655, execution khrental-db-migrator-4mr0tpa: all **7/7 LEDGERED / SCHEMA_OK** checks and dedicated-executor identity checks passed. | **PASS** for exactly this baseline. Do not repeat privileged apply. |
| Latest main deployment | SHA 3d4dcb10b49562c462815890debd74104c7ae823, [#39201496936](https://github.com/WasanthaK/khrental/actions/runs/39201496936): build/authorization and Azure Ready/public-build workflow gates passed on October 19. | **AUTOMATED DEPLOYMENT PASS**, not final physical acceptance. |
| Invoice redesign drafts | PR #332 merged; [#338](https://github.com/WasanthaK/khrental/pull/338), [#339](https://github.com/WasanthaK/khrental/pull/339), [#340](https://github.com/WasanthaK/khrental/pull/340), [#341](https://github.com/WasanthaK/khrental/pull/341) open draft; isolated latest [test #39372706676](https://github.com/WasanthaK/khrental/actions/runs/39372706676) green. Invoice master and archive migrations dated October 19/20 are **not applied to production**. | **DRAFT ENGINEERING VALIDATED ONLY.** Future deployment/DDL needs separate authorization. |
| Controlled SendGrid **invoice** delivery | On **2026-10-20**, the owner provided Gmail inbox, PDF viewer and message-detail screenshots and confirmed this was a deliberate test renter/mailbox under their control. Subject "KH Rentals invoice for 2027-02"; PDF reference **26101901**, total **LKR 23,340.00**, readable, **two pages**. Gmail displayed sender label "Kubeira Property Admin", mailing subdomain `em3798.quixo.online`, signing domain `quixo.online`, and TLS; no recipient address, raw message, image or bank details have been committed. **No authoritative `invoice_issued` / email-delivery ledger or SendGrid event/message ID correlation has yet been demonstrated.** | **MAILBOX RECEIPT + PDF READABILITY PASS (owner-attested). PROVIDER/LEDGER TRACE OPEN.** No additional invoice email is needed solely for this record. |
| Controlled real Evia signing | Hardened signer/callback/retained document needs a separate real test; canary OFF. | **OWNER-HELD / OPEN.** |
| Unknown manual/dynamic compatibility caller risk | Static census exists; operator usage disposition not signed. | **OPEN.** |
| Final controlled business/security sign-off | No dated full release-owner approval and end-to-end journey acceptance. | **NOT APPROVED.** |

### Current release-owner checklist

- [x] Verify seven managed production migrations from the original governed
      apply and independent strict verifier, with exact linked evidence.
- [x] Owner confirmed on 2026-10-20 that invoice 26101901 was a
      deliberately controlled test to a renter/mailbox under their control;
      Gmail displayed the email, sender/domain/TLS details and its readable
      two-page PDF. Screenshot artifacts remain in the conversation only.
- [ ] Reconcile the existing invoice-issued and email-delivery records
      to a redacted SendGrid provider message ID/status where available.
      Avoid a new invoice or email merely to compensate for missing logs.
      Provider-origin and delivery-event verification remain OPEN.
- [ ] Owner approves and verifies one real fenced Evia signer/callback,
      signed PDF, audit and tenant-specific document retrieval. Canary OFF
      unless explicitly authorized.
- [ ] Owner records explicit risk disposition on known manual SQL commands
      and unproved dynamic callers; critical tenant isolation, signer
      provenance, payment mutation and signed-document retention cannot
      be waived.
- [ ] Release owner records APPROVE or DO NOT APPROVE with date and
      evidence for tenant, property, billing/receipts, maintenance/
      notifications, agreements and security.

**Canonical disposition:** Phase 4 remains OPEN, Phase 5 engineering scope
is complete but combined production RELEASE SIGN-OFF IS BLOCKED. Do not
backdate this evidence to October 16 or treat it as permission to apply
the newer invoice migrations, merge feature branches, run Evia, or send mail.


## Canonical release reconciliation and action register — 2026-10-21 (latest controlling status)

**Source of authority:** original canonical Phase 4/5 acceptance criteria, not old
dated "next package" text. This entry supersedes earlier claims that the
original 7-migration apply, live controlled invoice mailbox, invitation
acceptance or real Evia signing exercise still need to be performed.
**Engineering-complete is not release-approved.** Phase 4 final operational
sign-off remains OPEN; Phase 5 source regression development is COMPLETE.

### Completed — retain existing proof; do not repeat successful operations

| Gate | Evidence/status | Decision |
| --- | --- | --- |
| Original Phases 0–3 and bounded Phase 4 engineering | Existing merged canonical contracts; Package C source classification in `PHASE4-COMPATIBILITY-CLOSURE-MATRIX.md` | **ENGINEERING COMPLETE**, compatibility operational caller policy still needs owner disposition |
| Phase 5 bounded security/regression development | PRs #314–#319 merged; cross-domain fixtures/authorization/build previously green | **SOURCE SCOPE COMPLETE**; final release sign-off is separate |
| Production migrations **1–7** | Governed apply [#39185870984](https://github.com/WasanthaK/khrental/actions/runs/39185870984) and dedicated strict seven-migration verification [#39186676663](https://github.com/WasanthaK/khrental/actions/runs/39186676663), execution `khrental-db-migrator-4mr0tpa`, seven retained ledger/schema checks | **PASS** for existing seven; **do not reapply** |
| Controlled invoice mailbox | Owner-confirmed Gmail receipt and readable two-page PDF on Oct 20, test reference **26101901**, LKR 23,340.00, subject "KH Rentals invoice for 2027-02". Details of recipient and bank account are deliberately not published | **REAL MAILBOX/PDF FUNCTIONAL PASS**; provider-to-ledger correlation still open |
| Evia live signing | Owner-confirmed completed signer Oct 17; Oct 18 signed agreement **#47FDEA13** showed landlord and renter both Signed, agreement Completed, after PR #326. Source evidence is owner-provided application screenshots, documented in [draft PR #324](https://github.com/WasanthaK/khrental/pull/324) | **LIVE SIGNING/UI FUNCTIONAL PASS**; webhook, immutable PDF, audit object and access evidence still separately open |
| Secure invitation | Owner independently tested and accepted invitation workflow Oct 18. The non-receivable dummy email on agreement #47FDEA13 remains correctly **Invitation not accepted**; that specific demonstration tenancy is not activated | **INVITATION WORKFLOW PASS**; no repeat invite or bypass |
| Current application serving baseline | [Deployment #39582049206](https://github.com/WasanthaK/khrental/actions/runs/39582049206), merge [PR #345](https://github.com/WasanthaK/khrental/pull/345) commit `b2b9d66cbb7b098e9c5c52202fd7775af278318a`, Azure Ready revision `0000318`, exact public build fingerprint and live MSSQL health confirmed | **PASS** for deployment, not feature-flag or schema activation |
| Latest read-only production database plan | [#39582049166](https://github.com/WasanthaK/khrental/actions/runs/39582049166), attempt 2 succeeded: seven `APPLIED` with matching checksums; migration eight/nine `PENDING`, no SQL changes | **READ-ONLY PASS**; new enhancements not yet applied |

### Action register — original canonical release (only unresolved decisions)

| ID | Owner/action | Exact closure evidence | State |
| --- | --- | --- | --- |
| C01 | Release documentation keeper — consolidate already-confirmed outcomes and old open drafts into this register | Existing 7/7, mail, Evia, invitation and serving proof cross-referenced in merged [PR #342](https://github.com/WasanthaK/khrental/pull/342) | **CLOSED** |
| C02 | Operations — reconcile existing **invoice 26101901** issue/delivery ledger with a redacted SendGrid provider message/event ID and delivered result | Existing email and PDF receipt already pass; retain matching provider event and issue/attempt/accepted-or-delivered record, or state explicitly that historic telemetry is unavailable | **EVIDENCE OPEN**; never reissue a new invoice just for logs |
| C03 | Operations — reconcile signed agreement **#47FDEA13** against Evia callback, retained signed PDF, `audit_trail.pdf`, and protected authorized/denied retrieval | Match existing agreement/attempt/document IDs and byte-provenance where available; record missing artifacts explicitly | **EVIDENCE OPEN**, not a repeat live signing test; fenced canary stays OFF |
| C04 | Owner-approved practical production SQL policy | Normal schema changes use the governed executor; keep app credentials limited; allow recorded admin direct SQL for exceptional recovery; keep legacy scripts available for nonproduction | **OWNER APPROVED / CLOSED 2026-10-21** — operating decision, not a new technical permission audit |
| C05 | Release owner — final original canonical release decision | Review current tenant/property/unit, invoice/payment/receipt, agreement/signed PDF, maintenance/notification and security proof, unresolved C02–C04 or formally justified noncritical deferrals; record dated **APPROVE** or **DO NOT APPROVE** | **NOT SIGNED OFF** |

**Interpretation:** C02 is *telemetry correlation*, not new SendGrid functional
testing. C03 is *archival and audit evidence*, not another signer exercise.
A reviewer must not mark C02/C03 full provider/audit PASS from UI screenshots.

### Separate authorized Invoice Designer rollout — not an original canonical closure prerequisite

| ID | Scope/decision | Current verified state |
| --- | --- | --- |
| I01 | Governed preflight and owner-approved apply of `20261019_01_invoice_master_data` and `20261020_01_immutable_invoice_pdf_archive`, followed by independent strict 9/9 | **APPLIED 2026-10-22** by [#39751158286](https://github.com/WasanthaK/khrental/actions/runs/39751158286) after read-only executor preflight [#39748165611](https://github.com/WasanthaK/khrental/actions/runs/39748165611); independent **strict 9/9 VERIFIED 2026-10-22** in [#39762736411](https://github.com/WasanthaK/khrental/actions/runs/39762736411) |
| I02 | Verify real private R2 conditional PUT/readback/immutability and controlled branding, PDF download/resend/customer journey after I01 | Invoice Designer code merged in PR #345 and deployed under `INVOICE_IMMUTABLE_ARCHIVE_ENABLED` gate; production archive activation **NOT APPROVED** |
| I03 | Gate invoice master-data UI independently until approved rollout | **CLOSED:** default-off `VITE_INVOICE_MASTER_SETTINGS_ENABLED` guard across Settings, Property and Unit, merged [PR #348](https://github.com/WasanthaK/khrental/pull/348), production-serving revision `0000321`; activation remains a separate later decision |

**Rules:** Do not rerun original 7-migration apply, send a new invoice,
ask signers to sign again, activate the Evia canary, change financial records,
merge unrelated draft PRs, apply migrations eight/nine, or enable invoice
archiving through this evidence-only update. Future runtime fixes require their
normal exact-SHA tests and authorized release path.


## C04 — approved practical database operating policy (2026-10-21)

**Status: OWNER APPROVED / C04 POLICY DECISION CLOSED.** The owner agreed to
a simple four-rule operating approach. This records the decision; it is
**not** evidence of a database privilege change, credential audit,
identification of every historical caller, production schema modification,
or final C05 release sign-off.

1. **Normal production schema changes:** use the existing governed
   GitHub/Azure migration workflow with its confirmation and verification.
   Do not treat the legacy `exec_sql` RPC or a local migration script
   as a substitute for normal production migration operations.
2. **Application credentials:** keep unrestricted database-administrator
   privileges out of the running application. Maintain distinct operational
   permissions for ordinary application use and migrations.
3. **Exceptional production maintenance/recovery:** an explicitly
   authorized database administrator may use direct SQL when genuinely
   necessary, with the operator, purpose, target and resulting change
   recorded and reviewed. This is an exception, not an everyday alternate
   migration channel. No new emergency framework is required.
4. **Development and disposable testing:** retain existing migration,
   `execute-sql`, named `migrate:*` and diagnostic scripts for
   authorized nonproduction use. Do not remove historical helpers
   wholesale; unknown manual/dynamic callers stay unverified.

**Risk boundary:** no one may bypass tenant isolation, modify financial
records without authorization, bypass signer provenance or destroy retained
documents. Material newly discovered direct production SQL use must be
evaluated rather than silently accepted as safe. The existing
runtime `exec_sql` denial remains unchanged.

**C04 disposition:** The operating *policy decision* is complete. Its
technical enforcement remains the existing production permissions and
migration controls, to be verified through ordinary operational review;
do not mark them newly audited by this docs-only change. **C05 remains
pending a separate dated business/security release decision.**


## Latest controlling delivery status — 2026-10-22 (supersedes older dated baselines)

The earlier October 21 sections are retained as **historical evidence**, not
instructions to reapply already executed migrations or revert to revision 318.
This block is the current status as of 2026-10-22:

- **Application:** [deployment #39721498237](https://github.com/WasanthaK/khrental/actions/runs/39721498237)
  confirms production Ready revision `0000321`, public serving fingerprint
  `e42ad6e0a59e3d5cb26e66ee2a0d2f27fa2f6649`, and live MSSQL health.
- **Invoice Designer I01:** the owner explicitly approved production
  migrations 8 and 9. The separate [executor preflight #39748165611](https://github.com/WasanthaK/khrental/actions/runs/39748165611)
  inspected all nine with no SQL writes and verified dedicated migration
  identity/permissions. The approved
  [apply #39751158286](https://github.com/WasanthaK/khrental/actions/runs/39751158286)
  succeeded on the matching production commit; its executor logs identify
  `20261019_01_invoice_master_data` and
  `20261020_01_immutable_invoice_pdf_archive` as **Applied and verified**.
  Earlier seven migrations were explicitly skipped as already applied.
  Independent read-only **strict 9/9 verification PASSED** in [#39762736411](https://github.com/WasanthaK/khrental/actions/runs/39762736411)
  on production serving revision `0000321`, dedicated execution
  `khrental-db-migrator-0xj607n`. The workflow retained all nine
  required `LEDGERED / SCHEMA_OK` results and passed executor identity/grant
  checks without additional SQL mutation. **I01 CLOSED.**
- **Invoice Designer I03:** [PR #348](https://github.com/WasanthaK/khrental/pull/348)
  is merged and deployed with the **default-OFF** master settings UI switch,
  `VITE_INVOICE_MASTER_SETTINGS_ENABLED`. I03 is **CLOSED** at source,
  deployment and default-visibility level. Do not implicitly enable it.
- **Invoice Designer I02:** **live synthetic R2 conditional-PUT primitive PASS**
  in [#39772830467](https://github.com/WasanthaK/khrental/actions/runs/39772830467):
  one noncustomer PDF created with `If-None-Match: *`, exact bytes/hash/type
  read back, repeated and changed writes both refused with **412**, original
  bytes preserved; scoped cleanup and **404** absence confirmed. The proof
  used only a disposable `_healthchecks` object, **not** a canonical issued
  invoice archive path or a SQL manifest. Real invoice-specific R2/SQL
  publication, crash reconciliation, tenant-authorized original-PDF access,
  controlled branded invoice, provider trace and owner acceptance **remain
  OPEN**. Nonproduction real SQL Server archive crash/retry/corruption
  acceptance has separately **PASSED** in [#39781098778](https://github.com/WasanthaK/khrental/actions/runs/39781098778)
  ([PR #353](https://github.com/WasanthaK/khrental/pull/353)); this does not
  prove live tenant SQL/R2 issuance or customer delivery. `INVOICE_IMMUTABLE_ARCHIVE_ENABLED` is **OFF**; this result does not
  authorize invoice issue, mail, real archive creation, or feature activation.
- **Original canonical C01/C04:** **CLOSED** by prior owner-approved evidence.
  **C02** remains original SendGrid delivery event-to-invoice ledger
  correlation for invoice `26101901`, without a resend.
  **C03** remains original Evia callback/signed PDF/`audit_trail.pdf`
  retrieval evidence for agreement `#47FDEA13`, without re-signing.
  [PR #347](https://github.com/WasanthaK/khrental/pull/347) fixed finalized
  agreement audit access consistency and introduced audit-specific HTTP
  diagnostics, deployed in revision `0000320` and included in `0000321`.
  An earlier owner screenshot still showed a generic retrieval failure;
  successful historic audit PDF retrieval has **not** been confirmed.
  **C05** final original canonical release APPROVE/DO NOT APPROVE decision
  remains **NOT SIGNED OFF**.

**Next sequence:** close original C03/C02 with existing archival/provider
records and obtain the separately dated C05 decision. Advance I02 real R2
object immutability, readback, tenant access and the controlled customer
invoice acceptance only under separate approval before archive activation.
Do not rerun completed migration apply or strict verification for evidence alone.
No production SQL, R2 objects, financial records, signing or email activity
were changed by this documentation reconciliation.


## Controlled browser acceptance checkpoint 2026-10-23

This checkpoint records the owner's separately authorized one-invoice demo
pilot and read-only checks of existing agreement artifacts. It supersedes
older statements that authenticated application access was unavailable. It
neither enables general invoice archiving nor backfills historical documents.

- **Controlled demo invoice:** exactly one new draft for billing period
  March 2027 was created, reviewed and issued through the authenticated
  application. Its invoice reference is **26102301**. The application
  reported provider acceptance; actual mailbox delivery is not independently
  established by that status. The owner supplied the corresponding PDF;
  its reference, renter/property, total, issue date and due date were
  checked and the one-page PDF rendered legibly. No recipient address,
  bank details, invoice bytes or screenshots are committed here.
- **Date display defect:** the PDF retained October 23, 2026 and March 1,
  2027, while the browser/text summary displayed the previous day. Root
  cause is browser-local formatting versus the PDF's UTC calendar-date
  normalization. [PR #356](https://github.com/WasanthaK/khrental/pull/356)
  passed PR verification and disposable SQL billing acceptance and was
  merged as `2b5a769c51c47d613affd80d37d3360982ab1690`.
  Production workflow [#39915623317](https://github.com/WasanthaK/khrental/actions/runs/39915623317)
  is still in progress at this checkpoint; runtime acceptance remains open.
- **C03 signed agreement retrieval:** authenticated View Document for
  existing agreement **#47FDEA13** succeeded. The downloaded one-page
  PDF contains the matching agreement ID and Evia request reference and
  visually shows both landlord and renter signatures. This establishes
  authorized signed-document retrieval, not complete callback/storage
  provenance or denied-access acceptance.
- **C03 audit retrieval:** View Signing Audit for that same agreement
  returned the explicit error **Signing audit PDF not found (HTTP 404).
  It may not have been retained in storage.** The owner confirms the audit
  trails are visible in Evia. This is an application retrieval/local-retention
  gap, not evidence that the provider audit is absent. Recovery must retrieve
  the existing provider artifact and verify its agreement/request association.
  Callback/provenance evidence remains open. No re-signing was initiated.
- **I02:** the supplied invoice PDF is functional document evidence, not
  proof of canonical R2/SQL archive publication, immutable readback or
  tenant-authorized original-PDF retrieval. The invoice account did not
  expose Download original issued PDF during this pilot. General archive
  activation remains off; I02 is not closed.

C01/C04 and I01/I03 remain closed. C02 retains its original existing-invoice
provider/ledger correlation scope; the new pilot does not replace it. C03,
I02 and the final C05 release decision remain open. A further invoice or
email must not be issued merely to repeat the successful functional checks.
