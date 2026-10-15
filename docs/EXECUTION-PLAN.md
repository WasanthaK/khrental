# KH Rentals Execution Plan

**Status date:** 2026-10-05  
**Last verified behavior-changing application baseline:** `6f345bd78a23f67612d17301ca406a86d42cf7e9`  
**P0.1 completion production proof:** `b6af12bdd0ecefe870e8297c984a985cffa98dd7`  
**Purpose:** This file is the single source of truth for what we work on next. It must be updated after every completed production change. Documentation-only commits may produce a newer build fingerprint without changing application behavior.

## Operating rules

1. **One active work item at a time.** Do not start the next item until the current item passes its exit criteria.
2. A new bug interrupts the plan only if it is production-critical: outage, security exposure, data loss/corruption, or a core business flow completely blocked.
3. Every fix follows the same sequence: reproduce -> evidence/root cause -> narrow change -> automated checks -> PR -> production deploy -> runtime proof -> update this file.
4. **No production schema DDL in web-container startup.** The web runtime identity remains restricted. Schema changes use an isolated privileged migration path.
5. **No repo-wide compatibility rewrite.** `platformClient` removal continues one business domain at a time.
6. A green deployment alone is insufficient. Production is considered deployed only when the latest Azure revision is Ready, the public FQDN serves the exact Git SHA, and MSSQL health is Ready.
7. Do not mix cleanup with a business-flow repair. Fix and verify the business flow first; cleanup belongs in a separate PR.
8. **Authentication design priority is Security -> User Experience -> Durability.** A convenience change must not weaken identity ownership, authorization, credential safety, lifecycle clarity, or durable persisted state.
9. Authentication, invitation, recovery, onboarding, membership, session or password changes must read and preserve `docs/AUTHENTICATION-LIFECYCLE.md` before implementation.
10. Every credential transition has exactly one UI owner and one backend authority. Competing legacy and current flows are a release blocker, not cosmetic debt.

---

## Current verified baseline

### Production/deployment

