# KH Rentals Execution Plan

**Status date:** 2026-09-21  
**Current production baseline:** `f8b8001198f4cb536bb1273fedb212a8d1b4d35b`  
**Purpose:** This file is the single source of truth for what we work on next. It should be updated after every completed production change.

## Operating rules

1. **One active work item at a time.** We do not start the next item until the current item has passed its exit criteria.
2. **A new bug interrupts the plan only if it is production-critical:** outage, security exposure, data loss/corruption, or a core business flow completely blocked.
3. **Every fix follows the same sequence:** reproduce -> identify evidence/root cause -> narrow change -> automated checks -> PR -> production deploy -> runtime proof -> update this file.
4. **No production schema DDL in web-container startup.** The web runtime identity remains restricted. Schema changes use the isolated migration path only.
5. **No broad compatibility-layer rewrite.** `platformClient` removal continues one business domain at a time.
6. **A green deployment is not enough.** Production is considered deployed only when the latest Azure revision is Ready, the public FQDN serves the exact Git SHA, and MSSQL health is Ready.
7. **Do not mix cleanup with a business-flow repair.** First make the business flow correct and observable; cleanup follows in a separate PR.

---

## Current verified baseline

### Production/deployment

- [x] New revisions can no longer report success while Azure continues serving an old Ready revision. Production verifies the exact build SHA. (#81)
- [x] Runtime DDL was removed from web-container startup. (#82)
- [x] Production database migration planning is isolated from web startup. (#84-#91)
- [x] Azure stale startup-command recovery was completed with explicit `scripts/start-container.sh`. (#92-#95)
- [x] Recovery revision became Ready and public MSSQL health passed.
- [x] The normal production deployment for the current baseline also completed successfully.

### Tenant/rentee data model

- [x] One global `app_users` identity per email remains the canonical identity model.
- [x] Organization access is represented through `tenant_memberships` rather than duplicate identities. (#73-#75)
- [x] Tenant directory uses the canonical MSSQL renter path. (#72-#75)
- [x] Tenant create response contract is normalized so a successful create returns the renter identity expected by the UI. (#80)
- [x] Legacy membership diagnostic currently reports `remaining_missing_count: 0`.
- [x] Tenant onboarding, invitations, and shared storage have started moving off the compatibility client. (#77-#79)
- [x] Invitation-card feedback/simulation behavior was corrected. (#83)

### Known unresolved or insufficiently verified areas

- [ ] Normal deployment workflow should explicitly own the container startup command instead of depending on Azure retaining the recovery override.
- [ ] Temporary recovery/backfill workflow should be retired after the permanent deployment path owns startup behavior.
- [ ] Core tenant/rentee flows need one controlled production smoke-test pass after the recent data/deployment changes.
- [ ] Invitation delivery needs better server-side observability (accepted/send failure/message ID where available).
- [ ] Password-reset flow needs a fresh end-to-end regression check.
- [ ] Agreement signature placement/lifecycle still needs focused review against the business requirement; the previous string-marker/AutoStamp behavior must be compared with the current Evia path.
- [ ] Remaining compatibility-client usage has not yet been migrated domain-by-domain.

---

# Execution sequence

## Phase 0 - Production stabilization

**Goal:** Make production deployment, database state, and observability predictable before doing more product refactoring.

### P0.1 - Make startup ownership permanent **(ACTIVE / NEXT)**

Scope:

- Update the normal production deployment workflow so it explicitly deploys the supported web startup command (`/bin/sh scripts/start-container.sh`) or otherwise deterministically uses the image command.
- Ensure a stale Azure command/args override cannot silently survive a future deployment.
- Re-deploy once through the normal workflow.
- Verify latest revision Ready, exact public build SHA, and MSSQL Ready.
- Remove the temporary recovery/backfill workflow once it is no longer required.

Exit criteria:

- [ ] Normal deployment succeeds without the recovery workflow.
- [ ] Azure command/args state is known and deterministic.
- [ ] Public FQDN serves the exact deployed SHA.
- [ ] `/api/mssql/health` reports Ready.
- [ ] Recovery workflow is removed or disabled.

### P0.2 - Production core smoke test

Run a controlled checklist on the deployed system:

- [ ] Tenant admin login.
- [ ] Tenant directory loads expected records.
- [ ] Create a brand-new tenant identity.
- [ ] Create/attach a tenant whose global identity already exists.
- [ ] Plain **Save** persists without sending an invitation.
- [ ] **Save & Invite** persists and sends/attempts an invitation.
- [ ] Team directory still loads after membership changes.
- [ ] Property directory used by tenant onboarding still loads.
- [ ] Public build fingerprint and MSSQL health remain correct.

Exit criteria: all tests pass or any failure becomes the single active work item before continuing.

### P0.3 - Invitation/email observability

Scope:

- Add a clear **Send/Resend Invitation** action where appropriate instead of making invitation delivery depend only on the form submit choice.
- Show invitation state/date from the canonical server record.
- Add structured server-side success/failure logging for `/api/send-email`.
- Capture SendGrid `x-message-id` when available without logging email body, tokens, or secrets.

Exit criteria:

- [ ] We can tell from production evidence whether an invitation request reached the email provider.
- [ ] User-visible invitation status is unambiguous.
- [ ] No sensitive invitation content is written to logs.

### P0.4 - Password reset regression

Scope:

- Reproduce the prior reset flow from request through reset link to successful password change.
- Verify the reset link does not incorrectly require an already-authenticated tenant context.
- Verify MSSQL connectivity and redirect behavior.

Exit criteria: a clean end-to-end password reset works from a logged-out browser session.

---

## Phase 1 - Tenant/rentee workflow integrity

**Goal:** Treat the Tenants screen as the single renter/lessee workflow and Team as the staff/contractor workflow.

Work in this order:

1. Verify create, edit, list, attach-existing-identity, invite, resend, and deactivate/reactivate behavior.
2. Verify same-organization role conflicts are explicit rather than appearing as duplicate-email errors.
3. Verify property/unit associations are preserved through create and edit.
4. Verify tenant detail screens use canonical renter data rather than legacy fallbacks where practical.
5. Add regression tests for every production bug discovered during the smoke test.

Exit criteria:

- [ ] No renter can be saved successfully and then disappear from the current organization's Tenants directory.
- [ ] Existing global identities attach to organizations without duplicate `app_users` rows.
- [ ] Tenant Admin cannot create platform-admin identities through tenant workflows.
- [ ] Tenant and Team onboarding paths are clearly separated.

---

## Phase 2 - Agreement generation and digital signing

**Goal:** Restore the business requirement first: generate the agreement, place landlord/tenant signatures correctly, retain the signed document, and advance agreement lifecycle state.

Work in this order:

1. Reproduce the current signature-placement failure with a real generated agreement.
2. Compare the current Evia implementation with the previously working marker/AutoStamp behavior (`For Landlord:` / `For Tenant:`).
3. Decide the supported placement mechanism from evidence; do not change Evia versions merely for cleanup.
4. Verify landlord signing, tenant signing, callbacks/webhooks, signed-document retrieval/storage, and agreement status transitions.
5. Add an automated regression fixture around signature marker/location handling where feasible.

Exit criteria: both signatures consistently appear in the intended agreement locations and the fully signed document is retained and linked to the agreement lifecycle.

---

## Phase 3 - Document/storage domain cleanup

**Goal:** Continue Stage 2 compatibility-client removal without destabilizing signing.

Next intended slice:

- [ ] Review `DocumentService` / agreement document storage.
- [ ] Route agreement document storage through explicit KH Rentals storage APIs.
- [ ] Preserve tenant-scoped R2 paths and cross-tenant protections.
- [ ] Remove only the compatibility dependency for this domain.

Exit criteria: agreement/document storage no longer depends on the compatibility storage shape and signing behavior remains unchanged.

---

## Phase 4 - Remaining compatibility-client removal

**Goal:** Remove the remaining compatibility adapter only after core business flows are stable.

Before changing code:

- Inventory remaining `platformClient` / `platformClientCore` consumers.
- Group them by business domain.
- Prioritize domains by production importance.
- Migrate exactly one domain per PR with contract-preserving regression tests.

Do **not** perform a repo-wide rewrite.

---

## Phase 5 - Product regression and release hardening

After the core flows above are stable, run focused regression passes for:

- Platform Admin organization/tenant-admin management.
- Properties and units.
- Billing/invoices/receipts.
- Maintenance lifecycle and task linkage.
- Notifications/email.
- Agreement cancellation/deletion.
- Authorization boundaries between Platform Admin, Tenant Admin, staff, and renter portals.

Only then move into discretionary refactoring, UI cleanup, or performance work.

---

# Parked backlog - do not interrupt the active phase

The following are intentionally parked unless they become production-critical:

- General UI/terminology cleanup.
- Large-scale refactoring.
- Repo-wide compatibility-client removal.
- Performance optimization without a measured production problem.
- New feature work unrelated to the active phase.
- Optional architecture improvements that do not fix a verified business problem.

---

# Change-control template

Every future work item should add/update an entry here before moving to the next item:

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

## Current active item

```text
Active item: P0.1 - Make startup ownership permanent
Problem/evidence: Production previously inherited a stale Azure command override and required a recovery workflow.
Scope: Make the normal deployment path deterministically own the web startup command, verify one normal production deploy, then retire the temporary recovery workflow.
Out of scope: Tenant UX changes, Evia signing, compatibility-client cleanup, schema feature work.
PR: Not started yet.
CI result: Pending.
Production revision/SHA: Current verified baseline f8b8001198f4cb536bb1273fedb212a8d1b4d35b.
Runtime proof: Current normal production deploy is green; public revision and MSSQL were verified during recovery/deployment.
Result: Pending.
Next item: P0.2 - Production core smoke test.
```

---

## Maintenance rule for this document

After each merged production change:

1. Mark the completed checkbox/exit criteria.
2. Record the PR and deployed SHA in the active-item block.
3. Move exactly one next item into **ACTIVE** status.
4. Add newly discovered non-critical work to the parked backlog or its future phase instead of starting it immediately.
