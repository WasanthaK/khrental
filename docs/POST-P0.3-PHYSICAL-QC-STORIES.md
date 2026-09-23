# KH Rentals — Post-P0.3 Physical QC Stories

**Candidate branch:** `phase-5-release-hardening`  
**Purpose:** Physical acceptance pack for the work prepared after P0.3.  
**Important:** These stories do **not** mean the code is production-accepted. Run them only after the preceding production gate has passed and the relevant candidate has been deployed through the normal controlled release path.

## Test safety

- Use controlled test users, properties, units, agreements, invoices and files.
- Never paste passwords, password-reset links/tokens, invitation links/tokens, API secrets, Evia access/refresh tokens, or complete private documents into QC notes.
- Use a private/incognito window for logged-out password reset and invited-user acceptance tests.
- For destructive actions, use only disposable QC records.
- Record PASS/FAIL, timestamp, build SHA, visible result and a defect reference for every failed story.

---

# P0.4 — Password reset recovery

## QC-RESET-01 — Request reset while logged out

1. Open a private/incognito browser with no KH Rentals session.
2. Open the normal forgot-password flow.
3. Request a reset for a controlled existing account.
4. Check the controlled mailbox.

Expected:

- [ ] Request succeeds without requiring an authenticated tenant context.
- [ ] Reset email arrives.
- [ ] UI does not disclose password/token material.

## QC-RESET-02 — Reset link validates before password submission

1. Open the newest reset link in the private browser.

Expected:

- [ ] Valid link opens the password-change screen.
- [ ] The public reset route does not redirect into the authenticated tenant portal.
- [ ] Invalid/expired/used links fail before allowing a password submission.

## QC-RESET-03 — Complete password reset and sign in

1. Enter a new controlled password.
2. Submit the reset.
3. Sign in using the new password.
4. Confirm the previous password no longer signs in.

Expected:

- [ ] Password change succeeds once.
- [ ] New password signs in.
- [ ] Old password is rejected.
- [ ] Previously issued authenticated sessions are invalidated according to the application security model.

## QC-RESET-04 — Reset token is single-use

1. Reopen the reset link already used in QC-RESET-03.

Expected:

- [ ] Used link is rejected.
- [ ] It cannot change the password a second time.

**P0.4 result:** PASS / FAIL

---

# Phase 1 — Tenant/rentee workflow integrity

## QC-RENTEE-01 — Create and retain a renter

1. Create a new renter with a unique controlled email.
2. Assign a property and unit.
3. Save.
4. Reload the Tenants directory.
5. Open details and edit the record.

Expected:

- [ ] Renter remains visible after reload.
- [ ] Details use the canonical renter record.
- [ ] Property/unit assignment survives reload and edit.
- [ ] No browser/session-storage dependency is required to reconstruct the assignment.

## QC-RENTEE-02 — Attach an existing global identity

1. Use a controlled email that already exists globally but is not a renter in the current organization.
2. Add it as a renter in the current organization.

Expected:

- [ ] Existing identity is attached to the organization.
- [ ] No duplicate `app_users` identity is created.
- [ ] No misleading duplicate-email error is shown for the valid attach case.

## QC-RENTEE-03 — Deactivate relationship without deleting global identity

1. Deactivate a controlled renter relationship.
2. Reload the tenant directory/details.
3. If the same identity belongs to another organization, verify that other membership remains usable.

Expected:

- [ ] Current organization membership becomes inactive.
- [ ] Global person/identity is not deleted or globally deactivated.
- [ ] Inactive renter remains discoverable for reactivation.
- [ ] Invitation actions are unavailable while inactive.

## QC-RENTEE-04 — Reactivate renter

1. Reactivate the renter from QC-RENTEE-03.
2. Reload.

Expected:

- [ ] Relationship returns to active state.
- [ ] Existing property/unit assignment remains correct.
- [ ] Normal invitation/action availability returns where appropriate.

## QC-RENTEE-05 — Tenant vs Team boundary

1. Verify a renter is managed under Tenants.
2. Verify a staff/contractor is managed under Team.
3. Attempt any available role-conflict scenario using controlled records.

Expected:

- [ ] Tenant and Team workflows remain distinct.
- [ ] Same-organization role conflicts are explicit.
- [ ] Tenant workflow cannot create a platform-administrator identity.

**Phase 1 result:** PASS / FAIL

---

# Phase 2 — Agreement generation and digital signing

## QC-SIGN-01 — Generate agreement with signature anchors

1. Create a disposable controlled agreement through the normal business flow.
2. Generate the agreement document.
3. Confirm the document contains the expected landlord and tenant marker locations (`For Landlord:` / `For Tenant:`) used by the proven AutoStamp flow.

Expected:

- [ ] Agreement generates successfully.
- [ ] Expected signature anchor text is present in the document.

## QC-SIGN-02 — Send for Evia signing

1. Send the controlled agreement for signature.
2. Complete any required Evia authorization using the normal supported OAuth flow.

Expected:

- [ ] Signing request is accepted.
- [ ] Landlord and tenant signing fields are placed at the intended marker locations.
- [ ] No field is placed on an unrelated page/location.

## QC-SIGN-03 — Complete both signatures

1. Complete landlord signature.
2. Complete tenant signature.
3. Observe agreement status updates/callback handling.

Expected:

- [ ] First signature advances to the expected in-progress state.
- [ ] Second signature advances to completed/signed.
- [ ] Callback/webhook processing does not create conflicting lifecycle state.

## QC-SIGN-04 — Signed document retained

1. Open/download the final signed agreement from KH Rentals.

Expected:

