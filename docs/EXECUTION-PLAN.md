# KH Rentals Execution Plan

**Status date:** 2026-09-23  
**Last verified behavior-changing application baseline:** `8ae3a2a84e65363f48f6991c8f5bb7542c1f967b`  
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
- [ ] P0.3 implementation, automated tests, CI, provider-delivery proof and production deployment verification are complete. **Only the single final physical acceptance pass in `docs/P0.3-INVITATION-ACCEPTANCE-STORIES.md` remains before P0.3 can close.**
- [ ] Password-reset flow still needs physical end-to-end acceptance, but the hardening implementation is prepared off main and regression-tested.
- [ ] Agreement signature placement/lifecycle still needs physical Evia acceptance, but the proven marker/AutoStamp implementation is prepared off main with automated placement coverage.
- [ ] Compatibility-client storage removal is prepared off main across document, payment-proof, utility, maintenance, admin tooling, and legacy Evia storage domains; production acceptance remains blocked by P0.3.

### Prepared release-hardening candidate — **NOT MERGED / NOT DEPLOYED**

- Candidate branch: `phase-5-release-hardening`.
- Integrated candidate before documentation: `55aa191468ec5f94de5e7f2217a5a22a437c2cf9`.
- Includes P0.4 password-reset hardening, Phase 1 renter integrity, Phase 2 Evia AutoStamp placement restoration, Phase 3 document storage cleanup, Phase 4 storage-domain cleanup, compatibility-storage shim retirement, and aggregate release regression coverage.
- All component draft branches passed their own authorization/build gates; the final integrated draft PR must still pass the complete exact-head CI gate.
- `docs/RELEASE-HARDENING-ACCEPTANCE-STORIES.md` is the physical acceptance pack for RH-01 through RH-16.
- This candidate does **not** change the production baseline and must not be merged/deployed before P0.3 US-INV-01 through US-INV-09 pass.

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

### P0.3 - Invitation/email observability — **ACTIVE / IMPLEMENTATION DEPLOYED, FINAL PHYSICAL ACCEPTANCE PENDING**

Scope:

- Add a clear Send/Resend Invitation action where appropriate.
- Show canonical invitation state/date.
- Add structured server-side success/failure logging for `/api/send-email`.
- Capture SendGrid `x-message-id` when available without logging email body, tokens, or secrets.
- Keep tenant and team invitation lifecycle semantics consistent through send, resend, redemption and registered state.

Implementation and verification evidence:

