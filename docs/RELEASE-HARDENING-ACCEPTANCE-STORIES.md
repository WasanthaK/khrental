# KH Rentals Release-Hardening Physical Acceptance Stories

**Candidate branch:** `phase-5-release-hardening`  
**Purpose:** Final physical/browser acceptance after the implementation candidate has passed automated CI.  
**Important:** These stories do **not** authorize merge or production deployment. P0.3 remains the current production gate until its existing acceptance pack passes.

## Test discipline

- Use controlled test identities, properties, agreements, files, and invoices wherever possible.
- Record **PASS / FAIL**, the exact observed behavior, and enough evidence to reproduce a failure.
- Stop on a FAIL that suggests data corruption, cross-tenant access, authorization bypass, signing-placement regression, or payment lifecycle corruption.
- Do not expose passwords, invitation/reset tokens, API keys, signed URLs containing secrets, or customer-sensitive content in screenshots/log notes.
- For production acceptance after deployment, also record the public build SHA, Ready Azure revision, and MSSQL health.

---

## RH-01 — Logged-out password reset end to end

**Goal:** Prove P0.4 from reset request through successful password change.

Steps:
1. Start logged out in a fresh/private browser session.
2. Request a password reset for a controlled account.
3. Open the newest reset email/link.
4. Confirm the new-password form is shown without requiring an existing tenant session.
5. Set a new controlled password.
6. Confirm the reset succeeds once.
7. Sign in with the new password.
8. Confirm the prior password no longer works.
9. Reopen the used reset link.

Expected:
- reset page validates the token before showing the password form;
- no tenant/application initialization error blocks the reset page;
- successful reset invalidates the token;
- the new password signs in;
- the old password fails;
- a used token cannot reset the account again.

---

## RH-02 — Tenant create, edit, list, and persistence

**Goal:** Prove the canonical renter directory remains consistent.

Steps:
1. As Tenant Admin, create a new renter with a unique controlled email.
2. Confirm the renter appears immediately in Tenants.
3. Reload the page.
4. Open renter details.
5. Edit a non-sensitive field and save.
6. Reload list and details.

Expected:
- the renter never disappears after successful save;
- list and details show the same identity/state;
- edits survive reload;
- no duplicate `app_users` identity is created.

---

## RH-03 — Attach an existing global identity to this organization

**Goal:** Prove existing identities attach through membership instead of duplicate-user creation.

Steps:
1. Use a controlled identity that already exists globally but is not yet a renter in the current organization.
2. Add that person through the Tenants workflow.
3. Reload the Tenants directory and renter details.

Expected:
- the existing global identity is reused;
- current-organization renter access is created;
- no duplicate-email failure is shown for the valid attach case;
- no second global identity is created.

---

## RH-04 — Tenant/Team boundary and platform-admin protection

**Goal:** Prove renter and staff workflows remain separate and tenant workflows cannot provision platform administrators.

Steps:
1. Create or edit a controlled renter through Tenants.
2. Create or edit a controlled staff member through Team.
3. Exercise any role selector/options available in each workflow.
4. Attempt any tenant-side path that could previously have implied an elevated/admin role.

Expected:
- renter remains in the renter workflow;
- staff remains in the Team workflow;
- same-organization role conflicts are explicit;
- tenant-side UI/API does not create a platform-admin identity or membership.

---

## RH-05 — Renter property/unit associations survive create and edit

**Goal:** Prove renter-to-property/unit relationships remain durable.

Steps:
1. Create or edit a controlled renter with property/unit association(s).
2. Save and reload.
3. Reopen details and edit the association.
4. Save and reload again.

Expected:
- selected property/unit relationships survive create and edit;
- removed relationships are actually removed;
- unrelated property assignments are not changed;
- no cross-tenant property becomes selectable or visible.

---

## RH-06 — Agreement generation preserves the business document

**Goal:** Prove agreement generation still produces a usable agreement before signing.

Steps:
1. Use a controlled tenancy with complete landlord/tenant/property data.
2. Generate the agreement.
3. Open/download the generated document through the normal UI.
4. Inspect key tenancy details and the signature-marker area.

Expected:
- agreement is generated successfully;
- correct tenancy/property/party data is present;
- the document is retrievable after reload;
- signature marker text/placement prerequisites are present as expected by the signing flow;
- no duplicate or orphan agreement record is created.

---

## RH-07 — Evia landlord/tenant signature placement

**Goal:** Prove the restored proven AutoStamp placement satisfies the actual signing requirement.

Steps:
1. Send the controlled agreement for signature through the normal Evia flow.
2. Authenticate to Evia if required.
3. Open the landlord signing experience.
4. Confirm the landlord signature control appears at the intended landlord marker/location.
5. Open/complete the tenant signing experience.
6. Confirm the tenant signature control appears at the intended tenant marker/location.

Expected:
- signing request is created successfully;
- landlord and tenant signature controls are at the correct business-document locations;
- they are not swapped, missing, or placed at a default/unrelated location;
- no manual coordinate guessing is required for the normal template.

---

## RH-08 — Signed agreement lifecycle and retained signed PDF

**Goal:** Prove signing completion updates KH Rentals and retains the signed document.

Steps:
1. Complete all required signatures on the controlled agreement.
2. Return to KH Rentals and refresh/check status.
3. Open/download the signed document.
4. Reload and repeat retrieval.