- [ ] Both signatures are visible in the intended locations.
- [ ] Final signed PDF is retained in KH Rentals storage.
- [ ] Agreement record links to the retained signed document.
- [ ] Signed document remains accessible after page reload/new session to an authorized user.

**Phase 2 result:** PASS / FAIL

---

# Phase 3 / Phase 4 — Tenant-scoped document and media storage

Use only disposable test files.

## QC-STORAGE-01 — Agreement document storage

1. Generate/store an agreement document.
2. Reload and reopen it.

Expected:

- [ ] Document upload succeeds through KH Rentals storage API.
- [ ] Stored path is tenant-scoped.
- [ ] Authorized download succeeds after reload.

## QC-STORAGE-02 — Signed agreement persistence

1. Complete a signing flow or use an approved controlled signed-document test.
2. Verify signed PDF retrieval/storage.

Expected:

- [ ] Signed PDF persists through the explicit tenant storage API.
- [ ] Existing agreement lifecycle remains intact.

## QC-STORAGE-03 — Payment proof

1. Upload a controlled payment-proof image/file to a disposable invoice/payment flow.
2. Reload the payment/invoice view.

Expected:

- [ ] Upload succeeds.
- [ ] Persisted URL remains valid after reload.
- [ ] Billing approval/status behavior is unchanged by the storage transport change.

## QC-STORAGE-04 — Utility meter media

1. Submit a controlled utility reading with a photo.
2. Reload the reading.

Expected:

- [ ] Photo upload succeeds.
- [ ] Photo remains accessible to the authorized tenant context.
- [ ] Reading validation and submission behavior remain unchanged.

## QC-STORAGE-05 — Maintenance media

1. Create a disposable maintenance request with an image.
2. Reload/open the request.

Expected:

- [ ] Persisted maintenance image renders from its stored URL.
- [ ] Request lifecycle behavior remains unchanged.

## QC-STORAGE-06 — Cross-tenant read/write boundary

Using two controlled organizations and authorized test identities, attempt to access a known object path belonging to the other tenant through normal application/API behavior.

Expected:

- [ ] Cross-tenant storage path is rejected.
- [ ] No foreign object is returned, overwritten or deleted.

## QC-STORAGE-07 — Admin storage tooling

As a platform/admin user authorized for storage tooling:

1. Open the storage explorer/tooling.
2. List supported buckets/content.
3. Perform a disposable upload/delete if the UI exposes the action.

Expected:

- [ ] Tooling uses the KH Rentals storage API.
- [ ] Normal browser startup does not create/mutate buckets.
- [ ] Bucket mutation, where exposed, requires appropriate admin authorization.

**Phase 3/4 storage result:** PASS / FAIL

---

# Phase 5 — Product regression / release hardening

Run this pass on the integrated release candidate after the domain-specific stories above pass.

## QC-REL-01 — Platform Admin

- [ ] Platform Admin can sign in and open the platform workspace.
- [ ] A Platform Admin who also has tenant membership can enter the tenant workspace.
- [ ] Tenant switching does not block page actions.

## QC-REL-02 — Properties and units

- [ ] Property directory loads.
- [ ] Property details load.
- [ ] Unit directory/details used by renter onboarding load.
- [ ] Controlled property media upload/delete remains functional.

## QC-REL-03 — Billing, invoices and receipts

- [ ] Invoice list/details load.
- [ ] Controlled payment-proof flow succeeds.
- [ ] Verification/manual-payment actions remain authorization guarded.
- [ ] Receipt/reminder behavior used in production remains functional.

## QC-REL-04 — Maintenance lifecycle

- [ ] Controlled request can be created.
- [ ] Authorized lifecycle transitions still work.
- [ ] Media remains visible.

## QC-REL-05 — Notifications/email

- [ ] Controlled operational email action reports explicit success/failure.
- [ ] Invitation flow remains consistent with the separately completed P0.3 acceptance pack.
- [ ] No sensitive token/password/email-body content is found in the structured log spot-check.

## QC-REL-06 — Agreement cancellation/deletion

Use only a disposable agreement eligible for the tested operation.

- [ ] Allowed cancellation/deletion behavior succeeds.
- [ ] Disallowed/destructive behavior remains authorization guarded.
- [ ] Unrelated agreements are unaffected.

## QC-REL-07 — Authorization boundaries

With controlled accounts for at least two tenants and relevant staff/renter roles:

- [ ] Tenant A cannot read/write Tenant B renter data.
- [ ] Tenant A cannot read/write Tenant B storage objects.
- [ ] Renter cannot perform staff/admin-only operations.
- [ ] Tenant Admin cannot perform platform-admin-only operations.

## QC-REL-08 — Runtime health after regression operations

Authorized operator verifies:

- [ ] Latest Azure revision is Ready.
- [ ] `/build-info.json` matches the deployed candidate SHA.
- [ ] `/api/mssql/health` reports `connection: ready`.
- [ ] Normal startup remains `/bin/sh scripts/start-container.sh`.

**Phase 5 result:** PASS / FAIL

---

# Final acceptance table

| Gate | Result |
|---|---|
| P0.4 password reset | PASS / FAIL |
| Phase 1 renter integrity | PASS / FAIL |
| Phase 2 signing | PASS / FAIL |
| Phase 3/4 storage domains | PASS / FAIL |
| Phase 5 release regression | PASS / FAIL |

**QC Tester:**  
**Test Date:**  
**Build SHA:**  
**Defects:**  

## Completion rule

A green automated build is not a substitute for physical acceptance. If any required story fails, keep that phase open, fix the defect with a regression test, redeploy through the normal controlled path, and rerun the affected story before marking the phase complete.