- [x] Normal tenant/team action is explicit **Send Invitation / Resend Invitation** and registered accounts no longer expose an invitation action.
- [x] `Save & Invite`, tenant-card send/resend and team-card send/resend use the same secure invitation authority and observable server email-delivery path.
- [x] Canonical invitation status is projected from `dbo.user_invitations` plus authenticated-account linkage as `not_invited`, `pending`, `expired`, `revoked`, or `registered`, with safe lifecycle dates and no token material.
- [x] Successful redemption is regression-locked to persist both `app_users.auth_id` and `user_invitations.accepted_at` before transaction commit; either accepted timestamp or auth linkage projects as `registered`.
- [x] Tenant cards distinguish **Tenant added** from invitation lifecycle and show created/expiry/accepted dates where applicable; Team cards use the same lifecycle semantics.
- [x] Tenant details no longer intentionally suppress the canonical status lookup; valid accessible users should not remain **Unknown** after the lookup completes.
- [x] Pending status refreshes quietly every 30 seconds and when the admin browser regains focus/visibility; canonical status requests and responses are explicitly non-cacheable.
- [x] `/api/send-email` uses structured allow-listed success/failure logs and captures SendGrid `x-message-id` when present.
- [x] Invitation delivery now uses a dedicated `/api/send-email` client with no EmailJS fallback and no recipient/subject/body console logging.
- [x] Invitation client telemetry uses an allow-list that excludes recipient email, subject, email body, invitation token/link, reset token, password and API secrets.
- [x] SendGrid rejection handling does not read or log the raw provider response body.
- [x] Automated regression coverage includes lifecycle derivation, redemption persistence, canonical action labels, focus/visibility/pending refresh, no-cache status reads, provider message ID, rejection-body suppression, log-field allow-listing, Team/Tenant parity and the dedicated observable email path.
- [x] New lifecycle regression coverage is wired into `npm run test:authorization`; final PR #106 head passed the full authorization suite and production build before merge.
- [x] PR #103 merged as behavior SHA `6ce7d95096b2868cdf27f8d5628eb1e68b963f7e`; production run `35673793484` verified provider-ready email configuration and exact runtime SHA.
- [x] Controlled production invitation email reached the test mailbox on 2026-09-22 (Junk), proving provider/mailbox delivery.
- [x] PR #105 merged as behavior SHA `1a7269d866c662125d0e35966e8bcae94fc68c23` to repair stale/Unknown lifecycle presentation.
- [x] PR #106 merged as final P0.3 behavior SHA `8ae3a2a84e65363f48f6991c8f5bb7542c1f967b` with lifecycle/privacy hardening, stronger tests and `docs/P0.3-INVITATION-ACCEPTANCE-STORIES.md`.
- [x] Production run `35725686513` passed for final behavior SHA `8ae3a2a84e65363f48f6991c8f5bb7542c1f967b`: `khrental-app--0000116` Ready; startup `/bin/sh scripts/start-container.sh`; `/api/health` email configured; `/api/mssql/health` returned ready after normal revision warmup; `/build-info.json` matched the exact SHA; browser runtime MSSQL configuration was correct.
- [ ] Run the single final physical production acceptance pass defined in `docs/P0.3-INVITATION-ACCEPTANCE-STORIES.md` and record PASS/FAIL evidence for US-INV-01 through US-INV-09.

Exit criteria:

- [x] Production evidence shows an invitation request reached the email provider/mailbox path.
- [ ] User-visible invitation status is unambiguous across the final physical Send/Resend/Accept/reload checks.
- [ ] Final production log spot-check confirms no sensitive invitation content is written to logs.

### P0.4 - Password reset regression — **IMPLEMENTATION PREPARED OFF MAIN / PHYSICAL ACCEPTANCE PENDING**

Scope:

- Reproduce password reset from request through reset link to successful password change.
- Verify the reset link does not incorrectly require an already-authenticated tenant context.
- Verify MSSQL connectivity and redirect behavior.

Prepared implementation evidence:

- [x] Reset links validate the recovery token before showing the password-entry form.
- [x] Recovery reads are non-cacheable and the anonymous reset route remains isolated from tenant/application initialization.
- [x] Regression coverage locks atomic credential update, single-use token consumption, and prior-session revocation.
- [ ] Physical RH-01 acceptance is still required before P0.4 can complete.

Exit criteria: a clean end-to-end password reset works from a logged-out browser session.

---

## Phase 1 - Tenant/rentee workflow integrity — **IMPLEMENTATION PREPARED OFF MAIN / PHYSICAL ACCEPTANCE PENDING**

**Goal:** Treat Tenants as the renter/lessee workflow and Team as the staff/contractor workflow.

Work in this order:

1. Verify create, edit, list, attach-existing-identity, invite, resend, and deactivate/reactivate behavior.
2. Verify same-organization role conflicts are explicit rather than appearing as duplicate-email errors.
3. Verify property/unit associations survive create and edit.
4. Verify tenant detail screens use canonical renter data rather than legacy fallbacks where practical.
5. Add regression tests for every production bug discovered during the smoke test.

Exit criteria:

- [ ] No renter can be saved successfully and then disappear from the current organization's Tenants directory.
- [ ] Existing global identities attach to organizations without duplicate `app_users` rows.
- [ ] Tenant Admin cannot create platform-admin identities through tenant workflows.
- [ ] Tenant and Team onboarding paths are clearly separated.

Prepared implementation evidence:

- [x] Canonical renter persistence/list/detail paths are tightened and regression-covered.
- [x] Existing global identity attachment and renter property-assignment persistence are implemented on the candidate.
- [x] Tenant-side platform-admin escalation remains blocked by authorization checks.
- [ ] RH-02 through RH-05 physical acceptance is still required.

