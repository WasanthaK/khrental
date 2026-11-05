# R5 renter organization-selection correction

## Renter organization-selection correction — 5 November 2026

The approved live demo in JEERY’S PLACE now has the existing SUWADA villa / Test4 agreement `D13ECCF2-A82A-41DB-9EB7-3AB968440BB0` active. The +514 organization Administrator added three meaningful checklist categories, completed them as a **simulated demo inspection**, and recorded LKR 125,000 under `DEMO-SUWADA-D13ECCF2-DEPOSIT-001`, explicitly labelled **simulated; no actual funds received or transferred**. The owner explicitly approved activation; the browser then showed `active` and “Tenancy active”, activated 5 November. No real physical handover or payment is claimed. An unnecessary new draft created during continuation was cancelled; the existing signed agreement was used for activation.

**Renter acceptance remains OPEN.** Owner confirms the subsequent sign-in is +111 / Test4. Browser showed Access Denied and role “authenticated”; fresh reload exposed `TENANT_SELECTION_REQUIRED` because multiple active memberships exist without a selected/default organization. Return to Home looped to denial. Do not assign a new role, create another identity, change memberships or select an arbitrary organization to mask this defect.

The narrow correction returns only this authenticated account’s own active organization choices in the existing 409 context response. The browser preserves the session and presents “Choose an organization” before organization shell/storage initialization. No cached/first membership becomes authority. An explicit choice is reloaded from the server before navigation to the selected role’s portal; foreign/revoked choices remain denied and late responses cannot cross account changes. Existing single/default membership behavior remains intact. Implementation and regression checks are in progress; CI, deployment fingerprint and live +111 selection → renter agreement readback are still required. R5 and #459 remain open; billing/commercial gates are unchanged.