- [x] Deployment verification prevents a green result while Azure continues serving an older Ready revision. (#81)
- [x] Runtime DDL was removed from web-container startup. (#82)
- [x] Production database migration work is isolated from web startup. (#84-#91)
- [x] Legacy tenant membership diagnostic reports `remaining_missing_count: 0`.
- [x] Normal production deploy now explicitly owns `/bin/sh scripts/start-container.sh`. (#97)
- [x] Deployment verification checks the Azure command/args state before accepting a revision. (#97)
- [x] Temporary startup recovery/backfill workflow has been retired. (#98)
- [x] Final normal production deployment after recovery-workflow removal passed authorization tests, build, immutable image deploy, Azure revision readiness, startup-command verification, exact public SHA verification, MSSQL health, and runtime-config verification. Run `35564526487`, SHA `b6af12bdd0ecefe870e8297c984a985cffa98dd7`.
- [x] Bootstrap platform-owner access is recoverable even while the dedicated `platform_admins` production migration path remains unavailable. PR #100, SHA `fc3cf044937a3683673ec01d7d2b465f1c70b1d7`, production run `35595451678`; authorization tests/build passed, revision `khrental-app--0000103` became Ready, startup remained deterministic, exact public SHA matched, and MSSQL health was Ready.
- [x] A Platform Administrator who also has tenant membership is no longer forced out of the tenant workspace. PR #101, SHA `0f4ad15563df30c76f431d03b16c6985245d24ed`, production run `35602332768`; authorization tests/build passed, revision `khrental-app--0000105` became Ready, startup remained deterministic, exact public SHA matched, and MSSQL health was Ready.
- [x] Tenant-switch notifications no longer block top-right page actions. PR #102, SHA `190e0d412d702aed6b11f2546872c167d5808ea8`, production run `35616577333`; authorization tests/build passed, revision `khrental-app--0000111` became Ready, public build fingerprint matched exactly, and MSSQL health returned Ready. Browser verification passed on 2026-09-22.
- [x] P0.3 provider observability deployed through PR #103, behavior SHA `6ce7d95096b2868cdf27f8d5628eb1e68b963f7e`, production run `35673793484`; authorization tests/build passed, revision `khrental-app--0000113` became Ready, startup remained `/bin/sh scripts/start-container.sh`, public build fingerprint matched exactly, MSSQL health returned Ready, and server-side SendGrid configuration reported configured.
- [x] Controlled production invitation reached the configured provider/mailbox path on 2026-09-22; SendGrid accepted the request and the test message arrived in the controlled mailbox (Junk). This proved delivery while also exposing a separate invitation-lifecycle refresh defect.
- [x] PR #105, SHA `1a7269d866c662125d0e35966e8bcae94fc68c23`, corrected stale/unknown invitation lifecycle presentation: canonical status always loads, pending state refreshes on focus/visibility and every 30 seconds, and invitation-status responses are non-cacheable.
- [x] PR #106 finalized P0.3 invitation lifecycle/privacy hardening as behavior SHA `8ae3a2a84e65363f48f6991c8f5bb7542c1f967b`: invitation-only observable email delivery, canonical no-cache status client, shared Send/Resend semantics, Team/Tenant lifecycle parity, unambiguous Tenant-added wording, accepted-date display, client log hardening, redemption/status regression coverage, and the final physical acceptance stories.
- [x] Production run `35725686513` passed for SHA `8ae3a2a84e65363f48f6991c8f5bb7542c1f967b`: authorization/lifecycle tests and build passed, immutable image deployed, `khrental-app--0000116` became Ready, startup remained `/bin/sh scripts/start-container.sh`, `/api/health` reported email configured, `/api/mssql/health` returned `{"ok":true,"provider":"mssql","connection":"ready"}`, and public `/build-info.json` matched the exact behavior SHA.
- [x] Production acceptance on 2026-09-24 exposed that opening an invitation in an already-authenticated browser could be swallowed by the generic public-route redirect. PR #117 removed that route-level conflict and deployed behavior SHA `6d55e63b468e3fb95983cbbd7b038753e53027ca`.
- [x] Acceptance then exposed that successful invitation setup could replace an existing Tenant Admin browser session, leaving the original admin tab unauthenticated/stale. PR #118 preserved only a valid different-user browser session and deployed behavior SHA `498557f996dcd8378c14e43b373f1af4cffce64b`.
- [x] Console evidence then showed the invited account itself receiving `/api/platform/auth/sign-in` 401. PR #119 removed the redundant second password-login step: invitation redemption verifies the persisted credential, issues the session server-side, and only preserves an existing session after server validation. Behavior SHA `c2d353929eeec15f79a102568c2cc7aad08e5a57`, production revision `khrental-app--0000120` Ready.
- [x] The failed physical account proved `accepted_at` is not sufficient evidence of registration. PR #121 introduced `setup_incomplete` and structural auth-link validation so accepted/partial accounts are no longer falsely projected as Registered.
- [x] PR #122 added a manual-only Container Apps revision diagnostic/restart workflow after Azure revision activation exceeded the verifier window. No application behavior changed. Retry evidence later proved revision activation could complete after the original verifier timeout.
- [x] PR #123 made the business rule explicit: **Registered means a structurally valid auth linkage plus verified account access**. Invitation redemption writes the non-secret `invitation_registration_verified` marker only after the submitted credential passes the same verifier used by normal sign-in; a successful real login also qualifies through `last_login_at`. Incomplete claimed accounts show **Setup Incomplete / Account Recovery Required** and cannot be unsafely re-invited.
- [x] Production run `35985439144` passed for behavior SHA `1ac6f4d2eb43f43641220a6e19b5f8cd9f312e13`: authorization/regression tests and production build passed; R2 write/read validation passed; revision `khrental-app--0000124` became Ready; startup remained `/bin/sh scripts/start-container.sh`; `/api/health` was healthy; `/api/mssql/health` returned `{"ok":true,"provider":"mssql","connection":"ready"}`; public `/build-info.json` matched the exact SHA; expected browser MSSQL/Evia runtime configuration was verified.
- [x] Azure SQL free-limit exhaustion temporarily paused production on 2026-09-25; after billing continuation was enabled, `/api/mssql/health` returned `200` / `connection: ready` and revision `khrental-app--0000126` was healthy. This infrastructure event is separate from P0.3 auth behavior.
- [x] Fresh production acceptance with `wweerakoone+100@gmail.com` exposed a second credential owner: `WelcomeGuide` globally treated any `?token=` as invitation onboarding and called protected `/api/platform/auth/update-user`, producing 401 before the secure invitation flow owned the credential transition. This is an authentication architecture defect, not a database outage.
- [x] PR #124 corrected the architecture: `AcceptInvite` is the sole invitation credential owner; `/accept-invite` and `/reset-password` are isolated from the authenticated app shell; `WelcomeGuide` is authenticated-only and no longer treats URL tokens as invitation state. Production run `36111540458` passed authorization/regression tests, production build, R2 validation, immutable deployment and runtime verification for behavior SHA `cfea12e7846460f85e9a1e6cf99c6956c179a99e`; revision `khrental-app--0000127` became Ready, `/api/mssql/health` returned ready and the public build fingerprint matched exactly.
- [x] Fresh physical acceptance using `wweerakoone+101@gmail.com` passed on 2026-09-25: invitation setup completed once, the app opened directly, logout succeeded, normal login with the same credential succeeded, the user entered the correct Rentee workspace, and the Tenant Admin surface refreshed to **Registered**.
- [x] Phase 1 renter property/unit schema prerequisite is now applied in production. PR #142 / serving SHA `0a9e6d3d451d19aaca5a9d754903b6d12cc2ad86` added real SQL Server 2022 execution proof and corrected canonical backfill shape. Production migration run `36946616128` used the exact serving image from Ready revision `khrental-app--0000143`, applied `20260926_01_add_rentee_property_unit_associations`, verified the column/check-constraint/JSON state, recorded the migration ledger entry, and completed successfully on 2026-10-02. Business-flow persistence acceptance remains separate and must still prove create/edit/reload behavior before Phase 1 association work is closed.

### Tenant/rentee data model

- [x] One global `app_users` identity per email remains the canonical identity model.
- [x] Organization access is represented through `tenant_memberships` rather than duplicate identities. (#73-#75)
- [x] Tenant directory uses the canonical MSSQL renter path. (#72-#75)
- [x] Tenant create response contract returns the renter identity expected by the UI. (#80)
- [x] Tenant onboarding, invitations, and shared storage have started moving off the compatibility client. (#77-#79)
- [x] Invitation-card feedback and simulation behavior were corrected. (#83)
- [x] Controlled production core smoke test completed successfully through all 12 P0.2 checks on 2026-09-22.

### Known unresolved or insufficiently verified areas

- [x] Core tenant/rentee production smoke test completed. P0.2 is complete.
- [x] P0.3 core fresh-registration acceptance passed on behavior SHA `cfea12e7846460f85e9a1e6cf99c6956c179a99e`: a never-invited renter completed secure setup, entered as Rentee, logged out, logged back in normally with the same password, and the admin surface showed Registered.
- [x] P0.3 physical acceptance completed with the documented US-INV-08 exact-log-correlation waiver; the waived observability item remains explicitly not claimed as PASS.
- [x] Damaged production test account `+99` physically verified as **Setup Incomplete / Account Recovery Required** after PR #125.
- [x] Password-reset flow passed a fresh end-to-end production regression from a logged-out/private browser on 2026-09-26.
- [x] Agreement generation/signing lifecycle is production-accepted through PRs #153, #156-#160: secure agreement-bound callbacks, partial-signature progress, completed signed-document recovery/retention, and signed-document viewing were physically verified on 2026-10-05.
- [ ] Remaining compatibility-client usage has not yet been migrated domain-by-domain.

---

# Execution sequence

## Phase 0 - Production stabilization

**Goal:** Make production deployment, database state, and observability predictable before more product refactoring.

### P0.1 - Make startup ownership permanent — **COMPLETE**

Completed through PRs **#97** and **#98**.

Exit criteria:

- [x] Normal deployment succeeds without the recovery workflow.
- [x] Azure command/args state is deterministic: `/bin/sh scripts/start-container.sh`.
- [x] Public FQDN serves the exact deployed SHA.
- [x] `/api/mssql/health` reports Ready.
- [x] Recovery workflow is removed.

Evidence:

- PR #97: normal deployment explicitly sets and verifies the startup command.
- PR #97 production run `35563887278`: green.
- PR #98: temporary recovery/backfill workflow removed.
- PR #98 final production run `35564526487`: green.
- P0.1 completion proof SHA: `b6af12bdd0ecefe870e8297c984a985cffa98dd7`.

### P0.2 - Production core smoke test — **COMPLETE**

**Goal:** Verify the current production system as a business workflow before making more changes.

1. [x] Tenant Admin can log in to the production tenant workspace. — Passed 2026-09-21 in a logged-out production browser session using the normal Tenant Admin account.
2. [x] Tenants directory loads the expected current-organization renters. — Passed 2026-09-21; the Tenant Admin confirmed the production renter directory contents were correct.
3. [x] Create a brand-new tenant identity with an intentionally unique test email. — Passed 2026-09-21; the Tenant Admin confirmed the production create operation completed successfully.
4. [x] Verify the new tenant immediately appears in the Tenants directory and remains visible after reload. — Passed 2026-09-21.
5. [x] Verify create-or-attach behavior for a global identity that already exists but is not yet a renter in the current organization. — Passed 2026-09-21 using a controlled two-organization test; the second save reused the existing global identity and attached it to KH Rentals without a duplicate-email error.
6. [x] Plain **Save Tenant** persists the tenant without attempting an invitation. — Passed 2026-09-21; the Tenant Admin confirmed the saved tenant persisted and no invitation was attempted automatically.
7. [x] **Save & Invite** persists the tenant and attempts the secure invitation flow. — Passed 2026-09-21; the Tenant Admin confirmed the tenant persisted and the invitation flow was attempted.
8. [x] Tenant card **Send real email / Send Real Invitation** produces explicit success or visible error feedback. — Passed 2026-09-22; the Tenant Admin confirmed the action produced explicit feedback rather than failing silently.
9. [x] Team directory still loads correctly after the membership/data corrections. — Passed 2026-09-22 by production browser confirmation.
10. [x] Property and property-unit directories used by tenant onboarding still load. — Passed 2026-09-22 by production browser confirmation.
11. [x] Public `/build-info.json` matches the current live deployed SHA at the time of the smoke test. — Passed 2026-09-22 with `{"buildSha":"190e0d412d702aed6b11f2546872c167d5808ea8"}`.
12. [x] `/api/mssql/health` still reports Ready after the smoke-test operations. — Passed 2026-09-22 with `{"ok":true,"provider":"mssql","connection":"ready"}`.

P0.2 production baseline: PR #102 / SHA `190e0d412d702aed6b11f2546872c167d5808ea8`, deployment run `35616577333`, revision `khrental-app--0000111` Ready, deterministic startup `/bin/sh scripts/start-container.sh`, exact public build fingerprint verified, MSSQL Ready.

Exit criteria: **COMPLETE — all 12 P0.2 checks passed.**

### P0.3 - Invitation/email observability — **COMPLETE WITH DOCUMENTED US-INV-08 OBSERVABILITY WAIVER**

Scope:

- Add a clear Send/Resend Invitation action where appropriate.
- Show canonical invitation state/date.
- Add structured server-side success/failure logging for `/api/send-email`.
- Capture SendGrid `x-message-id` when available without logging email body, tokens, or secrets.
- Keep tenant and team invitation lifecycle semantics consistent through send, resend, redemption and registered state.
- Enforce one owner for credential bootstrap and isolate invitation/recovery routes from the authenticated application shell.

Implementation and verification evidence:

- [x] Normal tenant/team action is explicit **Send Invitation / Resend Invitation** and registered accounts no longer expose an invitation action.
- [x] `Save & Invite`, tenant-card send/resend and team-card send/resend use the same secure invitation authority and observable server email-delivery path.
- [x] Canonical invitation status is projected from invitation state plus the actual authentication account. `setup_incomplete` is used when setup was attempted but the account is not proven login-capable.
- [x] **Registered is no longer inferred from `accepted_at` or `app_users.auth_id` alone.** It requires matching `app_users`/`auth_users` linkage, usable credential structure, and either a verified invitation credential marker or successful-login timestamp.
- [x] Successful redemption persists `app_users.auth_id` and `user_invitations.accepted_at` transactionally, then verifies the persisted credential with the normal sign-in verifier before marking invitation registration verified.
- [x] Fresh/stale-session invitation redemption can adopt the server-issued session directly without a second password-login call; a valid different signed-in browser session may be preserved without preventing redemption.
- [x] Incomplete claimed accounts show **Setup Incomplete / Account Recovery Required** and invitation resend is disabled to avoid overwriting a potentially shared global credential.
- [x] Tenant cards distinguish **Tenant added** from invitation lifecycle and show created/expiry/accepted dates where applicable; Team cards use the same lifecycle semantics.
- [x] Tenant details no longer intentionally suppress the canonical status lookup; valid accessible users should not remain **Unknown** after the lookup completes.
- [x] Pending status refreshes quietly every 30 seconds and when the admin browser regains focus/visibility; canonical status requests and responses are explicitly non-cacheable.
- [x] `/api/send-email` uses structured allow-listed success/failure logs and captures SendGrid `x-message-id` when present.
- [x] Invitation delivery uses a dedicated `/api/send-email` client with no EmailJS fallback and no recipient/subject/body console logging.
- [x] Invitation client telemetry excludes recipient email, subject, email body, invitation token/link, reset token, password and API secrets.
- [x] SendGrid rejection handling does not read or log the raw provider response body.
- [x] Regression coverage includes lifecycle derivation, structural auth linkage, verified registration access, credential round-trip, redemption persistence, canonical action labels, session preservation/adoption, setup-incomplete recovery behavior, focus/visibility/pending refresh, no-cache status reads, provider message ID, rejection-body suppression, log-field allow-listing, Team/Tenant parity and the dedicated observable email path.
- [x] Controlled production invitation email reached the test mailbox, proving the provider/mailbox path.
- [x] PRs #117, #118 and #119 corrected route/session/redemption defects found during the physical acceptance run.
- [x] PR #121 stopped accepted/partial registrations from being falsely labelled Registered.
- [x] PR #122 added manual Container Apps revision diagnostics after Azure activation outlasted the normal verifier; later retry evidence proved slow activation rather than an application startup crash.
- [x] PR #123 merged behavior SHA `1ac6f4d2eb43f43641220a6e19b5f8cd9f312e13`, requiring verified account access for Registered and making incomplete claimed accounts recovery-only.
- [x] Production run `35985439144` certified `khrental-app--0000124` Ready for behavior SHA `1ac6f4d2eb43f43641220a6e19b5f8cd9f312e13`; startup, health, MSSQL, public build SHA, R2 and browser runtime configuration all passed.
- [x] US-INV-01 passed physically: plain Save Tenant persisted the renter as Not Invited, showed Send Invitation, produced no invitation dates and sent no email.
- [x] US-INV-02/provider delivery passed physically: controlled production invitation reached SendGrid and the controlled mailbox.
- [x] Fresh `+100` acceptance proved the route-level architecture still allowed the legacy `WelcomeGuide` to compete with `AcceptInvite`; browser evidence was `/api/platform/auth/update-user` -> 401 while opening the invitation flow.
- [x] Root cause is documented in `docs/AUTHENTICATION-LIFECYCLE.md`: `AcceptInvite` is the sole invitation credential owner; `WelcomeGuide` is authenticated-only and must never infer invitation state from URL tokens; `/accept-invite` and `/reset-password` are isolated from the normal app shell.
- [x] PR #124 merged and deployed the isolated credential-flow correction. Production run `36111540458` passed automated authorization/regression tests, build, R2 validation and runtime checks; revision `khrental-app--0000127` is Ready and serves SHA `cfea12e7846460f85e9a1e6cf99c6956c179a99e` with MSSQL ready.
- [x] US-INV-04 core acceptance passed with fresh `+101`: clean invitation setup, direct authenticated entry, logout, normal login with the same created password, correct Rentee workspace, and admin status **Registered**.
- [x] US-INV-03 passed physically with controlled `+102`: Resend superseded the older invitation; the older link was rejected and only the newest link remained usable.
- [x] US-INV-05 passed physically: after durable renter re-login was proven, the Tenant Admin reloaded both the Tenants card/list and tenant details and confirmed **Registered** remained durable with no Send/Resend invitation action.
- [x] US-INV-06 passed physically with controlled `+102`: after account setup, reopening the accepted invitation was rejected as already used/unavailable and could not start account setup again.
- [x] US-INV-07 passed physically with controlled `+103`: the Team-member flow was exercised through initial send, pending/resend, newest-invitation account setup and Team refresh, completing the required canonical lifecycle parity check.
- [ ] US-INV-08 exact structured-log correlation — **WAIVED / DEFERRED 2026-09-26 by operator direction; not claimed as PASS.** SendGrid provider evidence confirmed the controlled `+105` invitation was Delivered / SMTP 250. A 24-hour centralized production-log privacy scan found zero sensitive-pattern matches, but exact structured-event correlation remained unavailable through the Azure logging path.
- [x] US-INV-09 passed physically: the Tenant Administrator deliberately compared and reloaded available Not Invited, Invitation Pending and Registered card/details surfaces; canonical states agreed, valid records did not remain Unknown, and Registered records exposed no Send/Resend action.
- [x] Damaged `+99` recovery projection passed after PR #125: historical accepted-invitation evidence now outranks a newer expired invitation, unsafe re-invitation is blocked, and production physically shows **Setup Incomplete / Account Recovery Required**. Run `36153613672`, SHA `2b0d77dda30761a032b289282050191eacf8246e`, revision `khrental-app--0000128` Ready.

Exit criteria:

- [x] Production evidence shows an invitation request reached the email provider/mailbox path.
- [x] Credential bootstrap has one owner: invitation route isolation prevents tenant/app-shell/legacy onboarding from competing with `AcceptInvite`.
- [x] A freshly invited tenant can complete setup, log out, and log back in with the created credential.
- [x] Production acceptance is sufficient to proceed by explicit operator waiver of the remaining US-INV-08 structured-log correlation; the waived story remains documented as not passed.
- [x] Damaged `+99` is correctly projected as recovery-required and unsafe resend is unavailable.
- [x] 24-hour production privacy scan found zero sensitive-pattern matches; exact delivery-event correlation is deferred under the documented US-INV-08 waiver.

### P0.4 - Password reset regression — **COMPLETE**

Scope:

- Reproduce password reset from request through reset link to successful password change.
- Verify the reset link does not incorrectly require an already-authenticated tenant context.
- Verify MSSQL connectivity and redirect behavior.
- Verify `/reset-password` remains an isolated anonymous credential route under the canonical authentication lifecycle design.

Verification evidence:
- [x] Physical production regression completed 2026-09-26 from a clean logged-out/private browser.
- [x] Reset request returned the expected non-enumerating success behavior and the recovery email arrived.
- [x] Reset link opened the isolated `/reset-password` recovery flow without authenticated tenant context.
- [x] New password redemption completed successfully and the user could return to normal authentication with the new credential.
- [x] Backend redemption changes the credential, marks the token used, revokes other outstanding reset tokens, and revokes all existing auth sessions in the same SERIALIZABLE transaction.
- [x] Existing automated coverage verifies the reset endpoints are anonymous credential endpoints and the browser recovery route is isolated independently of its token query.

Exit criteria: **COMPLETE — clean end-to-end password reset passed from a logged-out production browser session on 2026-09-26.**

---

## Phase 1 - Tenant/rentee workflow integrity — **COMPLETE**

**Goal:** Treat Tenants as the renter/lessee workflow and Team as the staff/contractor workflow.

Work in this order:

1. Verify create, edit, list, attach-existing-identity, invite, resend, and deactivate/reactivate behavior.
2. Verify same-organization role conflicts are explicit rather than appearing as duplicate-email errors.
3. Verify property/unit associations survive create and edit.
4. Verify tenant detail screens use canonical renter data rather than legacy fallbacks where practical.
5. Add regression tests for every production bug discovered during the smoke test.

Exit criteria:

- [x] No renter can be saved successfully and then disappear from the current organization's Tenants directory.
- [x] Existing global identities attach to organizations without duplicate `app_users` rows.
- [x] Tenant Admin cannot create platform-admin identities through tenant workflows.
- [x] Tenant and Team onboarding paths are clearly separated.

---

## Phase 2 - Agreement generation and digital signing — **COMPLETE**

**Goal:** Satisfy the business requirement: generate the agreement, place landlord/tenant signatures correctly, retain the signed document, and advance agreement lifecycle state.

Work in this order:

1. Reproduce the current signature-placement failure with a real generated agreement.
2. Compare current Evia implementation with the previously working marker/AutoStamp behavior (`For Landlord:` / `For Tenant:`).
3. Choose the supported placement mechanism from evidence; do not change Evia versions merely for cleanup.
4. Verify landlord signing, tenant signing, callbacks/webhooks, signed-document retrieval/storage, and agreement status transitions.
5. Add an automated regression fixture around signature marker/location handling where feasible.

Exit criteria: both signatures consistently appear in the intended agreement locations and the fully signed document is retained and linked to the agreement lifecycle.

Production acceptance:
- [x] Secure agreement-bound Evia callback path restored and verified.
- [x] Individual signer completion is persisted and the progress counter reflects completed signers.
- [x] Fully signed agreement transitions to the completed/signed lifecycle state.
- [x] Completed signed PDF is recoverable and retained in KH Rentals tenant-scoped storage.
- [x] Production browser physically opened the retained signed document after PR #160 on 2026-10-05.
- [x] Deployment run `37280211507` served exact SHA `c66ff3d51684645e6e482291a025fa47aecef2c9` from Ready revision `khrental-app--0000161`; MSSQL health returned ready.
- [x] Evia webhook and Evia V2 integration workflows were green on the same merge SHA.

Result: **COMPLETE — Phase 2 exit criteria satisfied.**

---

## Phase 3 - Document/storage domain cleanup — **COMPLETE**

**Goal:** Continue Stage 2 compatibility-client removal without destabilizing signing.

- [x] Review `DocumentService` / agreement document storage.
- [x] Route agreement document storage through explicit KH Rentals storage APIs.
- [x] Preserve tenant-scoped R2 paths and cross-tenant protections.
- [x] Remove only the compatibility dependency for this domain.

Exit criteria: agreement/document storage no longer depends on the compatibility storage shape and signing behavior remains unchanged.

Production acceptance:
- [x] PR #161 migrated `DocumentService` agreement/document upload/list/download and the legacy agreement attached-signed-document write to explicit tenant-scoped storage APIs.
- [x] PR #161 bound direct `/storage/:bucket/...` delivery to the tenant encoded in the object path and active membership.
- [x] PR #162 corrected the storage-route regex startup defect and added `node --check server.js` to the deployment verifier.
- [x] Production browser acceptance confirmed both a normal agreement document and the retained signed agreement open successfully through the tenant-bound storage route.
- [x] PR #163 migrated the remaining active `downloadSignedDocument()` fallback in `eviaSignServiceLegacy.js` off `platformClient.storage` without changing Evia retrieval/status/OAuth behavior.
- [x] Production deployment run `37289196435` served exact SHA `6f345bd78a23f67612d17301ca406a86d42cf7e9` from Ready revision `khrental-app--0000164`; MSSQL health returned ready and the public build fingerprint matched exactly.
- [x] Final source inventory shows no remaining `platformClient.storage` usage in `DocumentService.js`, `agreementService.js` or the active Evia signed-document fallback.

Result: **COMPLETE — Phase 3 exit criteria satisfied.**

---

## Phase 4 - Remaining compatibility-client removal — **ACTIVE**

Before changing code:

- [x] Inventory remaining `platformClient` / `platformClientCore` consumers.
- [x] Group completed storage compatibility consumers by business domain.
- [x] Remove storage compatibility façade and the major PropertyDetails/AgreementList read fallbacks in bounded production-verified slices.
- [ ] Complete remaining non-storage compatibility contracts in consolidated domain packages, with per-operation authority tests and one PR/deployment per accepted package.

Completed bounded domains include billing/payment proof storage, utilities/meter evidence, maintenance media, Evia diagnostic uploads, application storage initialization, bucket tooling, shared storage façade, PropertyContext/PropertyList/PropertyDetails reads, AgreementList/detail reads, and multiple dead agreement/invoice compatibility helpers.

Current active domain: **consolidated compatibility acceptance and closure
decision**, including disposable two-tenant SQL evidence and an explicit list
of still-live/blocked or owner-approved deferred contracts. For operational
efficiency, group related maintenance/notification and contract acceptance
tasks per PR, but preserve exact-head CI, Azure served-SHA and MSSQL
verification after every runtime merge. Doc/test/workflow-only merges no
longer require a new Azure serving revision.

Remaining work is concentrated in narrower, higher-risk areas: live agreement/property/property-unit fallbacks, agreement-template operations, invoice list/create/update compatibility paths, app-user/auth compatibility, and final repository-wide inventory/closure. These require explicit authority/behavior parity before removal.

Do **not** perform a repo-wide rewrite.

---

## Phase 5 - Product regression and release hardening

After the core flows above are stable, run focused regression passes for Platform Admin, properties/units, billing/invoices/receipts, maintenance lifecycle, notifications/email, agreement cancellation/deletion, and authorization boundaries.

---

# Parked backlog - do not interrupt the active phase

- General UI/terminology cleanup.
- Large-scale refactoring.
- Repo-wide compatibility-client removal.
- Performance optimization without a measured production problem.
- New feature work unrelated to the active phase.
- Optional architecture improvements that do not fix a verified business problem.
- Repair the dedicated privileged production migration executor, then apply/reconcile `platform_admins` and `tenancy_billing_adjustments` through the managed migration ledger. The current bootstrap-owner fallback does not replace this future schema work.

---

# Change-control template

```text
Active item:
Problem/evidence:
Scope:
Out of scope:
PR:
CI result:
Production revision/SHA:
Runtime proof:
Result:
Next item:
```

## Recently merged items — production evidence reconciliation

```text
PR #208: remove dead databaseUtils SQL RPC compatibility surface.
Merge SHA: 10673672531621b6273bac3938e96ab9e82d0c66.
CI/deployment: production workflow #590 reported green by operator; exact Azure Ready serving revision, public build SHA, and MSSQL/runtime evidence not independently captured in this audit.
Result: MERGED — production acceptance evidence pending.

PR #209: remove unused generic databaseService compatibility facade.
PR-head CI: workflow #591, run 37882986704, verify job successful; deploy skipped on PR.
Merge SHA: 14f57e3fb0d7681d65a6badd5a6760ba6475f143.
Production deployment: operator reported green; exact Azure Ready serving revision, public build SHA, and MSSQL/runtime evidence not independently captured.
Result: MERGED — production acceptance evidence pending.
```

## Recently merged Phase 4 slice

```text
PR #210: removed unused platform-backed fetchData export from src/utils/dataUtils.js; preserved active conversion helpers.
Exact PR-head CI: workflow #593 (run 37884803418), verify job successful; PR deploy skipped.
Merge SHA: 4f84a1fe0275b81dd219b7ce1b0037d19b5e0aaa.
Production deployment: operator reported green; independent Azure Ready revision, exact public serving SHA, and MSSQL/runtime evidence not captured.
Result: MERGED — formal production acceptance evidence pending.
```

## Recently merged Phase 4 items — PRs #211–#213

```text
PR #211: removed obsolete PostgreSQL timestamp exec_sql RPC repair script, preserving active MSSQL tooling.
PR-head CI: workflow #596 (run 37886032242) passed.
Merge SHA: fd3fd0cafc7d223a932aab6c1eeb79cf7b87591a.
Production: operator reported green; independent Azure Ready/serving SHA/MSSQL runtime proof remains pending.
Result: MERGED — production evidence pending.

PR #212: removed obsolete PostgreSQL database setup exec_sql RPC script, preserving MSSQL migration entry points.
PR-head CI: workflow #598 (run 37887222838) passed.
Merge SHA: 10e9aa57eef1b64d6bbce44178bee2d519d0de9d.
Production: operator reported green; independent Azure Ready/serving SHA/MSSQL runtime proof remains pending.
Result: MERGED — production evidence pending.

PR #213: removed unused PostgreSQL notifications-table recreation RPC script; live notificationService preserved.
PR-head CI: workflow #600 (run 37891045911) passed.
Merge SHA: 0c97a31347aa2b7ddb76705c7b18f36830316c91.
Production: operator reported green; independent Azure Ready/serving SHA/MSSQL runtime proof remains pending.
Result: MERGED — production evidence pending.
```

## Current ## Recently merged Phase 4 item — PR #214

```text
PR #214: removed unused src/config/platformClient.js forwarding shim while preserving active platformClient service and script-local shim.
PR-head CI: workflow #602 (run 37894412141) passed.
Merge SHA: 662f274445194ef7d37568bf4b90ee2904b2581b.
Production deployment: operator reported green; independent latest Azure Ready revision, exact public serving SHA and MSSQL/runtime proof remain outstanding.
Result: MERGED — formal production acceptance evidence pending.
```

## Current active item

```text
Active item: Phase 4 - closure-readiness audit and remaining compatibility operation/authority inventory.
Problem/evidence: Dead wrappers and scripts were removed in PRs #208–#214, but live invoice, agreement/template, app-user/auth, utilities/maintenance, notifications, and privileged migration tooling still include platformClient compatibility operations. src/db/runMigration.js still calls exec_sql RPC while src/db/executeSql.js uses direct MSSQL.
Scope: docs/PHASE4-CLOSURE-READINESS.md records completed merge evidence, unresolved production attestations, remaining live compatibility domains, Phase 4 closure gates and a contract-first next slice.
Out of scope: runtime code deletion, production DB migrations or DDL, auth, billing, property and document writes.
Result: PR #215 merged (SHA 523bedb51c862518cdd024ebe128bd717de5767e); Phase 4 NOT ready to close.
Next item: inventory and decide migration-executor authority/exec_sql callers before any further live compatibility removal; obtain exact-SHA Azure/MSSQL release evidence or a documented waiver.
```

## Phase 4 migration authority clarification

The governed production schema-write path already exists: `.github/workflows/run-production-db-migrations.yml`, `scripts/run-production-migrations.mjs`, and the dedicated `khrental-db-migrator` job, as specified in `docs/PRODUCTION-MIGRATION-EXECUTOR.md`. This documents the authority model, **not** proof that the privileged job is provisioned or able to apply.

Legacy `src/db/runMigration.js` uses `exec_sql` RPC, `src/db/executeSql.js` uses direct MSSQL batch execution, and `src/components/admin/SqlMigration.jsx` contains browser-side PostgreSQL DDL. They must not substitute for the governed production migration workflow.

See `docs/PHASE4-MIGRATION-AUTHORITY.md` for the entrypoint classification and next inspect-only route/caller census. No production SQL writes are authorized by this plan update.

## Phase 4 SQL entrypoint caller audit and bounded orphan cleanup

```text
PR #216: migration-authority review and canonical control-plane decision.
PR-head CI: workflow #606, run 37908391425, passed.
Merge SHA: 7f758aa4786e86138ae1c8ab9d75ec5d4f995b2b.
Result: MERGED — docs-only; no production schema execution.

Current active item: remove orphaned browser-side legacy PostgreSQL SqlMigration component.
Evidence: indexed repository code search for SqlMigration found only src/components/admin/SqlMigration.jsx; no imports, route or navigation consumers were found. UI component includes PostgreSQL CREATE FUNCTION DDL and exec_sql RPC logic.
Scope: delete only src/components/admin/SqlMigration.jsx, add CI regression guard preserving governed production migrations and existing npm migration commands.
Out of scope: src/db/runMigration.js (explicit npm migrate command with existing regression guards), src/db/executeSql.js, managed production migrations, active application functionality, SQL grants/DDL.
Result: ACTIVE — phase-4-remove-orphan-browser-sql-migration pending CI/review.
Next: validate exact-head CI, safely merge, verify deployment, then inventory remaining legacy SQL scripts before any further deletion.
```

## Phase 4 legacy SQL command audit — PR #218

```text
PR #217: removed orphaned browser SQL migration component.
CI: workflow #608 (run 37910489699) succeeded.
Merge SHA: f6e5ae2f2fad524fc913fb29611008ef7e410c89.
Production: operator reported green; independent Ready revision, serving SHA and MSSQL health not available.
Result: MERGED — formal production attestation pending.

Current active item: retire an unreferenced property-association migration launcher.
Evidence: src/scripts/run_migration.js only imports src/scripts/migrate_property_associations.js and has no indexed repository import or npm script. The underlying migration script remains directly documented by src/README_PROPERTY_ASSOCIATIONS.md. External manual invocation cannot be ruled out by repository search.
Scope: delete only src/scripts/run_migration.js, add CI guard; preserve underlying migration and every registered SQL command.
Out of scope: governed production migration workflow, DDL, credentials, billing, auth, or runtime code.
Result: ACTIVE — phase-4-remove-orphan-property-migration-wrapper, awaiting CI and review.
Next: require exact-head CI, authorized merge, and independent production acceptance evidence.
```

## Phase 4 invoice contract-parity audit — PR #219

```text
PR #218: removed orphan property-association migration wrapper; underlying script and registered commands preserved.
PR-head CI: workflow #610 (run 37912429093) passed.
Merge SHA: 0c75021d8759defdc323663bfe501bae1b9df6a9.
Production: operator reported green; independent Azure Ready serving revision, exact SHA and MSSQL/runtime proof pending.
Result: MERGED — production attestation outstanding.

Active item: Phase 4 - invoice MSSQL/compatibility contract inventory before live-code changes.
Evidence: src/services/invoiceService.js contains MSSQL-first invoice list/create/update and generic fallbacks. server.js mounts billing mutation guards rejecting generic and MSSQL compatibility writes; paymentService still references legacy create/update helpers. Dashboard and utility-reading compatibility reads have consumers.
Scope: docs/PHASE4-INVOICE-CONTRACT-PARITY.md documents callers, guard semantics, read parity requirements, tenant authorization, write protection, atomicity/idempotency and test-first next slice.
Out of scope: runtime changes, invoice/payment state mutations, schema/DDL, authentication, live agreement/property operations.
Result: ACTIVE — documentation PR #219 pending exact-head CI/review.
Next item: bounded invoice mutation fail-closed contract tests and consumer audit, preserving governed billing lifecycle.
```

## Phase 4 invoice failure isolation — coordinated runtime batch

```text
PR #219: invoice MSSQL/compatibility contract review, documentation only.
PR-head CI: workflow #612 (run 37916538295) successful.
Merge SHA: 17b32f229514ce5ac2dc7d09c27cce8b3f0dd0e5.
Result: MERGED — documentation, no production database changes.

Active item: invoice fail-closed compatibility changes.
Problem: invoiceService.listInvoices silently retried on the generic platform transport after an MSSQL failure, even authorization/tenant errors. createInvoiceRecord and updateInvoiceRecord retried prohibited invoice writes after MSSQL errors, conflicting with dedicated billing lifecycle API guards.
Scope: on MSSQL list error return the original {data:null,error}; block legacy create/update exports with a 409 BILLING_LIFECYCLE_REQUIRED contract; preserve read compatibility when MSSQL mode is disabled and preserve dedicated billing/payment endpoints. Add CI tests for the contract and server-side mutation guards.
Out of scope: utility readings, dashboard data joins, invoice monetary calculations, agreement/billing schema, MSSQL writes and production migrations. Remaining compatibility read paths require explicit MSSQL parity and tenant-scoped tests.
Result: ACTIVE — branch phase-4-invoice-fail-closed-batch, exact-head CI and review pending.
Next: verify authorized invoice creation and payment work through /api/billing; then inventory each remaining read path for bounded contract migration. Production Azure Ready revision, exact serving SHA and MSSQL health remain separate release acceptance gates.
```

## Phase 4 invoice dashboard read-correctness batch

```text
PR #220: fail closed on invoice API failures and reject prohibited legacy invoice writes.
PR-head CI: workflow #614 (run 37916828117) succeeded.
Merge SHA: 4daeb053f871ae66fa5c6d46efac4ab1c5a53230.
Production: independent exact Ready revision, public serving SHA and MSSQL health not yet established.
Result: MERGED — production evidence pending.

Current active item: invoice dashboard summary completeness and pending-count consistency.
Evidence: getInvoiceSummaryByProperty formerly fetched only the first 1000 invoices per property and treated that truncated page as a complete financial total; getPropertiesWithPendingReadings reran one separate count query per property, showing zero if one failed.
Scope: page invoice summaries to completion through existing authorized listInvoices contract, propagate page errors rather than render partial totals, and count pending readings from the initial authorized result set. Add CI regression guards.
Limitations: utility_readings compatibility query remains and might itself require pagination or endpoint parity; this batch does not prove >1000 pending readings can be returned by the underlying compatibility API. Exact tenant and end-to-end browser behavior require further acceptance.
Out of scope: invoice creation, money/status mutations, tenant authorization policy, MSSQL schema or migration, utility calculations.
Result: ACTIVE — branch phase-4-invoice-dashboard-read-correctness, awaiting exact-head CI and review.
Next: confirm dashboard accuracy and tenant isolation; migrate utility reading data retrieval through an explicit scoped API contract in a separate bounded slice.
```

## Phase 4 pending utility-reading dashboard pagination — PR #222

```text
PR #221: invoice summary pagination/completeness and consistent pending-reading counts.
CI #616 (run 37938380079) passed; merge SHA 161f8d8a7dbbc5fc1f363e2517ba8cd3942b7fa6.
Production: operator confirmed green; independent exact Azure Ready revision, serving build SHA, MSSQL and browser tenant-fixture proof remain outstanding.
Result: MERGED — production attestation pending.

Active item: tenant-scoped pending utility-reading dashboard query correctness.
Problem/evidence: getPropertiesWithPendingReadings used nonexistent MSSQL utility_readings.property_id rather than propertyid; fetched an unpaginated list that could silently undercount. Dashboard catch logged errors without clearing stale pending data.
Scope: use the existing central platform query with tenant/property authorization, canonical propertyid, stable id-ordered pagination and bounded error handling; aggregate same authorized reading set; surface errors and clear stale UI data; expand CI regression checks.
Out of scope: new authority, dedicated utility-reading endpoints, invoice/payment writes, billing calculation changes, schema/DDL, auth changes.
Result: ACTIVE — branch phase-4-pending-readings-tenant-scoped-pagination awaiting CI/review.
Next: check exact-head CI, merge if green, verify deployment. Then audit remaining utility invoice generation/reporting read parity and browser tenant isolation with executable integration tests.
```

## Phase 4 utility-billing isolation contract tests — PR #223

```text
PR #222: corrected pending utility-reading propertyid schema, stable pagination and dashboard error handling.
PR-head CI: workflow #618 (run 37943041249) passed.
Merge SHA: f5a99a3166e367dc7361f72c037634d47df37eca.
Production: operator confirmed deployment green; Azure Ready revision, exact serving SHA, MSSQL and cross-tenant integration tests remain independently unverified.
Result: MERGED — formal production acceptance evidence pending.

Active item: utility-reading and monthly-billing tenant-isolation contract tests.
Scope: add runnable authorization tests verifying a rentee's utility-reading owner filter, rejection of unauthorized utility-reading updates, invoice/payment lifecycle mutation guards, and invariant contracts for tenant-scoped pending-reading pagination and monthly billing locking/linkage. Register in test:authorization.
Out of scope: live billing mutation/API behavior, database schema and grants, migrations, claim of end-to-end MSSQL multi-tenant acceptance.
Result: ACTIVE — branch phase-4-utility-billing-isolation-contract-tests pending CI.
Next: execute these tests, review CI, then add database-backed tenant A/tenant B integration proof in separate gated slice before retiring other live utility compatibility.
```

## Phase 4 two-tenant SQL Server billing acceptance — PR #224

```text
PR #223: utility-reading, invoice mutation and monthly billing isolation contract regressions.
CI #620 (run 37947974509) green; merge SHA f36e5c9d9d5a5d48968de1b4ce224388e23bfe67.
Result: MERGED — independent production Ready revision/SHA/MSSQL attestations outstanding.

Active item: disposable database-backed two-tenant monthly billing acceptance.
Scope: isolated Docker SQL Server database with two distinct tenants, rentees, properties,
active agreements and pending utility readings; run the REAL generateMonthlyInvoicesForTenant
code, verify one draft invoice per agreement/period, rent/utility totals, linked reading,
invoice components and lifecycle event. Assert tenant A cannot consume tenant B's readings
or create B invoices, wrong-tenant invoice retrieval is absent, repeat runs skip duplicates.
Run as a separate GitHub-hosted CI job on relevant PR paths and manually via
npm run test:billing:sqlserver. Disposable Docker fixture only; cleanup even on failure.
No production database credentials or DDL authority invoked.
Result: ACTIVE — branch phase-4-billing-two-tenant-sqlserver-acceptance, awaiting CI.
Remaining: full multi-tenant HTTP authorization and browser E2E, payment lifecycle integration,
Azure Ready revision/serving SHA and MSSQL runtime attestation. Do not mark Phase 4 closed
on source or fixture proof alone.
```

## Phase 4 authenticated HTTP tenant isolation — PR #225

```text
PR #224: disposable real SQL Server two-tenant monthly billing acceptance.
Exact PR-head CI #622 (run 37948822932) and SQL Server acceptance #1 (run 37948823099) passed.
Merge SHA: e7a338ac0102a58e46a7e8b6ee8bf86729a9b403.
Production: operator reported GREEN; independent Azure Ready serving revision, exact SHA and production MSSQL health pending.

Active item: authenticated HTTP-level tenant isolation on the existing disposable SQL Server fixture.
Scope: add real bearer sessions mapped to tenant-member rentees; run Express session, tenant context, platform query and MSSQL invoice routes on loopback. Validate valid tenant selection; foreign requested tenant rejected; anonymous query denied; forbidden cross-property reading returns empty; own reading accessible; cross-tenant invoice 404; direct invoice PUT 409 BILLING_LIFECYCLE_REQUIRED. Keep real SQL fixtures and lifecycle assertions intact. Include required permission bundle migration.
CI discovery: first HTTP SQL Server run #2 (37951992553) failed on legitimate same-tenant selection (403 TENANT_ACCESS_DENIED) because SQL Server UUID case differed from the client UUID header. Corrective scope: normalize UUID string casing solely for membership/legacy-tenant comparisons in src/api/tenant/context.js, preserving active membership verification and foreign-tenant denial; add uppercase-header regression in the disposable HTTP suite. No authorization widening beyond UUID textual equivalence.
Out of scope: production credentials, browser E2E, payment status changes, Azure deployment attestation.
Result: ACTIVE — branch phase-4-authenticated-http-tenant-isolation, pending disposable SQL and standard CI.
Next: gated CI verification, merge if successful, production attestation and browser-level tenant isolation.
```

## Phase 4 browser-protected billing boundary — PR #226

```text
PR #225: authenticated HTTP tenant-isolation and UUID normalization accepted.
PR-head CI #627 (37952454218), SQL Server + HTTP #5 (37952454277) passed.
Merge SHA: 4c28dae031d7824ea027d2b7173659c56eb021d3.
Production deployment reported GREEN by operator; independent Azure Ready revision,
exact external serving SHA and production MSSQL health remain outstanding.

Active browser slice: built frontend Puppeteer headless smoke, no credentials.
Verify protected admin invoice/utility and renter invoice/utility routes redirect
unauthenticated users to login/unauthorized, without rendering billing controls.
Run in dedicated GitHub-hosted CI; no production data or browser accounts.
Result: ACTIVE, PR #226 pending browser CI.
Not covered: authenticated two-tenant browser navigation, billing UI totals,
successful payment flows, production browser session, public build fingerprint.
Next: credentialed isolated-browser fixture and Azure production attestation.
```

## Phase 4 authenticated renter browser proof — PR #227

```text
PR #226: anonymous browser billing-route protection; CI #629 and browser acceptance #1 green.
Merge SHA: 5e4b22783d9ddbfff21b4ad098be78b1f2d1886a.
Production deployment reported GREEN by operator; independent serving Azure revision/SHA and production MSSQL health outstanding.

Active item: extend the disposable SQL Server billing/HTTP acceptance to mount the real
Vite React application behind the existing authenticated fixture API on localhost.
Use two independent real bearer sessions, start headless Chromium for each and validate
that renter utility history is accessible without login/unauthorized redirect or
cross-tenant property labels. No production traffic, browser credentials, or dev bypass.
This supplements existing real SQL invoice generation and HTTP cross-tenant assertions.
Result: ACTIVE — PR #227 requires SQL browser acceptance and regular build CI green.
Remaining: authenticated full invoice/UI arithmetic, tenant switching (multi-membership),
payment UI and production Azure/MSSQL attestations.
```

## Phase 4 renter invoice browser data acceptance — PR #228

```text
PR #227: authenticated renter utility-history browser against disposable SQL.
Standard CI #631 (run 37958320315) and SQL+browser #6 (run 37958320378) green.
Merge SHA 23f911bec1f411a6e3e8c4ecffd6eea1b8d99e61.
Production revision/serving SHA and MSSQL health independently unverified.

Active: extend two-tenant SQL-backed authenticated browser checks to /rentee/invoices.
Monthly generation correctly produces draft invoices; after verifying draft lifecycle,
the disposable fixture alone sets its two invoices to renter-visible pending state.
Check actual My Invoices page, each tenant's property label and numeric amount,
and absence of other tenant's property label. Preserve SQL and HTTP isolation checks.
No production billing mutation, schema migration or test credential outside Docker fixture.
Result: PR #228 requires standard CI and real disposable SQL+browser acceptance.
Remaining: account/payment interaction and actual multi-membership tenant switching,
Azure external build SHA, Ready revision and production MSSQL runtime attestation.
```

## Phase 4 renter invoice browser data acceptance — PR #228

```text
PR #227: authenticated renter utility-history browser acceptance merged as
SHA 23f911bec1f411a6e3e8c4ecffd6eea1b8d99e61.

PR #228: exact-head build CI #634 (run 38216343608), disposable two-tenant
SQL Server browser acceptance #9 (run 38216343572), and protected browser
smoke #3 (run 38216343500) all passed at head
bcb49a1fd5550f3df3babf4812920f60b194d7ef.
Merge SHA: 82b439e0d9b0dae93a24c38c17f7f0d58710b556.
Result: MERGED — two different authenticated renters see their own invoice
property label and amount, while prior tenant-scoped SQL/HTTP assertions remain.
Production Azure Ready revision, exact external serving SHA and live MSSQL
health remain unverified, so deployment acceptance and Phase 4 closure remain open.

ACTIVE next item: disposable authenticated renter invoice-account/payment
read and non-mutating browser interaction acceptance. Verify tenant A/B own
invoice account/receipt view, outstanding arithmetic and foreign invoice
denial through existing dedicated billing routes. Preserve blocked direct
invoice writes; do not submit payment proofs, create payments, change
invoice status, access production credentials, or change production SQL.
Follow with actual multi-membership tenant switching and production
Azure/MSSQL attestation in separately gated slices.
```

## Phase 4 renter account/receipt read acceptance — PR #229

```text
PR #229: added disposable SQL Server + authenticated Chromium tests for
renter invoice account, verified and pending payments, outstanding balances,
receipt visibility, foreign-invoice denial, anonymous denial and read-only
browser interaction. No production payment mutations.
Exact PR-head b2b8e1d416d6bed5c7734ae0e863b12980a5c8a1:
build/authorization CI run 38222696044 GREEN;
disposable SQL+browser acceptance run 38222696018 GREEN.
Merge SHA: e9288cef802f4b82db57f93a2c635eab7320a40d.
Result: MERGED — production Ready revision/public exact serving SHA/MSSQL
health still require independent verification.

ACTIVE next item: authenticated multi-membership tenant switching in
disposable SQL/browser acceptance. Use one global app user with two
active tenant memberships and separate tenant-owned invoices/properties.
Prove switch A -> B -> A changes scoped browser invoice and account/receipt
data, preserves single global identity, rejects unentitled tenant selection,
and prevents stale cross-tenant data in a mounted browser session.
No production account changes, migrations, writes or privilege widening.
Follow with production release attestation and Phase 4 closure review.
```

## Phase 4 authenticated multi-membership switching — PR #230

```text
PR #230: accepted a single global renter identity with two active tenant
memberships, A -> B -> A browser switching, invoices, payments, receipts,
foreign-tenant denial and stale-view isolation. Profile resolution now uses
the authenticated server context, not a different tenant's app-user row.
Exact-head build/authorization run 38225084235 GREEN and disposable
SQL Server + browser run 38225084192 GREEN at
8f31c5dc2d39016a686f0d05f8f3e3db7e68bab2.
Merge SHA: e7f3b9aaa1d3cd04a5b2f8b8a87491a9eeecd154.
Production run 38225640159 SUCCESS: latest Azure revision 0000233
Ready, public build-info SHA exactly e7f3b9aaa1d3cd04a5b2f8b8a87491a9eeecd154,
live /api/mssql/health returned ok:true, connection:ready, and
runtime/startup configuration checks passed.
Result: MERGED + PRODUCTION ATTESTED for this exact SHA. This evidence
does not retrospectively prove each earlier historical serving revision.

ACTIVE next item: migrate just the renter invoice list read from the
generic platform-client query to an explicit tenant-scoped billing GET.
The server derives the current renter from the authenticated global
identity and the active tenant from a verified membership, hides drafts,
preserves property label/amount presentation, and fails closed.
Continue to use the dedicated invoice-account/receipt lifecycle API.
Run anonymous/foreign-user/other-tenant, same-tenant other-renter,
draft-hiding and A -> B -> A disposable SQL + real-browser acceptance.
Do not alter payment writes, invoice generation, status transitions,
schema, production credentials or cross-domain compatibility operations.
PR/CI/production proof are still required before declaring this slice done.
```

## Phase 4 dedicated renter invoice list — PR #231

```text
PR #231 migrated only the renter invoice listing screen to
GET /api/billing/rentee/invoices, with authenticated server-owned renter
identity, verified active tenant membership, status=draft exclusion, and
tenant-scoped property labels. Invoice account/receipts retain their
existing dedicated lifecycle read contract. No payment writes or DDL.
Earlier compatibility-source assertion was updated to enforce this new
explicit billing contract.

Exact PR-head e378af819d766da9be37a587a60a38c5df7fd4f6:
standard build/authorization run 38227354564 GREEN;
disposable SQL Server + authenticated two-tenant/browser acceptance
run 38227354696 GREEN; protected browser smoke run 38227354749 GREEN.
Merge SHA: d24041af61e23f15edfd31e17e2a7b1c2c5db1b4.
Status: MERGED. Production serving revision, exact external fingerprint,
runtime configuration and live MSSQL health for this change PENDING.
Do not claim deployment attested solely from PR-head CI.

ACTIVE release gate: verify a post-merge production workflow reports its
latest Azure revision Ready, exact deployed main-commit SHA publicly served,
and live MSSQL connection Ready. Only then accept this slice.

NEXT bounded Phase 4 task (not yet active until release gate passes):
inventory one remaining compatibility-domain operation and prove
MSSQL API authority/contract parity before changing application runtime.
Prioritize remaining agreement-template or invoice-management read path,
and keep core billing/payment mutations strictly under lifecycle APIs.
Phase 4 as a whole remains OPEN until the wider canonical inventory is
discharged, regardless of this one successful invoice-list migration.
```

## Phase 4 agreement-template authoritative transport hardening

```text
ACTIVE bounded slice (proposal): when MSSQL mode is enabled, agreement-template
get/list/create/update/delete must treat the scoped MSSQL API as authoritative.
403/401/409/5xx must not trigger platformClient table fallback. For unchanged
UI behavior, missing/schema-unavailable get returns null, list returns [];
schema-unavailable mutations fail with a descriptive error; every other
MSSQL error propagates to the caller. The compatibility table path remains
available only when MSSQL mode is explicitly disabled.

Risk and acceptance: no widening of privileges, no new database migration,
no agreement-signing changes, no write retries. Regression tests exercise
actual five service function bodies under unsuccessful and successful MSSQL
requests, assert no generic-table calls after authoritative failure, and
retain the prior non-MSSQL path behavior. Exact-head CI, merge and production
Azure Ready/SHA/MSSQL verification are required before recording completion.

Next after this slice: inventory live agreement-template endpoints and
remaining agreement/property compatibility operations and select one
bounded contract-first migration. Phase 4 remains OPEN.
```

## Phase 4 authoritative agreement DELETE (bounded follow-on)

```text
PR #232: agreement-template get/list/create/update/delete fail closed when
MSSQL mode is enabled. Exact-head test/build workflow 38230100641 GREEN.
Merge SHA 6558e9410889b20527cbbb9fae4811506029c759.
Production merge-SHA workflow 38230264800 must independently confirm
Azure latest Ready revision/public exact SHA/MSSQL health; do not
declare production release accepted while this workflow is running.

ACTIVE independent slice: fail closed only deleteAgreement() when the
authoritative DELETE /api/mssql/agreements/:id fails. It must never
retry against platformClient table deletion after 401/403/404/409/5xx.
Legacy compatibility deletion remains available solely with MSSQL
explicitly disabled. No agreement schema/migration, signing-state,
cancellation workflow, permission broadening or production data writes.
Contract tests exercise actual service implementation and one-delete
semantics, including API success/failure and disabled-MSSQL behavior.

Follow-up: finish authoritative transport/route inventory and verify
agreement create/sign/updates and external signatures separately.
Phase 4 remains OPEN. This delete hardening is not proof of overall
agreement lifecycle parity.
```

## Phase 4 authoritative agreement creation — next bounded gate

```text
PR #233 agreement DELETE fail-closed: authorization/build workflow 38230968660
passed on head 274a14640c1abed2ccfac18e9a71ba28071d7a78;
merged as e5d68d6d8f166f4e6fb1a14f1c658233c7efd79f.
Production workflow 38231239449 succeeded: Azure revision 0000236 Ready,
public exact SHA e5d68d6d8f166f4e6fb1a14f1c658233c7efd79f served,
live /api/mssql/health connection ready and startup/browser runtime valid.

ACTIVE bounded change: saveAgreement new-record creation must execute a
single authoritative POST /api/mssql/agreements when MSSQL mode is enabled.
After a failed, ambiguous or empty success response, never retry the same
creation through platformClient agreement upsert. Existing agreement updates,
Evia signing and document-generation behavior remain separately governed and
unchanged. Explicit disabled-MSSQL mode retains the legacy creation path.
Tests exercise the real service saveAgreement body with injectable transports,
including success, 401/403/404/409/5xx, no result, legacy mode and unchanged
existing-agreement delegation. No schema, auth, billing or production-data
changes. CI/merge/production release gates still required.

NEXT: contract-first review and individual hardening of agreement updates
and signature transitions, preserving Evia webhook authority and refusing
secondary side effects after ambiguous MSSQL writes. Do not batch these
with the new-agreement-creation slice. Phase 4 remains OPEN.
```

## Phase 4 authoritative agreement update — bounded follow-on

```text
PR #234 new-agreement single-write acceptance: CI run 38232900230
GREEN at exact head 1b4cd2e572a5f48081ffbd83ea083e82c6ec19d1.
Merge SHA: 4d90f378ce5d3f1fc1adeaf7af6757d3f0bbd0f5.
Production workflow 38233055711 is a separate pending release gate:
Ready Azure revision, exact public SHA and live MSSQL connection must pass
before release acceptance.

ACTIVE independent update slice: when MSSQL mode is enabled, the existing
agreement updater must use one authoritative PUT /api/mssql/agreements/:id.
Any 401/403/404/409/500/503 or ambiguous result must not trigger a secondary
platformClient update. Retain generic table path only with MSSQL explicitly
disabled. All template, signing/webhook, invoice, document and tenant roles
remain untouched; no real agreement records are mutated in acceptance.
Exact service-body regression covers success, failures, empty result and
disabled-MSSQL compatibility.

NEXT: inspect Evia signing and property/unit status side effects as a
separate contract-authority slice. Do not claim signing complete or
remove a fallback before separately proving webhook lifecycle invariants.
Phase 4 remains OPEN.
```

## Phase 4 manual signing authority — single transport, no fallback

```text
PR #235 (agreement update fail-closed): exact-head CI run 38233284859
GREEN at 057faa50c3095e88450de490a36015b245167e64;
merged as 3a1c0ea5e48e8dbef873352b8ceb7a261d72c86e.
Its separate production workflow 38234629958 must prove Ready revision,
exact public commit SHA and live MSSQL connectivity; PR CI is not
production attestation.

ACTIVE isolated manual-signing slice: AgreementDetails invokes
markAgreementAsSigned. Under MSSQL mode it must use only one
POST /api/mssql/agreements/:id/sign. On denial, conflict, failed or
ambiguous transport, no legacy updateAgreementData, property status,
unit status or renter association side effects are permitted. Existing
manual-sign server authority (admin guard) and tenant-bound SQL
transaction are unchanged; non-MSSQL compatibility mode retains its
existing behavior. Source-contract and injected service-body tests
prove fail-closed HTTP 401/403/404/409/500/503 outcomes and absent
secondary side effects. No live sign requests or database mutations
are performed by this acceptance.

IMPORTANT: manual admin signing is NOT Evia webhook completion.
Evia's authenticated callback signature checks, completed-document
retention, webhook event de-duplication and terminal state changes
remain untouched and require their own separate review/acceptance.
Never conflate these authorities or grant signing privilege via this PR.

Next: assess whether manual sign should be available for
Evia-managed agreements, and prove server-side signing state
preconditions, replay/idempotency and side-effect invariants against
a disposable SQL Server fixture. Do not change webhook authority or
statuses as an incidental consequence of fail-closed hardening.
Phase 4 remains OPEN.
```

## Phase 4 server-authoritative manual-signing transitions — next active slice

```text
PR #236: the client now fails closed after an authoritative manual sign
API failure, without secondary agreement/property/unit/renter updates.
Exact-head CI run 38234889222 GREEN at
570f65f5a17e39d5d99b41e2646c22114a253a77;
merged SHA 7bb36019c2a4360cdf26d0777b047a1b9d62156c.
Production run 38235488928 SUCCESS: Azure revision 0000239
Ready, public exact deployed SHA 7bb36019c2a4360cdf26d0777b047a1b9d62156c,
live /api/mssql/health MSSQL connection ready and browser runtime config OK.

ACTIVE bounded change: the server-side manual admin sign transaction must
lock its tenant-scoped agreement before evaluating eligibility. Manual sign
is allowed only from canonical pending/pending_signature states and only
when no Evia request/document/signature flow owns the agreement. Repeated
manual sign of an already-signed non-Evia record is a read-only success:
no signeddate rewrite or property/unit/renter association replay.
Foreign tenant returns 404, invalid or terminal state and Evia-managed
records return explicit 409. SQL transaction protects agreement status
and all related property, unit and renter-association updates; a failure
of any related update rolls the agreement state back. UI sign action
uses the same central eligibility predicate. No migrations, credential
changes, billing mutations or Evia webhook behavior changes.

PROOF GATES: pure state-policy tests; real disposable SQL Server tests for
tenant A/B isolation, rejected states, Evia guards, rollback by induced
property-update failure, replay and concurrent requests. Require exact PR
head build/authorization + disposable SQL acceptance GREEN before merge;
production Ready revision/public exact SHA/live MSSQL separately required.

RISK / NEXT: the transactional manual-sign route is distinct from Evia
webhook completion and retained-document authority. Later slices must
review Evia webhook idempotency and manual-versus-Evia authority policies
independently, as well as the legacy global app_users tenant_id versus
multi-membership renter assignment concern. Phase 4 remains OPEN.
```

## Phase 4 Evia processed-delivery replay gate

```text
PR #237: tenant-locked manual signing state guards, Evia exclusion,
transactional property/unit/user updates, read-only replay and concurrent
SQL signing proof. CI build/authorization run 38237086761 GREEN;
disposable two-tenant SQL Server acceptance run 38237086698 GREEN;
renter SQL workflow run 38237086598 GREEN at exact head
847cbefefe88441d0c9b89d72b56cecceb9648f2.
Merge SHA b067a873d68f51e97cbf7deba324a95d5329c91a.
Production workflow 38237267065 SUCCESS: latest Azure revision 0000240
Ready, public exact build SHA b067a873d68f51e97cbf7deba324a95d5329c91a
and live MSSQL health connection ready.

ACTIVE bounded Evia webhook slice: after authenticated HMAC/callback-token
verification and tenant/RequestId-bound agreement resolution, check existing
processed deliveryId before recording another webhook event or mutating
signatory/completion state. Same tenant+request+deliveryId with processed=1
is a read-only acknowledgement for non-completion events; completed
agreements are read-only duplicates ONLY when signed status, completed
signature status and locally retained signed document are present.
A previously processed completion missing its retained local document
must still be retryable for document retrieval. No deliveryId or unprocessed
events remain retryable. Tests cover pure duplicate policy and actual
disposable SQL Server idempotency, tenant isolation, event count and
timestamp preservation. Authentication/verification remains unchanged.

LIMITATION / follow-on: this slice suppresses SEQUENTIAL processed
re-delivery. It does not create a uniqueness lock for simultaneous
unprocessed deliveries or change out-of-order terminal state authority.
Plan independent concurrency/idempotent terminal transition review and
document-retention recovery proof after this slice. No production webhook
replay, external Evia requests, migrations, SQL modifications or document
writes are executed for acceptance.
```

## Phase 4 concurrent Evia delivery claim — bounded follow-on

```text
PR #238: sequential processed webhook delivery replays were guarded
before event insertion and signatory/terminal state mutations, preserving
signed-document recovery. Exact PR-head webhook suite 38238773743,
build/authorization 38238773538, and isolated two-tenant SQL Server
38238773516 all GREEN; merge SHA f86731f89c0774f808569c521842748232a83e37.
Production release 38238945271 SUCCESS: Azure revision 0000241 Ready,
public exact SHA f86731f89c0774f808569c521842748232a83e37 and live MSSQL
connection Ready. Evia webhook security setup 38238945145 SUCCESS.

ACTIVE bounded follow-on: concurrent callbacks with the same
tenant_id/request_id/deliveryId must acquire one atomic SQL Server
application-lock-protected event claim before any signatory/status/document
side effects. A second in-flight delivery receives retryable 503, not
a false processed acknowledgement. Successful processing marks the claimed
existing webhook event processed, so later replays are read-only.
An abandoned unprocessed event may be reclaimed only after a 15-minute
lease; the claim is renewed atomically without appending another event.
Use the existing webhook_events table and transactional sp_getapplock;
no migration or release-time DDL required. Missing deliveryId events
retain legacy processing semantics, explicitly OUTSIDE this guarantee.
Processed completion missing an archived signed document retains a
recoverable retry path, including guarding concurrent recovery attempts.

PROOF: dedicated webhook unit/source contracts and disposable Docker SQL
Server two-tenant concurrent Promise.all claims, single event insertion,
retryable in-flight state, processed replay, stale-event takeover and
cross-tenant independence. Production callbacks/agreements and external
Evia documents are not modified by acceptance.

LIMITATION: bounded leases do not prevent concurrent effects if an active
worker exceeds the lease without renewing it. This slice does not alter
out-of-order terminal authority, signed-document archival idempotency, or
legacy deliveries missing a deliveryId. Those need separate production-safe
proofs and policy review before Phase 4 closure.
CI exact-head build/authorization, dedicated Evia suite and SQL+browser
acceptance must be green before merge; then Azure Ready/public SHA/live
MSSQL attestation must pass. Phase 4 remains OPEN.
```

## Phase 4 Evia terminal order and completion protection — bounded slice

```text
PR #239: concurrent Evia delivery claims serialized by SQL application
locks for tenant/request/delivery with retryable in-flight response,
processed replay, and stale lease recovery. Exact-head Evia webhook
test run 38240567886 GREEN, build/authorization run 38240567884 GREEN,
and disposable two-tenant SQL Server run 38240568071 GREEN.
Merge SHA ce1ea66d694acde96a20277a9868ad4dcbdbd74f.
Production run 38240778054 SUCCESS: Azure revision 0000242 Ready,
exact public serving SHA ce1ea66d694acde96a20277a9868ad4dcbdbd74f
and live MSSQL connection ready; webhook security setup run 38240778082
also GREEN.

ACTIVE bounded Evia terminal-order slice: authenticated, scoped Evia
cancellation/rejection/completion deliveries must not reverse previously
finalized signed/completed or cancelled/rejected agreement states.
Previously finalized state makes a delayed conflicting event an
audited, processed, read-only acknowledgement. An already signed
agreement with a missing locally retained signed document may still
handle a completion callback for document recovery; signed timestamps
remain preserved. A stale signatory-completed callback must not turn
completed signature_status back into in_progress. SQL UPDATE must use a
live-state predicate and OUTPUT check, not only a stale JS read, to
prevent a concurrent terminal winner from being overwritten.
Keep existing HMAC/callback verification and tenant/request scoping.
No schema/migration, production webhook injections, payment or signing
state changes in tests. Real disposable two-tenant SQL Server proof
covers signed -> late rejected/cancelled/signer, cancelled -> late
completed, valid pending -> rejected -> late completed, audit rows,
timestamps, signed document and tenant isolation.

IMPORTANT: This policy applies a first-terminal-event-wins model,
except for completed-PDF recovery. It does not fully serialize
different delivery IDs or enforce ordering by provider eventTime.
A concurrent completion may archive a document before losing the
conditional final-state update. Document archival coordination,
inconsistent terminal repairs and long-running claim heartbeat
remain independent follow-ups. Do not claim Phase 4 closed.
Required merge gates: exact head build/authorization, dedicated
Evia webhook tests, and real disposable SQL Server acceptance.
Production Azure Ready/public SHA/MSSQL verification is separate.
```

## Phase 4 cross-delivery Evia signed-document archive coordination

```text
PR #240 terminal-order policy: exact-head Evia webhook test run 38256428300,
build/authorization run 38256428016 and disposable two-tenant SQL run
38256428035 all GREEN. Merge SHA 73edebb0c6df27b7daf06ffa46bb226cc12fe819.
Production workflow 38256654156 SUCCESS: Azure revision 0000243 Ready,
public SHA 73edebb0c6df27b7daf06ffa46bb226cc12fe819 exact,
MSSQL live connection Ready; Evia security run 38256654188 GREEN.

ACTIVE bounded slice: when two Evia completion deliveries with DIFFERENT
deliveryIds reference the same tenant-bound agreement without an archived
signed document, obtain a SQL Server transaction-owned exclusive
application lock keyed by tenantId+agreementId BEFORE external Evia document
retrieval or storage. Re-read the tenant/request-scoped current agreement
while the lock is held. Keep the lock through the final guarded completion
SQL update and processed-webhook event update; second worker must not
archive again if the first has retained the local signed PDF.
If busy, return retryable 503, without acknowledging a completed delivery,
and expire this worker's own pending delivery claim for prompt retry.
A failed/aborted archive always releases the SQL lock by transaction
rollback; no schema DDL, extra privileges, role changes, production SQL
or live callbacks are involved in acceptance.

PROOF: dedicated source contract tests and disposable SQL Server proof
of two same-agreement different-delivery concurrent closures, one winner,
retryable 503 contender, fresh agreement URL visible on subsequent retry,
foreign-tenant/request denial and lock release after exceptions.
Remaining risks: SQL application transaction/connection held during external
document download/upload; long-running archive can consume connection pool
capacity. Distinct delivery IDs still have independent webhook event rows.
Out-of-order callback state is separately guarded by PR #240 and remains
subject to conditional SQL updates. The 15-minute delivery lease and
legacy callback without deliveryId are unchanged. Production monitoring
of connection-pool pressure and retry counts is a follow-up.
Exact-head CI build/authorization, Evia tests and disposable SQL+browser
must be green before merge; production release verification remains separate.
Phase 4 remains OPEN.
```

## Phase 4 Evia archive capacity and pool backpressure — active bounded slice

```text
PR #241: agreement-scoped SQL application lock coordinates signed-document
archive of distinct delivery IDs through the final agreement URL/status
update. Exact-head build/authorization run 38293584003 GREEN, dedicated
Evia suite run 38293584029 GREEN, disposable two-tenant SQL Server run
38293584201 GREEN; merged SHA 1e7baa0d5917ea037cb40855299d7564d43a2986.
Production workflow 38293781215 SUCCESS: Azure latest revision 0000244
Ready, public exact build SHA 1e7baa0d5917ea037cb40855299d7564d43a2986,
live MSSQL health connection ready. Evia security 38293781229 SUCCESS.

ACTIVE bounded follow-on: admission-limit simultaneous Evia PDF archiving
operations per application replica BEFORE holding a SQL transaction-owned
agreement archival lock across slow external PDF operations. Default limit
2; EVIA_ARCHIVE_MAX_CONCURRENT permits an explicit positive-integer tuning
value, capped to configured MSSQL_POOL_MAX - 2 where pool capacity permits,
so concurrent billing, authorization and callback SQL reads retain room.
Saturation returns HTTP 503 (EVIA_ARCHIVE_CAPACITY_EXCEEDED), does not
attempt SQL lock acquisition, and makes this delivery's unprocessed
webhook-event claim immediately retryable just like existing lock contention.
Finally clauses release admission slots after success or failure; duration,
capacity rejection, and >=30-second slow archives are logged without user
data. Cross-replica transaction-owned SQL locking remains authoritative.

ACCEPTANCE: dedicated Evia tests cover limit configuration, concurrent
admissions, 503 under pressure, success/failure slot release, and webhook
retry policy. Disposable SQL Server acceptance checks a held archive and
over-capacity denial cannot exhaust an additional pool connection, that
other SQL queries can still proceed, and that a retry works after release.
No DB DDL, live webhook injection, credential change, billing mutation or
production signed-document operation in these tests.

LIMITATIONS / NEXT: admission control is per Node replica rather than a
global distributed queue. The SQL transaction still remains open during
external PDF retrieval and R2 upload; it must not be timed out independently
of the ongoing upload because that would lose fencing. Investigate durable
short-transaction archive leases and immutable staged paths in a future
separate design slice, plus connection pool/load soak evidence. A fixed
15-minute per-delivery retry lease, legacy payloads lacking deliveryId,
and document retention/recovery authority remain separately governed.
Require exact-head build/authorization, Evia and SQL acceptance green
before merge, then production Azure Ready/public exact SHA/MSSQL proof.
Phase 4 remains OPEN.
```

## Phase 4 Evia immutable archive staging precondition — bounded preparation

```text
PR #242 archive pool backpressure: exact-head build/authorization
workflow 38310719490 GREEN, dedicated Evia workflow 38310719400 GREEN,
and disposable two-tenant SQL Server workflow 38310719452 GREEN.
Merged as 1c70123204f89047dbf66faa20120db43165cfe4.
Production workflow 38310894009 SUCCESS: latest Azure revision 0000245
Ready, public exact serving SHA 1c70123204f89047dbf66faa20120db43165cfe4,
live MSSQL connection ready, Evia security configuration 38310894013 GREEN.
Archive admission default of two per replica is now production-accepted.

ACTIVE bounded preparation (non-runtime): support optional immutable,
attempt-scoped staging paths for both completed Evia inline webhook PDFs
and Evia API-retrieved signed PDFs and audit trails. Each attempt is
identified by a fresh opaque UUID; one attempt stages under
tenants/{tenant}/agreements/{agreement}/signed/staged/{attempt}/{file}.
Identifiers are validated and the public URL shape remains storage-relative.
When no archive attempt is specified, previous production document paths,
uploads and returned URLs MUST stay exactly unchanged. The live webhook
continues using existing cross-replica SQL application lock and existing
per-replica admission guard; staged paths are NOT yet activated in runtime.
No SQL migration, new secrets, webhook authority or production files are
changed by this preparatory slice.

Proof: unit tests for two distinct attempts staging same named PDF and
audit trail without collision, successful API download staging, invalid
identifiers, backward-compatible default paths and unchanged webhook
locking. DESIGN ONLY protocol and future fences are documented in
docs/EVIA-ARCHIVE-LEASE-DESIGN.md. Exact-head build/authorization,
dedicated Evia tests and disposable SQL/browser acceptance must be green
before merge, followed by exact merge-SHA production release evidence.

NEXT AFTER ACCEPTANCE: implement a durable, tenant-scoped, fenced archive
lease with short claim/commit transactions, a live lease-token check
at promotion, worker crash takeover, and safe staged-object cleanup
policy. Until all these pass real two-tenant SQL race proofs, retain
the existing long-held SQL lock and archive capacity limit. Phase 4
remains OPEN and legacy compatible clients remain to be audited.
```

## Phase 4 fenced Evia archive lease core — dormant SQL acceptance

```text
PR #243 immutable stage contract: exact-head build/authorization run
38312502397 GREEN, Evia suite 38312502354 GREEN, disposable two-tenant
SQL acceptance 38312502346 GREEN at 92c7c55e2e85b2e992f2b58477921d9e5542e112.
Merge SHA 6619404650d7b1d46ddaa1807c5d310a6935698a.
Production run 38312722143 SUCCESS: Azure latest revision 0000246 Ready,
public build SHA 6619404650d7b1d46ddaa1807c5d310a6935698a exact,
live /api/mssql/health connection ready, Evia security configuration
workflow 38312722223 green.

ACTIVE bounded follow-on: independently implement a DORMANT durable,
tenant-scoped and Evia request-scoped archive-lease module using reserved
webhook_events event_type 'evia.archive.lease.v1' (no schema change) and
a transaction-owned app lock held only during SQL claim/renew/finalize.
Each claim generates a fresh UUID attempt token and uses the SQL Server
clock + updatedat for 15-minute expiry. A new worker may reclaim an
expired token; stale workers must fail renewal and final publication.
Final publication accepts only the current attempt's immutable signed
PDF staging URL and verifies live tenant, Evia request and terminal
agreement guards before atomically updating signed URL/status and
marking the reserved lease event processed. Missing/other-tenant
agreements fail closed. Existing signed document wins without another
upload. SQL rollback must restore agreement and lease on failure.

Critically, this slice IS NOT A LIVE WEBHOOK SWITCH. Existing Evia HMAC,
delivery claims/events, manual signing, cross-replica archiveLock.js,
archiveCapacity.js, document storage and callback completion workflow
remain unchanged. Disposable Docker SQL Server acceptance must prove
two concurrent claims, tenant isolation, expiry takeover, stale-token
fencing, disjoint stage paths, one winning URL, stable replay, and
transactional rollback. Unit tests validate stage URL and IDs. No
production SQL DDL or live PDF writes; exact-head CI gates before merge
and separate Ready/public SHA/MSSQL attestation afterwards.

NEXT: integrated short-transaction lease + verified callback + immutable
storage and signatory/audit status consistency, long-operation heartbeat,
crash and post-commit recovery, orphan cleanup. Review remaining live
compatibility-client removals before Phase 4 closure. The dormant core
alone DOES NOT satisfy migration or production runtime safety.
```

## Phase 4 dormant Evia fenced staging orchestration — bounded slice

```text
PR #244 dormant SQL archive lease core: build/authorization workflow
38314351787 GREEN, dedicated Evia tests 38314351775 GREEN, disposable
two-tenant SQL acceptance 38314351778 GREEN at exact-head SHA
8c55b032372dd387b77f1d93ebe2facf1b52dc6f. Merged SHA
e4a264b028b5b9dfc80fa63018bbc5683c642d18.
Production release workflow 38314498863 SUCCESS: Azure revision
0000247 Ready, public exact serving SHA
e4a264b028b5b9dfc80fa63018bbc5683c642d18, MSSQL live connection
ready. Evia main-branch tests 38314498940 GREEN and Evia security
workflow 38314499101 GREEN. The lease module is deployed but DORMANT.

ACTIVE bounded change: prepare an independent, unreferenced Evia
archiveCoordinator.js composing acquire/renew/finalize lease operations.
An attempt holding a fresh fenced UUID uses that EXACT token as the
immutable PDF and audit staging path. Both verified inline-document
storage and authenticated Evia API fallback are supported. Heartbeat
renews during slow external work; failed ownership renewal aborts
cooperative staging and always prevents final SQL publication even if
a storage driver ignores cancellation. After uploads, drain the
heartbeat and renew once again before SQL publication. No signed PDF
means fail closed. Busy claim returns retryable; already complete is
read only. Verified tenant/agreement/request identity cannot be
overridden by retrieval options.

Acceptance: dedicated Evia tests for busy/complete, controlled slow
staging and heartbeat, expired-owner fencing, failure/no-signed-PDF,
inline/API fallback, attempt token continuity and unchanged live
webhook. Real disposable two-tenant SQL test with blocked mock
external upload proves another worker returns busy, SQL remains
queryable, final publication is owner-fenced with immutable signed
PDF and audit pair, completion replay is read-only and foreign
tenant cannot publish.

IMPORTANT: this is STILL NOT A LIVE CALLBACK SWITCH. Actual webhook
HMAC/callback-token authorization, signatory metadata and provider
delivery-event bookkeeping are unchanged. Existing live archiveLock
and archiveCapacity remain authoritative. Before any live activation,
verify event audit, signatory completion, long-work expiry/cancellation,
post-commit acknowledgement, staged cleanup and real two-tenant
storage race recovery. No production SQL DDL, callback replay,
agreement mutation, billing write or external PDF upload in
acceptance. Require exact PR-head build/authorization, Evia tests
and disposable SQL/browser green before merge, followed by separate
Azure Ready/exact SHA/MSSQL release proof. Phase 4 remains OPEN.
```

## Phase 4 dormant verified Evia delivery accounting and HTTP recovery

```text
PR #245 dormant fenced staging coordinator exact-head acceptance:
build and authorization #38316076456 GREEN, Evia test #38316076503
GREEN, disposable two-tenant SQL Server acceptance #38316076476
GREEN, head 1fe5572ea22410ef007a7e5ca2dc7e354913b8b8.
Merged SHA b85e93a2f789d9e77104654c69c2e63a04f3b756.
Production deploy #38316295570 SUCCESS: Azure ready revision 0000248,
public exact serving SHA b85e93a2f789d9e77104654c69c2e63a04f3b756,
live MSSQL connection ready. Main-branch Evia tests #38316295555
and security configuration #38316295567 GREEN.

ACTIVE bounded follow-on: extend only the DORMANT Evia archive lease
and coordinator to optionally accept a verified, tenant/request-scoped
webhook_events completion event ID. The winner atomically completes its
archive lease, signs the agreement, updates only its stored signer
metadata (existing signed-at dates preserved) and marks the verified
source delivery processed within ONE SQL transaction. Scoped event
must be completion and must not be the reserved lease row.
An authenticated new completion event delivered AFTER a successful
commit but failed HTTP reply can acknowledge the already-retained
signed agreement using a separate tenant/request/lease-processed
short transaction, WITHOUT another PDF upload or agreement timestamp
mutation. Already-processed replay is idempotent. Foreign tenant,
foreign request, non-completion, invalid event ID and pending
unpublished document all fail closed.

Disposable two-tenant SQL Server integration proofs cover atomic
source-event+lease+agreement completion, two signatories, preserved
historic dates, negative tenant/request and event-type cases,
new-delivery lost-HTTP-ack recovery, replay timestamp stability
and no false acknowledgement for unpublished PDF. Unit contract
tests cover signer metadata, coordinator delivery propagation and
live webhook disconnection. No schema DDL, live callback,
manual-signing/billing update or storage upload from tests.

Critical: this remains a DORMANT PREPARATION PR; the existing live
HMAC/callback-token handler, event logging, agreement archive SQL lock
and concurrency guard are unchanged. Before live activation prove
verified callback integration, signer completion parity, audit trail
discovery and safe orphan cleanup with crash/race SQL+storage tests.
Require exact-head build/authorization, Evia and disposable SQL/browser
green before merge; verify Azure Ready/exact public SHA/MSSQL after.
Phase 4 remains OPEN.
```

## Phase 4 default-off Evia fenced webhook canary — bounded gate

```text
PR #246 dormant verified delivery accounting exact-head acceptance:
build/authorization #38319730497 GREEN, Evia tests #38319730373
GREEN, disposable two-tenant SQL Server #38319730439 GREEN at
c4ed5df408bc901c6091e23a9e630cd23f7b128e. Merged SHA
652a4b61b19ba52750699f67836eaedabd08772f.
Production release #38319901574 SUCCESS: Azure revision 0000249
Ready, public serving exact SHA
652a4b61b19ba52750699f67836eaedabd08772f, live MSSQL connected.
Evia main tests #38319901573 and webhook security #38319901582 GREEN.
These accepted improvements remain DORMANT by default.

ACTIVE bounded gate: connect the verified Evia webhook processor to
the prepared short-transaction fenced lease coordinator behind an
EXPLICIT DEFAULT-OFF, PER-TENANT AND PER-AGREEMENT CANARY:
EVIA_FENCED_ARCHIVE_MODE='canary', plus UUID allowlists for both
EVIA_FENCED_ARCHIVE_CANARY_TENANTS and
EVIA_FENCED_ARCHIVE_CANARY_AGREEMENTS.
Only callback-token-verified tenant-and-agreement-bound completion
requests with a provider deliveryId, no recipient-specific signatory
details, no existing retained signed document, and no conflicting
terminal state can enter. HMAC-only (unscoped) and all non-canary
requests keep the existing verified callback implementation.
The canary routes an already-claimed verified delivery to SQL-fenced
agreement lease, immutable per-attempt signed PDF and audit trail,
ownership-checked renewal and atomic signer/event/pointer completion.
Missing either PDF or audit trail, busy lease, or failure returns
retryable 503, with the unprocessed provider event claim immediately
eligible for retry. Completed publication/recovery may return 200.
Capacity admission is retained; the old agreement SQL lock is not
mixed with the new canary path.

ACCEPTANCE: dedicated Evia unit tests prove off-by-default,
exact allowlist and cryptographic scoped route requirement, no
selection on nonterminal/partial/signer-specific events, claim
ordering, fail-closed document-pair requirement, and unchanged
legacy path. Disposable two-tenant SQL Server acceptance uses
verified-scope simulator and fake immutable object storage:
busy->retry, source provider claim, signed+audit publication,
lease+delivery processed, signer completion, read-only replay,
unchanged dates and denied foreign tenant. No live Evia provider
requests, production SQL schema, signed records or payment writes.

DO NOT ENABLE CANARY IN AZURE IN THIS SLICE. Operator review is
required after full callback-token end-to-end, delayed/crash
storage-race, audit-trail access and orphan stage cleanup proof.
The feature is a preparedness gate not blanket live migration.
Exact-head build/authorization, Evia and real disposable SQL/browser
CI must all be GREEN before merge; production acceptance separately
requires Azure Ready/exact public SHA/live MSSQL. Phase 4 OPEN.
```

## Phase 4 Evia expired-worker storage race and read-only orphan triage

```text
PR #247 default-off callback canary: exact-head build and authorization
workflow #38321632557 GREEN, dedicated Evia tests #38321632595 GREEN,
and disposable two-tenant SQL Server acceptance #38321632586 GREEN
on PR head a26066db4752b2c3890af3ce42ffa25c341713e0.
Merged SHA 945a556e99cae93b8782cd48812161bb3e3ffc71.
Main production workflow #38321788228 SUCCESS: Azure revision
0000250 Ready, public exact build SHA
945a556e99cae93b8782cd48812161bb3e3ffc71, live MSSQL health
connection ready; main Evia tests #38321788268 and webhook security
#38321788344 GREEN. The canary remains OFF by default and no
production allowlists were changed.

ACTIVE independent Phase 4 slice: require real disposable SQL Server
and mocked immutable storage proof for a stalled external upload
from worker A, SQL lease expiry and takeover by worker B, successful
signed PDF + audit publication by B, and delayed A upload completion.
B must be authoritative; A's renewed/finalized SQL attempt must be
rejected as EVIA_ARCHIVE_LEASE_FENCED. Both attempts' staged keys
must stay disjoint, B's signed/completion timestamps and audit URL
unchanged, A delivery pending until validated read-only HTTP-ack
recovery. Prove SQL queries can run while storage is blocked, tenant
isolation, and no automatic storage deletion.

Introduce read-only scoped staging-object triage to identify
potential orphan candidates for human review; never auto delete.
At least 30 days of observed age, valid tenant/agreement/attempt
path, matching authoritative lease and agreement snapshot, and
no winning PDF/audit reference or active matching attempt must
all be proven before calling it a *manual review candidate*.
Bad/missing metadata and younger files remain protected; all
results set mayDelete=false. Overwritten lease event history
is insufficient for safe automatic cleanup, so no purge API or
deletion job is authorized. No live Evia callback, production
storage, payment mutation, schema DDL or canary activation.

REQUIRED exact-head gates: build/authorization, Evia document tests,
disposable two-tenant SQL Server/browser proof; after green merge,
separate Azure revision Ready/public merge SHA/MSSQL acceptance.
Remain blocked on append-only orphan attempt history, audit-trail
access policy and actual authenticated HTTP crash-recovery proof
before any canary activation. Phase 4 remains OPEN.
```

## Phase 4 Evia fenced audit access and immutable attempt history

```text
PR #248 late-worker race and no-delete orphan triage: exact-head
build/authorization #38322894696 GREEN, Evia suite #38322894674
GREEN, disposable two-tenant SQL Server #38322894680 GREEN.
Merged SHA 866dd470d323e3240b57a72b2a4edca9aac33984.
Production workflow #38323031674 SUCCESS: Azure revision 0000251
Ready, public serving exact SHA 866dd470d323e3240b57a72b2a4edca9aac33984
and MSSQL live connection ready. Main Evia #38323031731 and
security configuration #38323031815 GREEN. Canary remains OFF.

ACTIVE independent slice: preserve durable evidence of EVERY newly
claimed archive attempt including takeover, using a reserved
evia.archive.attempt.v1 row INSERTED in the same short SQL transaction
as the existing mutable archive lease claim. Append an immutable
evia.archive.publication.v1 evidence row in the transaction publishing
the winning signed PDF + audit trail, processed provider delivery and
completed agreement. Restrict provider delivery lookup to exclude
all reserved archive internal event types. No new schema/table or
privilege; application-level append-only rows do not constitute
database-enforced WORM retention.

Audit-trail access: add fail-closed validation for staged
audit_trail.pdf objects on existing authenticated tenant storage
route, after tenant context resolution and before object download.
Require same-tenant active admin with agreements.manage and a
completed/signed agreement whose canonical local PDF and processed
Evia archive lease agree exactly with the requested staged audit URL
and attempt UUID. Ordinary signed PDF/legacy file routes remain
unchanged. Staff and rentees are denied pending explicit audit
disclosure policy review. Do not expose new public links.

Acceptance: dedicated Evia tests validate role+scope+lease-published
audit URL checks, malformed/foreign/unpublished/old attempt denial,
and guarded server route ordering. Disposable SQL acceptance proves
A's claim remains in immutable history after B takes over, only B
publishes, publication evidence and authoritative URLs agree,
provider delivery event remains separate, and canary's expected
new history cardinality is preserved.

No production canary environment changes, new SQL migration,
actual Evia callbacks, payment/tenant agreement writes, or storage
deletion. Require exact PR-head build/authorization, Evia and
disposable SQL/browser CI GREEN before merge, then release Ready,
public exact SHA and live MSSQL proof. Security follow-ups:
real signed-in download HTTP acceptance, broader historic audit
policy and tenant storage deletion privilege review. Phase 4 OPEN.
```

## Phase 4 Evia staged archive evidence retention — bounded follow-on

PR #249 merged as `232b70403d570986e5c2a06479ee77687090e54b`.
Production run #38324419524 SUCCESS, Azure revision 0000252 Ready,
public build exact merge SHA and live MSSQL connected. The audit access
and attempt/publication records are released; the default-off canary remains OFF.

ACTIVE independent retention guard: prevent the general documents storage
API from deleting a documents bucket, fenced Evia staged agreement records,
or ancestor folders that could recursively erase those records. Enforce at
both local and R2 storage drivers, not only the tenant router; retain unrelated
object behavior. No cleanup, schema change, production canary activation,
external Evia callback, or new delete authority. Add fail-closed tests to
the authorization suite. This guard is an interim safeguard, NOT a complete
retention/immutability or object-lock policy. Alternate R2 credentials and
privileged administrators remain outside this application-level protection.

Next acceptance gate: exact PR-head authorization/build, Evia and disposable
SQL/browser CI, followed by independently verified production revision,
public SHA and MSSQL. Separate pending work remains: authenticated cookie/
bearer audit download HTTP acceptance, historic audit naming/disclosure,
crash recovery, and wider deletion-authority inventory. Phase 4 OPEN.

## Phase 4 Evia authenticated audit-download HTTP acceptance

PR #250 merge `37258033ba8e80e4392be99e26dc0e8ee5f5a927` is production-accepted:
workflow #38330107457 SUCCESS, Azure revision 0000253 Ready, exact public
merge SHA and live MSSQL ready. The archive canary remains OFF.

ACTIVE bounded testability/HTTP slice: mount the production storage delivery
middleware chain through one shared Express router. The default dependencies
remain SQL-backed bearer/cookie session authentication, tenant middleware,
lease publication validation, and real storage. Test-only injection permits
isolated HTTP requests with synthetic sessions, tenants, publication snapshots
and fake object bytes, proving 401/403 before storage and successful
cookie/bearer delivery. No real identities, provider calls, database writes,
storage deletes, canary environment changes, or altered authorization policy.
The synthetic credential middleware in this acceptance test is NOT proof of
the real SQL token verifier; full end-to-end SQL-backed session HTTP tests
remain a separate prerequisite. The historic audit document naming and wider
read/delete authority inventory remain unresolved. Phase 4 OPEN.

Acceptance: exact-head authorization/build, Evia HTTP tests and disposable
SQL/browser gates, then independent Azure Ready/exact public SHA/live MSSQL
proof. Do not merge until CI is green or activate the canary.

## Phase 4 real SQL-session Evia audit HTTP acceptance — bounded follow-on

PR #251 merged at `4bec1611ae1137ddedcfdd1c35842623df260de3`.
Post-merge Azure Ready/public exact-SHA/MSSQL acceptance must be captured
separately from green verification CI before this release gate closes.

ACTIVE TEST-ONLY: extend the existing disposable Docker SQL Server two-tenant
billing/browser harness with real hashed bearer and storage-cookie sessions,
real tenant memberships, the real /storage audit middleware and SQL publication
lookup. Only the final storage-byte responder is simulated. Prove invalid and
revoked tokens deny, renters and staff cannot read, foreign tenant is denied,
absent/unprocessed/wrong-attempt publication is denied before any bytes are
served, and a properly authorized local administrator can read using both
carriers. Disposable fixture SQL writes are allowed only in the test database.
No production data, canary activation, object deletion, schema change or
broadened disclosure policy. Historic audit naming/retention still pending.

Require exact-head build and authorization, Evia, disposable SQL and browser
acceptance green before merge, then Azure revision Ready/public exact SHA/live
MSSQL. Phase 4 OPEN; canary OFF.

## Phase 4 fenced archive crash-recovery acceptance — test-only slice

PR #252 merged at `6abb2c5a21a265c47838f38e300a8f67ffadccaf`.
Production Azure readiness, public SHA and live MSSQL verification remains a
separate mandatory release gate.

ACTIVE: introduce deterministic crash-window regression tests of the dormant
fenced coordinator. Reproduce a signed-PDF upload followed by failure before
its audit-trail partner, ensure no publication, then simulate lease expiry
and successful takeover into a distinct immutable attempt namespace. Prove
the old worker cannot renew, the partial bytes are not automatically deleted,
and replay of a committed publication neither stages nor finalizes again.
This test uses mocked storage/lease boundaries; it does NOT replace the
existing disposable SQL takeover proof or establish full process-crash
recovery across real storage. SQL-backed and end-to-end storage acceptance
remain separate requirements before canary activation.

No production canary flag, live Evia request, object deletion, additional
publication authority or database schema changes. Require exact-head
authorization/build and Evia tests before merge and independent deployment
verification afterwards. Phase 4 OPEN; canary OFF.

## Phase 4 historic Evia audit-trail disclosure — bounded access slice

PR #253 merge `0236b7360f07754e1ae7969acc5e4a0ad3fa58d4`
production accepted: workflow #38347047466 green, Azure revision
0000256 Ready, exact public SHA and live MSSQL ready.

ACTIVE: Protect the legacy stable audit URL
`tenants/{tenant UUID}/agreements/{agreement UUID}/signed/audit_trail.pdf`
using the same authenticated tenant storage route. Require an active
tenant administrator with agreement-management permission, tenant-scoped
completed signed agreement and a locally retained stable signed PDF.
Keep ordinary signed-PDF delivery and fenced lease-backed audit handling
unchanged. A legacy stable audit has no fenced publication ledger; this
does not prove historical file authenticity and is an access restriction,
not a retroactive signing-evidence guarantee.

Add authorization tests and execute the existing build and Evia gates.
Remaining storage upload overwrite paths, historic filename variations,
broad storage deletion privileges and durable object lock require separate
review. Do not activate the Evia canary or delete evidence. Phase 4 OPEN.

## Phase 4 generic storage upload protection — bounded slice

PR #254 merge `f37784c107273892291910b3cbf3022ef2ede6d1`
production accepted on Azure revision 0000257, public exact SHA, live
MSSQL ready, deployment workflow #38350572904 successful.

ACTIVE: reject generic authenticated tenant storage uploads into the
tenant/UUID/agreements/UUID/signed namespace, including legacy signed PDFs,
historic audit_trail.pdf and staged immutable attempt evidence. The guard
runs after tenant path scoping and before calling either storage driver.
The internal Evia document writer is deliberately unchanged. This protects
the generic API from overwriting signing evidence, but is NOT storage
object-lock or provider-wide immutability: internal writer permissions,
alternate R2 credentials and other storage paths need distinct review.
No canary activation, object deletion, DDL, or public new endpoint.
Run exact PR-head authorization/build, Evia and appropriate SQL/browser
acceptance before merge. Phase 4 OPEN; canary OFF.


## Phase 4 compatibility closure and migration-authority census — current active slice

PR #255 merged as `3b04f611709ee4ffa9280aa7fe051d9debc21b4b`.
Its production release is pending independent Ready/exact-SHA/MSSQL verification.

ACTIVE inspection-only slice: reconcile the current compatibility inventory in
`docs/PHASE4-COMPATIBILITY-CLOSURE-MATRIX.md`, distinguishing the governed
production migration workflow, the legacy `npm run migrate` SQL-RPC script,
already-removed browser SQL migration UI, and live invoice, agreement and
auth/utility consumers. Add startup/migration authority regression checks,
with no SQL execution, runtime behavior change or production canary activation.
The original Phase 4 goal remains outstanding: safely retire remaining live
compatibility paths one bounded domain at a time. Phase 5 remains downstream.

## Phase 4 legacy invoice read ownership — active bounded slice

PR #256 merged as `d4898551c9b26f4a80b189f71db5595854589c65`.
Production run #38355539021 passed: Azure revision 0000259 Ready,
exact public SHA and live MSSQL ready.

ACTIVE: restrict legacy MSSQL invoice list and detail reads for renter
identities to their own invoice records. Apply SQL owner and draft predicates
before pagination; do not filter only the returned page. Detail lookup must
return 404 for another renter's same-tenant invoice. Preserve administrator
reads, tenant SQL scope and dedicated billing lifecycle mutations.
No invoice amount/status changes, compatibility fallback enablement, schema
changes or Evia canary activation.

Follow with disposable two-tenant SQL-backed HTTP acceptance before this
release is considered sufficient for broader invoice contract migrations.
Phase 4 remains OPEN.

## Phase 4 invoice list query parity — bounded active slice

PR #257 merged at `0a1c25c03534260f3c09bd2e88e2b526971773a4`.
Its post-merge Azure Ready/exact SHA/MSSQL acceptance is a separate release gate.

ACTIVE: carry explicit status arrays and allowed sort fields through the
existing MSSQL invoice list path. SQL applies owner/draft/tenant predicates
before pagination and always includes an immutable ID tie-breaker for stable
page boundaries. An empty status array must not widen a filtered request.
Do not widen sorting beyond an allowlist, modify invoice money/status,
change mutation authorization, or enable the Evia canary.
Require exact-head build and disposable SQL/renter acceptance and production
verification prior to treating this behavior change as accepted.
Phase 4 remains OPEN.

## Phase 4 pending-invoice dashboard read transport — bounded slice

PR #258 merged as `7840b8acee13f635b27217ee9c4b5cf9c08390ee`.
Azure Ready/exact public SHA/live MSSQL evidence is still a separate
production release gate until the post-merge workflow finishes.

ACTIVE: replace ONLY `getPropertiesWithPendingReadings`' compatibility-client
queries with explicit authenticated `/api/platform/query` read requests,
retaining the existing backend tenant, renter and staff authorization policy,
same pending_invoice/invoice_id-null filters, stable ID ordering, bounded
pagination, and grouped pending-reading counts. Explicitly reject unavailable
database/schema responses instead of presenting a false zero-count dashboard.
No new backend authority, money/status mutations, SQL DDL, or Evia canary
activation. Preserve remaining live utility-reading projections for separate
contract and browser acceptance. Phase 4 OPEN.

## Phase 4 legacy utility invoicing UI containment — bounded slice

PR #259 merged at `c151cf2f8b9e05fa7459753bfa48c1549275695f`.
Post-merge build/deployment and Evia workflows succeeded; the independent
Azure Ready/exact public SHA/live MSSQL acceptance remains a release gate.

ACTIVE: make the routed `/dashboard/utilities/invoicing` screen read-only.
Remove its mock `INV-${Date.now()}` invoice ID, selected-reading invoice
action, and direct `markAsInvoiced` call. Retain review/filter display
and show a permission-gated link to the established monthly invoice generator.
Show read failures explicitly rather than presenting an empty success state.
Preserve existing monthly invoice authority, server authorization,
tenant/tenancy isolation and transactional utility-reading linkage.
Do not migrate `fetchReadingsForInvoice` in the same slice. Do not change
billing money/status, server endpoints, schema, or the Evia canary.
Run PR-head authorization tests/build and independent production acceptance.
Phase 4 remains OPEN.

## Phase 4 utility invoice preview read migration — bounded slice

PR #260 merged as `9ffe0a3ee0942222c450082fe7dc99679e287744`.
Azure revision 0000263 was Ready; public build SHA matched this merge and live
MSSQL health was ready. The legacy mock-invoice action is contained.

ACTIVE: migrate ONLY `fetchReadingsForInvoice` to an explicit authenticated,
tenant-scoped read-only `/api/platform/query` transport. The routed review
screen continues to show pending, unlinked utility readings with optional
reading-month/year filters, property/rentee filters, stable paginated IDs,
tenant/assigned-property authorization, and clear failures for unavailable
database/schema. Display persisted calculated charges without inventing zero
amounts or re-billing readings from property rate fallbacks. The preview
is not the generator's full eligibility determination: governed monthly
billing independently applies tenancy and prior-service-period rules.
No `utility_billing` table dependency or schema change is introduced.
The existing `markAsInvoiced` legacy helper remains for separate caller
census/retirement rather than being invoked by this screen.
No invoice/reading writes, billing amount changes, permission expansions,
or Evia canary enablement. Require exact-head CI, disposable two-tenant
SQL/browser acceptance and post-merge Azure Ready/public SHA/MSSQL evidence.
Phase 4 OPEN.

## Phase 4 retire dead utility invoicing helpers — bounded slice

PR #261 merged as `5f8b433bcf610b5fe34c41b65a9a1223408259b4`.
Azure revision 0000264 Ready, exact public SHA, live MSSQL ready and
post-merge Evia green are verified.

ACTIVE: retire only `utilityBillingService.markAsInvoiced`, which no
longer has application callers after the routed mock-invoice UI was
contained, and the unused `discoverValidStatusValues` + `READING_STATUS`
fallback from the formerly compatible `fetchReadingsForInvoice` path.
Preserve the live approval/rejection paths, their constraint discovery,
the read-only invoice preview and the server-governed monthly billing
generator. Update regression tests and caller inventory. No SQL schema,
monetary amount, payment/status mutation, authority expansion or Evia
canary activation. Require PR-head authorization/build, Evia and any
required disposable SQL acceptance; verify production Ready/public
SHA/MSSQL independently after merge. Phase 4 OPEN.

## Phase 4 utility review mutation authority audit — next gate

PR #262 merged as `1945ef06020af3f1bb93c7a283a44759466efc5e`.
Deployment workflow `38489769099` completed successfully, revision
`0000265` became Ready, public build SHA matched, and live MSSQL health
was Ready. Mark the removed unused helper slice production-accepted.

ACTIVE: classify two routed utility-review mutation entry points:
`UtilityBillingReview.jsx` and `staff/UtilityReadingsReview.jsx`.
Both still have client-side compatibility updates and divergent status,
amount and failure-handling behavior; one still attempts
`utility_billing` insert. Source-backed audit:
`docs/PHASE4-UTILITY-REVIEW-AUTHORITY-AUDIT.md`.

This audit is document/test-only. The next behavior-changing slice
must introduce one governed server utility-reading review transition
with tenant/property authorization and atomic status, charge and
timestamp changes; prove two-tenant SQL/browser flows first. Never
create invoices or link readings outside monthly billing, widen
permissions, enable Evia canary or apply production DDL as a side effect.
Phase 4 remains OPEN, Phase 5 pending.

## Phase 4 governed utility review API — bounded backend-first slice

PR #263 audit merged as `e401842058d0a4cdf1ef99034c7620c5ce77dd0a`.
PR #263's post-merge production proof is a separate acceptance gate.

ACTIVE: introduce `POST /api/utility-reviews/readings/:readingId/approve`
and `.../reject` as tenant-authenticated, `UTILITIES_REVIEW`-permissioned,
assigned-property-scoped and SERIALIZABLE/MSSQL-row-locked review transitions.
Only pending unlinked readings can be reviewed; approval requires an explicit
configured property rate and stores amount/status/billing metadata atomically;
rejection requires a reason and updates review fields atomically. No
`utility_billing` writes, hard-coded pricing defaults, or invoice ID linkage.

This is backend-first: the two competing routed review UIs are NOT yet
migrated or deactivated. They remain an independent release blocker.
Require exact-head CI plus disposable two-tenant SQL transition/rollback/
concurrency and browser acceptance before wiring clients or treating this
as a completed behavior change. No production DDL or Evia canary changes.
Phase 4 OPEN.

## Phase 4 — pending utility meter correction authority

PR #264 is production accepted on merge `c3c594b1b93c8de24d77feb8b9e323e01525fa99`
(Azure Ready revision `0000267`, exact public SHA and live MSSQL Ready;
workflow `38509575288`).

Active bounded follow-on: migrate the primary review screen's pending
meter corrections away from client-side read-then-write into the
`PUT /api/utility-reviews/readings/:readingId/value` transactional API.
Require tenant and `UTILITIES_REVIEW` permission; assigned-property
scope for staff; pending, unlinked billing state; explicit original
reading values for stale-write detection; exact four-decimal meter
precision. Change only previous/current readings and updated timestamp,
never billing amount, status, or invoice linkage.

Release gates: exact-head authorization/build; disposable two-tenant SQL
permission, amount, concurrency and stale-write proof; existing browser
acceptance; Evia regression; independent production SHA/MSSQL verification
after merge. No DDL or canary changes. Phase 4 remains ACTIVE.

## Phase 4 — live invoice dashboard read integrity (bounded slice)

After PR #268, the remaining live invoice read surface was audited.
`InvoiceManagementDashboard.jsx` calls `getInvoiceSummaryByProperty`
(paginated authorized invoice reads) and `getPropertiesWithPendingReadings`
(scoped utility preview). The summary view retained stale financial figures
after read failures or cleared property selection, and its month/year date
filters used midnight on the final calendar day. A bounded client change
clears stale/in-flight values, rejects superseded results, distinguishes
unavailable from genuine zero totals, and includes the full last day
for MSSQL `createdat <= toDate` selection.

Do not change tenant authorization, invoice amounts, payment status,
the governed billing writer, Evia canary, SQL schema, or production DDL.
Gate on exact-head authorization/build tests and production Ready/serving
SHA/MSSQL evidence. Phase 4 OPEN; Phase 5 still pending.

## Phase 4 consolidated authenticated acceptance and routed business-browser follow-on — 2026-10-15

PR #281 has merged as `2a283aa24cb3bcbac53186b15065bb9e12eccf22` from verified PR-head `ad357f5bc52bbda75e26fd3d4d22ab52af97b968`. Build/authorization, disposable two-tenant SQL Server acceptance and Evia webhook tests all succeeded on the exact head. The test package adds real-session HTTP maintenance and notification ownership/tenant-denial assertions. It does **not** prove end-to-end browser workflows, production object upload, email delivery or full lifecycle correctness. Confirm independently that its post-merge Azure Ready revision serves the exact SHA and reports MSSQL healthy.

Current next Phase 4 domain: **routed renter browser acceptance**, in one disposable two-tenant SQL fixture. Exercise actual logged-in React maintenance list/detail and agreement screens for both tenants plus denied foreign request navigation. Retain existing invoice/receipt browser evidence. Do not mutate production identity, invoices, maintenance, email, Evia signature or database DDL. Broader invitation/resend, signed-document, payment verification, staff maintenance transitions and final compatibility caller census remain release blockers before Phase 5. Keep the Evia fenced canary OFF.

## Phase 4 — post-PR #283 renter receipt browser gate — 2026-10-15

PR #283 merged as `5aaf9c569ac8503c600efc75ceeb5d7bdb305516` after passing exact-head authorization/build, two-tenant disposable SQL and Evia CI. It covers governed payment proof, reject/resubmit, partial/full verification, receipt/ledger creation, replay refusal and tenant isolation through real session-backed HTTP requests. Do **not** mistake this evidence for successful email issuance, actual R2 proof upload, live bank verification, or user-interface settlement approval.

The next bounded test-only acceptance gate reuses the very same SQL/Puppeteer fixture and authenticated renter sessions to verify that both tenant portals display **their own** issued receipts after full settlement, never foreign receipts, and that opening the account panel does not mutate invoices/payments/receipts/events. Also assert a second renter within one organization cannot read or submit proof for another renter's invoice. Preserve PR #283's existing partial settlement/ledger tests, do not rerun Azure rollout on a test-only main merge, and keep Phase 4 ACTIVE until controlled full business workflows and compatibility/privileged migration signoff pass.

## Phase 4 — assigned staff maintenance HTTP acceptance (active, 2026-10-15)

Merged PR #285 (`251ff536b3b84a5c917c18791c3d6afc41fa69bb`) completed actual renter receipt browser isolation on both disposable SQL tenants. The next **test-only** package exercises the existing maintenance lifecycle with real SQL-backed bearer sessions: renter creation with active tenancy, property-scoped manager assignment, assigned-only worker start and completion, internal/public comment visibility, tenant-local image metadata, foreign tenant/property denial, replay/closed state denial, and durable lifecycle event ledger. The disposable SQL fixture adds the existing staff-property-assignment migration to test explicit property grants.

No production schema, notification delivery, object storage bytes or Evia authority changes. Tests use only synthetic tenant/actor data. The current maintenance router records lifecycle events but does not itself guarantee an in-app notification or outbound email/SMS; these require separate product acceptance. Keep Phase 4 active until actual staff/browser interactions, invitations, signing, R2 payment files, compatibility caller census and migration executor proof are resolved. PR-head authorization/build, disposable SQL and Evia checks must all be green before merge.

## Phase 4 — actual assigned-staff maintenance browser gate, 2026-10-15

PR #286 merged at `bc61165ec5d6bb5fd75ac9d56d185f0dec674d61`, with exact-head authorization/build, disposable two-tenant SQL and Evia green. Its post-merge Evia test also passed. The real-session maintenance HTTP proof covers renter create, scoped manager assignment, assigned worker state transitions, internal/public comments, image metadata and closed/replay denials. The separate current gate exercises the **actual staff React detail page**: logged-in assigned worker clicks Start Work and completes through the required notes dialog, SQL ledger records the two transitions, and a foreign organization's worker cannot view the request by URL. It reuses the same SQL/Puppeteer fixture, without duplicate containers, new workflows, runtime changes or Azure rollout. Notifications, actual storage image bytes, manager assignment selection, invitations and signed document journeys, final compatibility census and production migration executor remain outstanding; Phase 4 remains open.

## Phase 4 — governed staff assignment picker, 2026-10-15

PR #287 merged as `3adeda8b4019a7b1ea2097ab4db00ae4a0df94aa`: the assigned worker's real React Start Work/Complete flow, build, disposable two-tenant SQL and Evia tests all passed. Its post-merge Evia run #38628116983 is green. The next package updates the manager assignment picker from legacy role-name filtering to a request-, property- and tenant-scoped eligible worker endpoint using canonical membership permission bundles. The same permission predicate governs actual assignments, including denial of finance and read-only identities. The real manager assignment form must select a permitted worker and persist one assignment event on disposable SQL. This change affects production runtime and therefore requires normal exact-head CI and post-merge deployment verification.

Full Phase 4 closure still requires controlled invitation/signing, actual storage upload, lifecycle notification evidence, compatibility caller census, and operational migration authority confirmation. Phase 5 stays pending.

## Phase 4 — durable maintenance in-app notification delivery, 2026-10-15

PR #288 merged as `f3a1c30178d4a8059824e8caead57c33e79c0d6d` and the production deployment #38630468740 confirmed Ready Azure revision `0000285`, exact public serving SHA and live MSSQL connectivity.

The next package adds **in-app notification records atomically with maintenance lifecycle events** for request creation (authorized managers of that property), assignment, work started, completed and cancelled (renter/assigned worker). Active tenant membership is checked again within the transaction; foreign and unassigned-property users are not notified. The existing real-session two-tenant SQL fixture verifies recipient visibility through /api/notifications/me, self-only mark-as-read, replay denial and no cross-tenant leakage. No new SQL schema, external service, payment or Evia authority changes are introduced.

This does **not** prove a visible inbox in the React application or provider-backed email/SMS delivery. The existing notification service's legacy email/SMS placeholders are not accepted evidence of sending. UI presentation, external delivery, file bytes, invitation/signing and migration-executor operational verification remain Phase 4 blockers. Phase 5 is pending.

## Maintenance rule for this document

After each merged production change:

1. Mark the completed checkbox/exit criteria.
2. Record the PR and deployed SHA in the completed-item block.
3. Move exactly one next item into **ACTIVE** status.
4. Add newly discovered non-critical work to the parked backlog or a future phase instead of starting it immediately.