---

## Phase 2 - Agreement generation and digital signing — **IMPLEMENTATION PREPARED OFF MAIN / PHYSICAL ACCEPTANCE PENDING**

**Goal:** Satisfy the business requirement: generate the agreement, place landlord/tenant signatures correctly, retain the signed document, and advance agreement lifecycle state.

Work in this order:

1. Reproduce the current signature-placement failure with a real generated agreement.
2. Compare current Evia implementation with the previously working marker/AutoStamp behavior (`For Landlord:` / `For Tenant:`).
3. Choose the supported placement mechanism from evidence; do not change Evia versions merely for cleanup.
4. Verify landlord signing, tenant signing, callbacks/webhooks, signed-document retrieval/storage, and agreement status transitions.
5. Add an automated regression fixture around signature marker/location handling where feasible.

Prepared implementation evidence:

- [x] V2 OAuth/token behavior is preserved while the send path delegates to the previously proven type-3 AutoStamp placement implementation.
- [x] Automated placement coverage locks the landlord/tenant marker contract.
- [x] Existing Evia CI workflows passed on the prepared signing branch.
- [ ] RH-06 through RH-08 physical agreement/signing acceptance is still required.

Exit criteria: both signatures consistently appear in the intended agreement locations and the fully signed document is retained and linked to the agreement lifecycle.

---

## Phase 3 - Document/storage domain cleanup — **IMPLEMENTATION PREPARED OFF MAIN / PHYSICAL ACCEPTANCE PENDING**

**Goal:** Continue Stage 2 compatibility-client removal without destabilizing signing.

- [x] Review `DocumentService` / agreement document storage.
- [x] Route agreement document storage through explicit KH Rentals storage APIs.
- [x] Preserve tenant-scoped R2 paths and cross-tenant protections.
- [x] Remove only the compatibility dependency for this domain.

Prepared implementation evidence:

- [x] Agreement/document storage uses the explicit tenant storage service on the candidate.
- [x] Raw storage delivery is tenant-authorized and regression-covered.
- [ ] RH-08 and RH-09 physical storage/signing acceptance is still required.

Exit criteria: agreement/document storage no longer depends on the compatibility storage shape and signing behavior remains unchanged.

---

## Phase 4 - Remaining compatibility-client removal — **IMPLEMENTATION PREPARED OFF MAIN / PHYSICAL ACCEPTANCE PENDING**

Before changing code:

- Inventory remaining `platformClient` / `platformClientCore` consumers.
- Group them by business domain.
- Prioritize domains by production importance.
- Migrate exactly one domain per PR with contract-preserving regression tests.

Do **not** perform a repo-wide rewrite.

Prepared domains on the integrated candidate:

- [x] Payment-proof storage uses explicit tenant storage.
- [x] Utility-reading/meter media uses explicit tenant storage.
- [x] Maintenance card no longer contains the dead compatibility URL fallback.
- [x] Admin storage explorer/tooling uses explicit KH storage APIs; bucket mutation routes require administrator authorization.
- [x] Legacy Evia signed-document persistence uses explicit tenant storage.
- [x] Application consumers of `platformClient.storage` are removed and the compatibility storage shim/aliases are retired on the integrated candidate.
- [x] Aggregate regression coverage prevents normal application code from reintroducing the compatibility storage path.
- [ ] RH-10 through RH-14 physical acceptance is still required.

---

## Phase 5 - Product regression and release hardening — **INTEGRATED CANDIDATE PREPARED / CI GREEN / PHYSICAL ACCEPTANCE PENDING**

After the core flows above are stable, run focused regression passes for Platform Admin, properties/units, billing/invoices/receipts, maintenance lifecycle, notifications/email, agreement cancellation/deletion, and authorization boundaries.

Prepared evidence:

