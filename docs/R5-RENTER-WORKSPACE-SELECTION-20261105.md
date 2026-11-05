# R5 renter organization-selection correction

## Renter organization-selection correction — 5 November 2026

The approved live demo in JEERY’S PLACE now has the existing SUWADA villa / Test4 agreement `D13ECCF2-A82A-41DB-9EB7-3AB968440BB0` active. The +514 organization Administrator added three meaningful checklist categories, completed them as a **simulated demo inspection**, and recorded LKR 125,000 under `DEMO-SUWADA-D13ECCF2-DEPOSIT-001`, explicitly labelled **simulated; no actual funds received or transferred**. The owner explicitly approved activation; the browser then showed `active` and “Tenancy active”, activated 5 November. No real physical handover or payment is claimed. An unnecessary new draft created during continuation was cancelled; the existing signed agreement was used for activation.

**Renter acceptance remains OPEN.** Owner confirms the subsequent sign-in is +111 / Test4. Browser showed Access Denied and role “authenticated”; fresh reload exposed `TENANT_SELECTION_REQUIRED` because multiple active memberships exist without a selected/default organization. Return to Home looped to denial. Do not assign a new role, create another identity, change memberships or select an arbitrary organization to mask this defect.

The narrow correction returns only this authenticated account’s own active organization choices in the existing 409 context response. The browser preserves the session and presents “Choose an organization” before organization shell/storage initialization. No cached/first membership becomes authority. An explicit choice is reloaded from the server before navigation to the selected role’s portal; foreign/revoked choices remain denied and late responses cannot cross account changes. Existing single/default membership behavior remains intact. Implementation and regression checks are in progress; CI, deployment fingerprint and live +111 selection → renter agreement readback are still required. R5 and #459 remain open; billing/commercial gates are unchanged.



## Property linkage and reverse-transition verification

The follow-up correction derives Current Rentees from the tenant-scoped active agreement projection rather than global user-type/manual property arrays. The organization renter directory projects current property/unit associations from active agreements, without rewriting the global identity. Rented/occupied and available/active are normalized consistently for the property list, card, details and availability control. An occupied property’s edit form keeps availability read-only; the exit workflow owns release. Contractual end dates do not, by themselves, prove physical vacancy.

Removed the obsolete browser-side property-availability write and success claim from agreement cancellation. Unsigned document cancellation is distinct from ending an active tenancy or withdrawing a still-current accepted reservation. Active signed records remain protected by the existing server policy. Complete notice/move-out/settlement/closure before releasing stock; existing offer withdrawal and hold expiry govern reservations. Historical agreements, invoices, signatures, inspections and deposit records remain retained.

Extended disposable SQL acceptance to prove activation → renter/property linkage and Rented status, then settled closure → Available and empty current-property projection, with organization isolation and retained history. Focused tests and build are being verified; this note does not claim live owner/renter readback, cancellation, expiry or exit acceptance. The current live demo tenancy is left active for that next renter check.

## Live linkage readback and bounded presentation correction

Live owner +514 readback in JEERY’S PLACE showed SUWADA villa as Rented, Test4 under Current Rentees, and the reciprocal property link in Test4’s record. Live renter +111 previously showed the active tenancy and active/cancelled agreement history, retaining access after refresh. These checks do not claim live exit completion.

The renter-details view still hard-coded dollar labels and passed registered image objects directly to img.src. The bounded follow-up uses persisted agreement currency/amount, discloses missing currency, handles zero amounts, resolves registered image objects/JSON through the existing protected property-photo display helper, and falls back on load failure. No stored agreement, signed PDF, rent, image, membership or tenancy state is rewritten. Automated desktop/mobile card proof and subsequent +514 live readback are separate release checks.
