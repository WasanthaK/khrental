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
- [ ] Continue remaining non-storage compatibility paths one bounded PR at a time, preserving authority and behavior.

Completed bounded domains include billing/payment proof storage, utilities/meter evidence, maintenance media, Evia diagnostic uploads, application storage initialization, bucket tooling, shared storage façade, PropertyContext/PropertyList/PropertyDetails reads, AgreementList/detail reads, and multiple dead agreement/invoice compatibility helpers.

Current active domain: **closure-readiness review and live compatibility contract inventory**.

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

## Maintenance rule for this document

After each merged production change:

1. Mark the completed checkbox/exit criteria.
2. Record the PR and deployed SHA in the completed-item block.
3. Move exactly one next item into **ACTIVE** status.
4. Add newly discovered non-critical work to the parked backlog or a future phase instead of starting it immediately.
