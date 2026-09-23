# KH Rentals — Release Hardening Physical QC

**Candidate branch:** `phase-5-release-hardening`  
**Purpose:** final human production/acceptance checks for the prepared P0.4 through Phase 5 hardening candidate.  
**Important:** this document does **not** mean the candidate is deployed or accepted. P0.3 final invitation acceptance remains the gate before this candidate can be merged/deployed.

## How to record each story

For every story record:

- PASS / FAIL
- date/time
- test account/record identifier (non-sensitive only)
- observed result
- screenshot or provider/reference ID where useful
- defect/PR link if failed

If a story fails, stop that domain, investigate the production data/code path, add a regression test, fix, redeploy the candidate, and rerun the failed story plus any dependent stories.

---

## QC-RH-01 — Logged-out password reset

**Business goal:** a user who cannot sign in can recover the account without already having a tenant/application session.

Steps:

1. Start from a fully logged-out/private browser.
2. Request a password reset for a controlled account.
3. Open the reset email link in that logged-out browser.
4. Confirm the reset page validates the token and shows the new-password form.
5. Set a new test password.
6. Sign in with the new password.

Expected:

- reset link does not redirect to the tenant portal before password change
- valid token is accepted
- password change succeeds once
- new password signs in successfully
- old password no longer signs in
- no reset token/password appears in UI logs or server logs

---

## QC-RH-02 — Reset token single-use and invalid-token behavior

Steps:

1. Reopen the already-used reset link from QC-RH-01.
2. Open a deliberately invalid reset token URL.
3. If a controlled expired token is available, open it too.

Expected:

- used token cannot reset the password again
- invalid/expired token gets a clear unavailable/invalid message
- the page does not expose the password form for an unusable token
- no tenant context is required merely to show the invalid-token result

---

## QC-RH-03 — Renter create/list/reload integrity

**Business goal:** a renter saved successfully must remain visible in the current organization.

Steps:

1. As Tenant Admin, create a controlled renter with a unique email.
2. Add at least one property/unit relationship if available.
3. Save.
4. Return to the Tenants list.
5. Hard reload.
6. Open the renter details page.

Expected:

- renter appears immediately and after reload
- no duplicate global identity is created
- details match the saved canonical renter record
- property/unit relationship is visible after reload

---

## QC-RH-04 — Existing identity attach and role boundary

Steps:

1. Use a controlled global identity that already exists but is not yet a renter in the current organization.
2. Add it through the tenant/renter workflow.
3. Reload Tenants and Team.
4. Attempt any same-organization role combination that the UI/business rules should reject.

Expected:

- existing global identity is attached through organization membership rather than duplicated
- valid renter attachment succeeds without a duplicate-email error
- invalid same-organization role conflict is explicit
- tenant workflow cannot create a platform administrator
- Team and Tenants remain distinct business workflows

---

## QC-RH-05 — Renter edit, deactivate, reactivate

Steps:

1. Edit the controlled renter from QC-RH-03.
2. Change a non-sensitive profile field and property/unit association.
3. Save and reload.
4. Deactivate the renter.
5. Verify list/details behavior.
6. Reactivate the renter and reload again.

Expected:

- edits persist from the server, not browser/session storage
- structured property/unit relationships survive edit/reload
- inactive state is canonical and survives reload
- reactivation restores the expected current-tenant visibility

---

## QC-RH-06 — Agreement generation and proven signature placement

**Business goal:** landlord and tenant signatures must be requested in the intended agreement locations.

Steps:

1. Create/use a controlled tenancy eligible for agreement generation.
2. Generate the agreement PDF.
3. Inspect the generated agreement around the landlord/tenant signature labels.
4. Send it through Evia Sign using the normal production flow.
5. Inspect the Evia signing request/preview before completing signatures.

Expected:

- agreement generates successfully
- landlord and tenant marker text is present as expected
- signing request uses the proven AutoStamp/marker placement behavior
- landlord and tenant signature controls appear at the intended labels, not generic page coordinates
- OAuth/authentication still uses the current Evia flow

---

## QC-RH-07 — Signature lifecycle and signed-document persistence

Steps:

1. Complete the controlled Evia signing request from QC-RH-06.
2. Return to KH Rentals.
3. Refresh/signature-status check as normally used by the product.
4. Open/download the completed signed agreement.
5. Reload the agreement page and repeat the download/open action.

Expected:

- signature status advances to completed/signed
- signed PDF is persisted in KH Rentals storage
- stored URL remains usable after reload
- agreement lifecycle is updated without creating a second agreement
- signed document is the completed document returned by Evia

---

## QC-RH-08 — Generated document storage

Steps:

1. Generate a controlled agreement/document through the normal UI.
2. Open/download it from the application.
3. Reload and repeat.
4. Verify the document is visible only from the current tenant context.

Expected:

- document upload succeeds through the explicit KH Rentals storage API
- document URL/download works after reload
- path is tenant-scoped
- no direct compatibility-storage path is required in the browser

