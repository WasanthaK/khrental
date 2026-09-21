# KH Rentals Execution Plan

**Status date:** 2026-09-21  
**Last verified behavior-changing application baseline:** `0f4ad15563df30c76f431d03b16c6985245d24ed`  
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
- [x] A Platform Administrator who also has tenant membership is no longer forced out of the tenant workspace. PR #101, SHA `0f4ad15563df30c76f431d03b16c6985245d24ed`, production run `35602332768`; authorization tests/build passed, revision `khrental-app--0000105` became Ready, startup remained deterministic, exact public SHA matched, and MSSQL health was Ready. Browser confirmation of the dual-role UX is still required before resuming item 5.

### Tenant/rentee data model

- [x] One global `app_users` identity per email remains the canonical identity model.
- [x] Organization access is represented through `tenant_memberships` rather than duplicate identities. (#73-#75)
- [x] Tenant directory uses the canonical MSSQL renter path. (#72-#75)
- [x] Tenant create response contract returns the renter identity expected by the UI. (#80)
- [x] Tenant onboarding, invitations, and shared storage have started moving off the compatibility client. (#77-#79)
- [x] Invitation-card feedback and simulation behavior were corrected. (#83)

### Known unresolved or insufficiently verified areas

- [ ] Core tenant/rentee flows need one controlled production smoke-test pass after the recent data/deployment changes. **This is the active item (P0.2).**
- [ ] Invitation delivery needs stronger server-side observability: provider acceptance/failure and SendGrid message ID where available.
- [ ] Password-reset flow needs a fresh end-to-end regression check.
- [ ] Agreement signature placement/lifecycle needs focused review against the business requirement; the previously working marker/AutoStamp behavior must be compared with the current Evia path.
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

### P0.2 - Production core smoke test — **ACTIVE / NEXT**

**Goal:** Verify the current production system as a business workflow before making more changes.

Run the checklist in this order and stop on the first failure. That failure becomes the only active repair item.

1. [x] Tenant Admin can log in to the production tenant workspace. — Passed 2026-09-21 in a logged-out production browser session using the normal Tenant Admin account.
2. [x] Tenants directory loads the expected current-organization renters. — Passed 2026-09-21; production browser showed the current renter cards and the Tenant Admin confirmed the directory contents were correct.
3. [x] Create a brand-new tenant identity with an intentionally unique test email. — Passed 2026-09-21; the Tenant Admin confirmed the production create operation completed successfully.
4. [x] Verify the new tenant immediately appears in the Tenants directory and remains visible after reload. — Passed 2026-09-21; the Tenant Admin confirmed the new tenant remained visible after reload.
5. [ ] Verify create-or-attach behavior for a global identity that already exists but is not yet a renter in the current organization.
6. [ ] Plain **Save Tenant** persists the tenant without attempting an invitation.
7. [ ] **Save & Invite** persists the tenant and attempts the secure invitation flow.
8. [ ] Tenant card **Send real email / Send Real Invitation** produces explicit success or visible error feedback.
9. [ ] Team directory still loads correctly after the membership/data corrections.
10. [ ] Property and property-unit directories used by tenant onboarding still load.
11. [ ] Public `/build-info.json` matches the current live deployed SHA at the time of the smoke test.
12. [ ] `/api/mssql/health` still reports Ready after the smoke-test operations.

Rules for P0.2:

- Do not change schema during the smoke test.
- Do not start Evia/signing work.
- Do not resume compatibility-client cleanup.
- Do not broaden a failure into a general refactor.
- For every failure, capture the exact UI message, endpoint, HTTP status/response, and relevant server evidence before editing code.
- If code is required, use one focused PR for the failed business behavior, deploy it, repeat the failed test, then continue the checklist.

Exit criteria: every P0.2 checkbox passes. Any failed item must be fixed and reverified before proceeding to P0.3.

### P0.3 - Invitation/email observability

Scope:

- Add a clear Send/Resend Invitation action where appropriate.
- Show canonical invitation state/date.
- Add structured server-side success/failure logging for `/api/send-email`.
- Capture SendGrid `x-message-id` when available without logging email body, tokens, or secrets.

Exit criteria:

- [ ] Production evidence shows whether an invitation request reached the email provider.
- [ ] User-visible invitation status is unambiguous.
- [ ] No sensitive invitation content is written to logs.

### P0.4 - Password reset regression

Scope:

- Reproduce password reset from request through reset link to successful password change.
- Verify the reset link does not incorrectly require an already-authenticated tenant context.
- Verify MSSQL connectivity and redirect behavior.

Exit criteria: a clean end-to-end password reset works from a logged-out browser session.

---

## Phase 1 - Tenant/rentee workflow integrity

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

---

## Phase 2 - Agreement generation and digital signing

**Goal:** Satisfy the business requirement: generate the agreement, place landlord/tenant signatures correctly, retain the signed document, and advance agreement lifecycle state.

Work in this order:

1. Reproduce the current signature-placement failure with a real generated agreement.
2. Compare current Evia implementation with the previously working marker/AutoStamp behavior (`For Landlord:` / `For Tenant:`).
3. Choose the supported placement mechanism from evidence; do not change Evia versions merely for cleanup.
4. Verify landlord signing, tenant signing, callbacks/webhooks, signed-document retrieval/storage, and agreement status transitions.
5. Add an automated regression fixture around signature marker/location handling where feasible.

Exit criteria: both signatures consistently appear in the intended agreement locations and the fully signed document is retained and linked to the agreement lifecycle.

---

## Phase 3 - Document/storage domain cleanup

**Goal:** Continue Stage 2 compatibility-client removal without destabilizing signing.

- [ ] Review `DocumentService` / agreement document storage.
- [ ] Route agreement document storage through explicit KH Rentals storage APIs.
- [ ] Preserve tenant-scoped R2 paths and cross-tenant protections.
- [ ] Remove only the compatibility dependency for this domain.

Exit criteria: agreement/document storage no longer depends on the compatibility storage shape and signing behavior remains unchanged.

---

## Phase 4 - Remaining compatibility-client removal

Before changing code:

- Inventory remaining `platformClient` / `platformClientCore` consumers.
- Group them by business domain.
- Prioritize domains by production importance.
- Migrate exactly one domain per PR with contract-preserving regression tests.

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

## Most recently completed item

```text
Active item: P0.1 - Make startup ownership permanent
Problem/evidence: Production had inherited a stale Azure command override and required a temporary recovery workflow.
Scope: Make normal deployment own the web startup command, verify production, then retire recovery workflow.
PR: #97 and #98.
CI/deploy result: Production runs 35563887278 and 35564526487 succeeded.
Production proof SHA: b6af12bdd0ecefe870e8297c984a985cffa98dd7.
Runtime proof: startup command verified as /bin/sh scripts/start-container.sh; latest revision Ready; exact public SHA verified; MSSQL Ready; expected runtime config verified.
Result: COMPLETE.
Next item: P0.2 - Production core smoke test.
```

## Current active item

```text
Active item: P0.2 - Production core smoke test
Problem/evidence: Recent renter/membership and deployment repairs are individually verified, but the complete tenant-admin business workflow has not yet had one controlled production smoke-test pass on the stabilized baseline. During controlled setup for item 5, the designated platform owner was first found to be locked out of Platform Admin, then after that repair the same global identity was forced out of its tenant workspace because DashboardLayout treated Platform Admin status as mutually exclusive with tenant membership.
Scope: Execute the P0.2 checklist in order, stop on first failure, collect evidence, make only a narrow repair if required, deploy/reverify, then continue. Platform-owner access and dual-role tenant-workspace navigation were narrowly repaired without schema mutation so item 5 setup can proceed.
Out of scope: schema evolution, Evia signing, DocumentService cleanup, general compatibility refactoring, new features.
PR: #100 restored the repository-designated bootstrap platform owner fallback for wweerakoone@gmail.com. #101 preserves tenant workspace access for a Platform Administrator who also has an active tenant membership; platform-only users remain platform-only.
CI result: PR #100 authorization tests/build passed and production deployment run 35595451678 succeeded. PR #101 authorization tests/build passed; production deployment run 35602332768 succeeded.
Production baseline: P0.1 was proven on b6af12bdd0ecefe870e8297c984a985cffa98dd7. Current behavior-changing production SHA is 0f4ad15563df30c76f431d03b16c6985245d24ed after PR #101.
Runtime proof: production revision khrental-app--0000105 became Ready; startup command remained /bin/sh scripts/start-container.sh; public /build-info.json matched 0f4ad15563df30c76f431d03b16c6985245d24ed; /api/mssql/health returned ready; runtime MSSQL/Evia configuration verification passed. The health endpoint briefly returned 503 while the new revision warmed, then passed within the deployment retry window. Earlier one-shot DML repair attempts never reached Node/SQL because Azure Container Apps exec failed at the WebSocket handshake, so those attempts made no database change.
Smoke-test progress: item 1 Tenant Admin production login passed on 2026-09-21 from a logged-out browser session using the normal Tenant Admin account. Item 2 Tenants directory passed on 2026-09-21; the production renter directory loaded and the Tenant Admin confirmed the visible current-organization renters were correct. Item 3 brand-new tenant creation passed on 2026-09-21; the Tenant Admin confirmed the production create completed successfully. Item 4 tenant visibility/persistence passed on 2026-09-21; the new tenant remained visible after reload.
Result: IN PROGRESS — browser verification of dual-role access is required before resuming item 5.
Next item: Verify wweerakoone@gmail.com can enter the KH Rentals tenant workspace and still return to Platform Admin. If that passes, resume P0.2 item 5 - create-or-attach an existing global identity not yet a renter in the current organization.
```

---

## Maintenance rule for this document

After each merged production change:

1. Mark the completed checkbox/exit criteria.
2. Record the PR and deployed SHA in the completed-item block.
3. Move exactly one next item into **ACTIVE** status.
4. Add newly discovered non-critical work to the parked backlog or a future phase instead of starting it immediately.