Expected:
- signature status reaches completed/signed;
- agreement lifecycle reflects signed state;
- signed PDF is saved to tenant-scoped KH Rentals storage;
- signed document remains retrievable after reload;
- the persisted URL/path belongs to the active tenant and does not use a compatibility-storage fallback.

---

## RH-09 — Agreement/document tenant isolation

**Goal:** Prove document reads cannot cross tenant boundaries.

Steps:
1. With Tenant A active, obtain a controlled Tenant A agreement/document through normal UI.
2. Switch to Tenant B where the user has legitimate access.
3. Attempt to navigate to or otherwise reuse the Tenant A document reference using only normal browser/UI capabilities.

Expected:
- Tenant B cannot read Tenant A document content;
- normal Tenant B document operations continue to work;
- no raw storage path bypasses tenant authorization.

---

## RH-10 — Payment-proof upload and billing lifecycle

**Goal:** Prove payment-proof storage transport changed without changing billing semantics.

Steps:
1. Use a controlled unpaid invoice.
2. Upload a payment proof through the renter/payment workflow.
3. Reload and verify the proof remains accessible to authorized users.
4. Complete the normal verification/approval action.
5. Check invoice/payment state after reload.

Expected:
- proof upload succeeds through tenant-scoped storage;
- proof remains accessible only to authorized tenant users;
- billing status transitions exactly as before;
- no duplicate payment or invoice record is created by the storage refactor.

---

## RH-11 — Utility meter/reading photo upload

**Goal:** Prove both utility media forms use the new storage authority without changing reading behavior.

Steps:
1. Submit a controlled utility meter/reading with a photo from the normal renter form.
2. Submit/update one through the reusable utility meter form where applicable.
3. Reload the relevant views.

Expected:
- image upload succeeds;
- stored image remains visible/retrievable after reload;
- reading values and validation remain correct;
- no compatibility-storage error appears;
- media is tenant-scoped.

---

## RH-12 — Maintenance image lifecycle

**Goal:** Prove maintenance media still works after removing dead compatibility URL construction.

Steps:
1. Create a controlled maintenance request with one or more images.
2. Open the request card/details.
3. Reload and revisit.
4. If the UI supports it, add another image/update through the normal workflow.

Expected:
- persisted `image_url` images render correctly;
- reload does not break image display;
- normal maintenance request lifecycle is unchanged;
- no browser-side compatibility-storage URL fallback is required.

---

## RH-13 — Admin storage explorer and mutation authorization

**Goal:** Prove admin tooling uses the real storage API and mutation is protected.

Steps:
1. As an authorized administrator, open the storage explorer/admin tooling.
2. List logical buckets and contents.
3. Exercise a controlled test upload if the tool exposes it.
4. Exercise create/delete bucket only with a disposable test bucket if operationally safe.
5. Repeat the mutation attempt as a non-admin authenticated user if a safe test account is available.

Expected:
- listing/readiness uses the explicit KH storage API;
- authorized admin operations succeed where supported;
- non-admin bucket create/delete is denied;
- application startup itself does not create/mutate buckets;
- no obsolete Supabase policy diagnostic appears.

---

## RH-14 — No compatibility-storage runtime path

**Goal:** Confirm the compatibility storage shim is not needed by normal application flows.

Steps:
1. Exercise document, payment-proof, utility, maintenance, and admin-storage flows above.
2. Watch browser console/network for storage failures.
3. Confirm no normal UI action depends on a `platformClient.storage` fallback.

Expected:
- all tested storage flows operate through explicit KH storage services/APIs;
- no compatibility-storage runtime error occurs;
- no legacy bucket setup script is required.

---

## RH-15 — Release candidate regression smoke

**Goal:** Confirm the integrated candidate did not regress existing core navigation/business flows.

Steps:
1. Tenant Admin sign-in.
2. Load Tenants, Team, Properties/Units, Agreements, Billing/Invoices, Utilities, Maintenance, and relevant Admin pages.
3. Switch tenant if the controlled account has more than one membership.
4. Sign out and sign back in.

Expected:
- core directories load;
- tenant switch keeps data scoped to the selected tenant;
- no blocking console/runtime errors;
- authentication/session behavior remains stable.

---

## RH-16 — Production deployment proof (run only after authorized merge/deploy)

**Goal:** Prove the accepted candidate is the code actually serving production.

Record:
- merged behavior SHA;
- deployment workflow run ID;
- Ready Azure revision name;
- `/build-info.json` SHA;
- `/api/mssql/health` result;
- `/api/health` result;
- deterministic startup command.

Expected:
- latest intended revision is Ready;
- public build SHA exactly equals merged behavior SHA;
- MSSQL reports ready;
- health checks are green;
- startup remains `/bin/sh scripts/start-container.sh`.

---

# Final acceptance gate

The release-hardening candidate is eligible to be called production-accepted only when:

1. P0.3 US-INV-01 through US-INV-09 have passed and P0.3 is closed in `docs/EXECUTION-PLAN.md`.
2. Automated CI/build/Evia gates are green on the exact integrated candidate head.
3. RH-01 through RH-15 have PASS evidence on the candidate in the appropriate environment.
4. After authorized merge/deployment, RH-16 passes against the exact merged SHA.
5. Any failed story has a regression test added before re-acceptance.