- [x] The off-main integration branch assembled P0.4 through Phase 4 product code without product-code merge conflicts.
- [x] Storage-domain test additions were consolidated into one aggregate regression file.
- [x] `tests/release-hardening.test.js` is wired into `npm run test:authorization`.
- [x] `docs/RELEASE-HARDENING-ACCEPTANCE-STORIES.md` defines RH-01 through RH-16.
- [x] Behavior head `01cf8eaaef3761ce507a613940dab05c748ff450` passed the full `npm run test:authorization` suite, production build, Evia V2 integration tests, and Evia webhook tests on 2026-09-23; PR deployment was correctly skipped while draft.
- [ ] RH-01 through RH-15 must pass before production acceptance.
- [ ] RH-16 must pass after any authorized production deployment.

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

## Most recently completed item

```text
Active item: P0.2 - Production core smoke test
Problem/evidence: Recent renter/membership and deployment repairs required one controlled end-to-end production validation before further changes.
Scope: Execute all 12 P0.2 checks in order and stop/fix on any failed business behavior.
PRs involved during P0.2: #100 platform-owner access; #101 dual-role tenant workspace; #102 tenant-switch toast overlay.
CI/deploy result: Latest behavior-changing production run 35616577333 succeeded for PR #102.
Production proof SHA: 190e0d412d702aed6b11f2546872c167d5808ea8.
Runtime proof: revision khrental-app--0000111 Ready; startup command /bin/sh scripts/start-container.sh; public /build-info.json matched 190e0d412d702aed6b11f2546872c167d5808ea8; /api/mssql/health returned ready; browser checks 1-10 were confirmed by the Tenant Admin.
Result: COMPLETE — all 12 production smoke-test checks passed by 2026-09-22.
Next item: P0.3 - Invitation/email observability.
```

## Current active item

```text
Active item: P0.3 - Invitation/email observability
Problem/evidence: Provider observability was added, then controlled production acceptance exposed two lifecycle defects: a tenant could remain visually Pending after acceptance and the details page could show Unknown because status refresh/checking was inconsistent. Final hardening also removed legacy invitation email/logging fallbacks that could undermine observability/privacy.
Scope: Make Send/Resend/Registered semantics canonical across Tenant and Team surfaces; refresh Pending state after external acceptance; keep details and cards on one authoritative status; preserve provider-level SendGrid evidence; prevent sensitive invitation content from client/server logs; regression-lock redemption persistence; run one final physical acceptance pack before closure.
Out of scope: schema changes; password reset regression; Evia/signing; DocumentService cleanup; general compatibility-client refactoring.
PRs: #103 provider observability (`6ce7d95096b2868cdf27f8d5628eb1e68b963f7e`); #105 lifecycle refresh (`1a7269d866c662125d0e35966e8bcae94fc68c23`); #106 final lifecycle/privacy hardening (`8ae3a2a84e65363f48f6991c8f5bb7542c1f967b`).
CI result: Final #106 head passed the complete `npm run test:authorization` gate, including the new invitation lifecycle suite, and production build. Main deployment run `35725686513` repeated authorization tests/build successfully before deployment.
Production revision/SHA: `khrental-app--0000116` Ready; behavior SHA `8ae3a2a84e65363f48f6991c8f5bb7542c1f967b`.
Runtime proof: deterministic `/bin/sh scripts/start-container.sh`; `/api/health` reported email configured; `/api/mssql/health` returned `{"ok":true,"provider":"mssql","connection":"ready"}` after revision warmup; public `/build-info.json` returned `{"buildSha":"8ae3a2a84e65363f48f6991c8f5bb7542c1f967b"}`; runtime browser MSSQL configuration verified.
Result: ACTIVE — implementation, automated tests, CI, deployment verification and provider/mailbox delivery proof are complete. Only the final physical US-INV-01 through US-INV-09 acceptance pass remains.
Next item: Execute `docs/P0.3-INVITATION-ACCEPTANCE-STORIES.md`; if all stories pass, mark P0.3 COMPLETE and only then move P0.4 to ACTIVE.
```

---

## Maintenance rule for this document

After each merged production change:

1. Mark the completed checkbox/exit criteria.
2. Record the PR and deployed SHA in the completed-item block.
3. Move exactly one next item into **ACTIVE** status.
4. Add newly discovered non-critical work to the parked backlog or a future phase instead of starting it immediately.