---

## QC-RH-09 — Payment proof storage without billing regression

Steps:

1. Open a controlled unpaid invoice as the appropriate user.
2. Upload a small payment-proof image/PDF.
3. Submit the payment proof.
4. Reload the invoice/account view.
5. Complete the existing verification step if the test workflow permits.

Expected:

- proof file uploads successfully
- billing record stores the returned tenant-scoped file URL
- payment lifecycle/status behavior is unchanged
- proof remains accessible after reload
- proof from another tenant cannot be read by path substitution

---

## QC-RH-10 — Utility meter/reading media

Steps:

1. Create or edit a controlled utility meter/reading.
2. Attach a photo through each active utility-reading UI used in production.
3. Save.
4. Reload and open the saved photo.

Expected:

- upload succeeds through the explicit storage API
- reading data persists unchanged
- photo URL remains valid after reload
- tenant scoping is preserved

---

## QC-RH-11 — Maintenance media

Steps:

1. Open/create a controlled maintenance request with an image.
2. Verify the image appears on the request card/details.
3. Reload the page.
4. If the normal workflow permits, add another image through the existing maintenance upload path.

Expected:

- persisted `image_url` is used directly
- images continue to render after reload
- no second/fallback compatibility-storage URL path is required
- maintenance status/business workflow is unchanged

---

## QC-RH-12 — Admin storage explorer/readiness

Steps:

1. Sign in as a Tenant Admin/administrator authorized for the storage tooling.
2. Open the storage/bucket explorer/admin storage diagnostic.
3. List logical buckets and inspect a tenant-scoped folder.
4. Upload and delete a harmless controlled test file through the explorer.

Expected:

- startup/readiness does not create buckets automatically
- explorer lists the real KH Rentals storage API state
- controlled upload/list/delete succeeds for an authorized administrator
- obsolete Supabase-style policy diagnostics are absent

---

## QC-RH-13 — Storage mutation authorization and cross-tenant denial

Steps:

1. With an authorized admin account, confirm controlled bucket mutation is available only where intentionally exposed.
2. With a normal non-admin account, attempt the same bucket create/delete action through the UI/API if safely testable.
3. With two controlled tenants, attempt to substitute a known tenant-scoped object path from Tenant A while authenticated in Tenant B.

Expected:

- bucket create/delete is admin-only
- non-admin mutation is denied
- cross-tenant object path is denied
- normal same-tenant file access still works

---

## QC-RH-14 — Application startup has no browser-side storage mutation

Steps:

1. Start from a fresh browser session.
2. Sign in normally to a tenant workspace.
3. Navigate across Dashboard, Tenants, Team, Properties, Agreements, Billing, Utilities and Maintenance.
4. Observe that no bucket-setup prompt/error/mutation occurs during normal startup/navigation.

Expected:

- application initialization is read-only with respect to bucket provisioning
- normal pages load without requiring browser-side bucket creation
- no storage-policy setup workflow blocks the application

---

## QC-RH-15 — Candidate core smoke and deployment proof

Run only after the candidate is intentionally deployed for acceptance.

Steps:

1. Verify public `/build-info.json` equals the exact candidate SHA under test.
2. Verify `/api/mssql/health` reports `connection: ready`.
3. Confirm the latest Azure revision is Ready and uses `/bin/sh scripts/start-container.sh`.
4. Smoke-test Tenant list, Team list, Properties/Units, Agreements, Billing, Utilities and Maintenance.
5. Reconfirm P0.3 invitation Registered state on an already accepted controlled account.

Expected:

- exact build fingerprint matches
- MSSQL is ready
- current revision is Ready with deterministic startup
- core directories/pages load
- previously accepted invitation remains Registered
- no regression requiring the retired compatibility-storage shim

---

# Automated-only release gate

The following are intentionally automated rather than manually reproduced:

- no application source may call `platformClient.storage` / `corePlatformClient.storage`
- retired storage aliases are not exported by `platformClientCore`/`platformClient`
- explicit storage API retains tenant scoping and request-context headers
- storage bucket mutation endpoints require authenticated administrator authorization
- renter UI does not persist relationship state in `sessionStorage`
- password-reset hardening remains present
- proven Evia signing-placement path remains present
- full `npm run test:authorization` suite passes
- production `npm run build` passes

# Final acceptance gate

Before this release-hardening candidate may be treated as accepted:

1. P0.3 `US-INV-01` through `US-INV-09` must be complete.
2. The candidate must be merged/deployed intentionally only after that gate.
3. QC-RH-01 through QC-RH-15 must then pass on the exact deployed candidate SHA (stories not applicable to the production configuration must be explicitly marked N/A with reason, not silently skipped).
4. Production runtime proof must include Ready revision, exact public SHA, deterministic startup, and MSSQL Ready.
5. `docs/EXECUTION-PLAN.md` must be updated with PASS/FAIL evidence before any later phase is considered complete.
