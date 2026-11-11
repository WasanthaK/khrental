# Quixo.Homes canonical SaaS billing contract

## Implementation and commercial boundary — 11 November 2026

The [verified inventory/cessation release](R5-INVENTORY-CESSATION-RELEASE-20261110.md) and [current task ledger](R5-LIFECYCLE-ACCEPTANCE-20261105.md) supersede older implementation-pending wording below. PR #545 provides bound cancellation readback recovery; PR #547 provides private durable preparation and exact paid-confirmed promotion; PR #548 provides atomic obligations-closed cessation for paid active/ending subscriptions with retained history and renewal-only reductions/final cancellation. PR #561 supplies full-metadata normal-form preparation and retry integration with browser/SQL evidence in the task ledger; release #1546 is verified at Ready 0000488, serving `4baeabc14cd96481101cda7071d93393a4819fb2`. Production readiness and controlled live acceptance remain pending. Restoration/splits, other cessation states and broader reconciliation remain open.

These are deployed, default-off source preparations. Both new migrations remain pending under the last read-only production plan; inventory/cessation readiness flags, controlled enforcement and live charging remain OFF. All seven final cessation checks passed, including 922 tests and SQL/browser fixtures; genuine enabled-scope live acceptance is distinct.

No commercial decision changes in this documentation update. Retain monthly/no-trial, ordinary additions on the next invoice, renewal reductions, seven-day grace and authorized history/recovery. The [commercial decision pack](QUIXO-STRIPE-B02-B03-READINESS.md) retains unapproved FX/rounding, restoration timing, exceptional bulk, refund, merchant/tax/privacy choices as drafts. Older dated entries are evidence at their recorded time, not current rollout authority.

## Monthly invoice guard release — 10 November 2026

[PR #538](https://github.com/WasanthaK/khrental/pull/538) is merged as `5caced59fa6b344ca5b21a91d114203ff9151c90`. [Release 42753074986](https://github.com/WasanthaK/khrental/actions/runs/42753074986) **passed**, with Ready revision **0000476**. Independent public build readback matched `5caced59fa6b344ca5b21a91d114203ff9151c90`. The first live SQL-health read returned HTTP 503 during rollout; a subsequent independent read returned `connection=ready`, and the deployment verifier also passed live SQL connectivity. This records recovery, not an established cause of the initial unavailable response.

Final reviewed head `b3352bb98f0060c4c5d9bdb85f0516013396cba9` passed [912/912 authorization tests and build](https://github.com/WasanthaK/khrental/actions/runs/42752771309), [real disposable SQL billing/lifecycle acceptance](https://github.com/WasanthaK/khrental/actions/runs/42752771203), [migration proof](https://github.com/WasanthaK/khrental/actions/runs/42752771392), [sandbox readiness](https://github.com/WasanthaK/khrental/actions/runs/42752771193) and [webhook regression](https://github.com/WasanthaK/khrental/actions/runs/42752771224). Local focused tests passed 95/95. Real SQL and a real disposable administrator session proved expiry/risk/initial-payment denial, valid paid/ending/grace/complimentary access, ignored caller override fields, a readable HTTP 403, revocation locking, full-invoice rollback, retained tenant-scoped reads and an unaffected unselected organization. New mutation fixtures follow existing global read-only snapshot assertions; those expected counts were preserved.

**The monthly guard is deployed but rollout remains OFF; this is not full BL08 acceptance.** This release configures no enforcement enable flag or organization scope and performs no production billing-record or provider mutation. Do not activate the rollout until the remaining direct/generic/import guards, staged inventory, audited obligations-closed cessation and asynchronous reconciliation are accepted. Existing testing organizations retain their access. Historical reads and billing recovery remain available. Next engineering work is the remaining transactional business writers and inventory/cessation paths.

Genuine renewal/failure/grace/recovery, actual Platform Administrator complimentary controls, missing Evia audit retention, remaining operational/presentation cases and commercial/merchant/tax/privacy exits remain open. Signing stays accepted. R5 remains active; live charging remains disabled. Sri Lanka readiness precedes Brunei.

## Monthly invoice write enforcement preparation — 10 November 2026

The monthly invoice generator now checks management access inside its own SERIALIZABLE transaction, before invoice, component, utility or lifecycle writes. The billing-account row remains locked through commit; expiry is evaluated against the database clock. Manual and automatic scheduler callers share this boundary. Paid active/ending access, current renewal grace and valid complimentary access are admitted; missing/unverified payment, expired access and risk holds deny generation. Existing invoice reads and billing recovery are unchanged.

This is **one bounded BL08 implementation slice**, not full production enforcement or management cessation. Server rollout requires both `MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED=true` and an explicit comma-separated UUID scope in `MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS`; the default is OFF. Invalid enabled configuration fails closed, and selected organizations require schema readiness and the mutation's SQL transaction. Enrollment, payment and request bodies cannot opt an organization in. **Do not configure these controls until the complete write-path and inventory/cessation acceptance is ready.** This change does not configure production flags or restrict existing testing organizations.

The disposable SQL acceptance includes selected/unselected organizations, manual/scheduler invocation, paid/ending/grace/complimentary states, expiry/risk denial without partial writes, a real competing revocation lock timeout, invoice-write rollback and preserved tenant-scoped historical reads. These are fixtures; genuine renewal and privileged live complimentary acceptance remain separate. Direct/generic/import mutations, audited obligations-closed cessation, staged inventory and asynchronous reconciliation still require implementation. `applicationEnforcementEnabled` remains false. R5 stays active and live charging disabled; accepted signing is preserved.

## Zero-stock renewal correction — 10 November 2026

[PR #536](https://github.com/WasanthaK/khrental/pull/536) is merged as `8b67b3ebfc1cdd6647a98b89f2ef2b66bbbefcac`. Zero-stock quantity review now confirms cancellation at renewal, retains the current billed quantity, rejects renewal restoration while stock is empty, and retries ambiguous provider success using the same operation and idempotency key. This is the billing behavior for empty managed inventory; it does not implement the separate management-cessation journey.

Final reviewed head `8e1cd39645898feaf1faaee633985f376f97b30d` passed [909/909 authorization tests and production build](https://github.com/WasanthaK/khrental/actions/runs/42739324416), [disposable SQL Server migrations and billing transactions](https://github.com/WasanthaK/khrental/actions/runs/42739324179), [full browser checks](https://github.com/WasanthaK/khrental/actions/runs/42739324190), and [sandbox readiness](https://github.com/WasanthaK/khrental/actions/runs/42739324188). The SQL fixture removes its own private listing-preference child before deleting its disposable property; production foreign-key protection is unchanged. SQL proves cancellation, retained quantity, rollback/lost-response retry, durable duplicate result and empty-stock renewal denial using explicitly synthetic provider transport. Inspected zero-stock review/ending screenshots at 390px and 1440px match the final-head artifact byte-for-byte. Local focused tests passed 26/26.

[Release 42739654622](https://github.com/WasanthaK/khrental/actions/runs/42739654622) **passed**, with Ready revision **0000475** and exact serving source `8b67b3ebfc1cdd6647a98b89f2ef2b66bbbefcac`. Independent reads of the public `build-info.json` and `/api/mssql/health` matched that SHA and returned `connection=ready`. The merged-source disposable SQL verification [42739654368](https://github.com/WasanthaK/khrental/actions/runs/42739654368) also passed. Marketing is unchanged.

This checkpoint supersedes earlier source-only/CI-pending wording for PR #536. **Signing remains accepted and is not repeated. R5 remains active and incomplete; live charging stays disabled.** No existing provider subscription, occupied property, signed document or production billing record was changed for this acceptance. Genuine deployed zero-stock confirmation is unperformed.

Remaining dependencies and next work:

- BL04/BL05: connected Stripe operation discovery on 10 November still exposes clock creation only, not listing/advancement. Retain the existing clocks and subscriptions; genuine renewal, failed payment, grace expiry and recovery remain open.
- BL07: actual complimentary grant/revoke/expiry acceptance remains pending for the verified **Platform Administrator** (`AUTHORIZED_ACCOUNT`). The previously declined sign-in is not repeated. Organization-owner billing authority is separate.
- BL08: implement audited obligations-closed cessation, staged managed inventory and transaction-scoped expiry/write authority across direct, generic, import and job paths, plus asynchronous reconciliation. Preserve billing recovery, renter reads and historical documents. The current summary still reports `applicationEnforcementEnabled=false`; do not mark production enforcement complete or activate a blanket restriction for existing test organizations.
- Missing Evia audit retention remains separately open. Preserve accepted operational evidence. Remaining stock/failure/presentation, commercial/merchant/tax/privacy and Sri Lanka launch exits remain open; Brunei follows Sri Lanka.

## Sri Lanka handoff execution and owner decisions — 9 November 2026

This checkpoint incorporates the owner's 8 November signing clarification and the Sri Lanka completion handoff. **Signing is completed and accepted; do not repeat signing or reopen the whole journey.** Preserve accepted demo move-in, invoicing/receipts, maintenance, exit/relisting, organization switching and the two existing sandbox subscriptions. Missing Evia audit retention remains a separate open item. R1/R3/R4 owner dispositions and deferred R2 remain unchanged; R5 is active and live charging stays disabled.

The owner selected these business rules during handoff execution:

- After subscription expiry, management becomes **read-only**, including existing-tenancy management writes. Preserve historical documents and renter reads; billing recovery must remain available.
- Management cessation is allowed **only after obligations close**: no active tenancy, unresolved financial or maintenance work, or applicable hold.
- Ceasing the final dwelling schedules **cancellation at renewal**, with retained history and explicit resumption when stock exists. Do not create a zero-quantity subscription.

These decisions replace the corresponding open choices below. They are not evidence of full enforcement or cessation implementation. Automatic cessation eligibility, inventory staging, transaction guards across direct/generic/import/job paths, asynchronous reconciliation and actual complimentary controls remain open (BL07/BL08).

Current investigation: the live database readiness endpoint returned `connection=ready` on 9 November; the previously observed unavailable state is no longer the current observation. Platform Administrator sign-in was declined, so no authenticated complimentary mutation, receiver-ledger query or page acceptance is claimed. No repeated sign-in request was issued. Read-only provider checks confirm the retained second subscription is active with two billed dwellings and an active schedule reducing to one at **6 December 2026 12:44:35 UTC**. The connected operation search still exposes clock creation, but not listing/advancement. BL04/BL05 and genuine deployed BL06 evidence remain blocked/open; existing provider objects were retained and no provider write occurred.

The bounded source correction replaces the zero-stock policy-pending error with explicit period-end cancellation review and confirmation, preserves the current billed quantity, rejects empty-stock renewal restoration, and supports retry after a lost provider response and independent ending-state readback. It does **not** create management cessation or certify production enforcement. Local focused tests: **26/26**; affected production build: PASS; remaining stock/activation/exit/retained-document tests: **67/67**. Local full authorization: **908/909**, with the one failure caused by Chromium launch restrictions. Browser and disposable SQL evidence require CI; no deployment/live zero-stock acceptance is claimed yet.

## Current milestone disposition — 5 November 2026

The owner closed R3 for the accepted single-replica release and R4 for its deployed sandbox foundation, and made R5 the active priority. See the [canonical status](EXECUTION-PLAN.md) and [delivery ledger](R4-R5-DELIVERY.md).

The commercial contract below is unchanged. Genuine hosted payment/lifecycle acceptance, production inventory and entitlement enforcement, unresolved pricing/cessation/reactivation rules and merchant/tax readiness remain **R5 paid-launch prerequisites carried from R4**. They are not certified by the milestone closure, and live charging remains disabled. Operational R5 work proceeds without waiting for those paid-launch exits.

---

## Controlling owner decision — configurable market pricing, 30 October 2026

This section supersedes the earlier fixed-USD-5/no-app-side-pricing-edit restriction below. The owner requires **global-admin-controlled base fees and included rental-value thresholds**, informed by market research, without a code release for each price change. This is a commercial/configuration requirement for the subscription-management phase, not evidence of implemented controls or live billing activation.

### Customer offer and journey

- The base fee pays for property and rental-lifecycle management. Standard public listing is an included value-add, automatic for eligible available inventory unless the owner opts out; there is **no separate listing fee**.
- Premium/paid-prominence listings are **out of initial scope**.
- Rental seekers browse freely, choose **Express your interest**, then register/sign in and continue with that property. Do not require registration just to browse.
- Owner signup leads to adding/managing property and the governed paid subscription flow, rather than a separate pay-to-list product.

### Required Global Admin settings

| Setting | Configuration authority and meaning |
| --- | --- |
| Market | Explicit supported country/market, initially LK and BN; no silent cross-market fallback |
| Base management fee | Editable amount and billing currency, per independently rentable dwelling per month; USD 5 remains the starting baseline, not a hardcoded permanent price |
| Included monthly-rent threshold | Editable amount in the market's rent currency (e.g. LKR for LK, BND for BN); independently set using market research |
| Above-threshold adjustment | Configurable policy/rate once commercially approved; calculation basis and rounding must be explicit, with a preview |
| Effective date and version | Schedule and identify each pricing rule; retain previous versions |
| Research rationale | Record the source/date or decision note supporting the market threshold |

The user specifically approved configurability of the **base fee and threshold**. The excess fee/rate, final threshold values, billing currency overrides, FX treatment and rounding are not yet commercially finalized. Rs 25,000, USD 100 and BND 1,200 are discussion examples, not production defaults or researched market findings. No example may activate an unapproved surcharge.

Only a server-verified active **global/platform admin** may create/change these rules. Organization owners, staff, seekers and client-supplied roles/country values must not grant price-edit authority. Validate amounts/currencies, prevent stale concurrent overwrites, record actor/before/after/reason/effective time, and preview the customer price before activation. Unconfigured/incomplete market rules must not silently invent a fee or enable paid checkout.

### Billing ownership and change application

Global-admin settings govern the commercial market rules; Stripe continues to own actual payment collection, subscription/invoice state and Stripe Product/Price resources. Implement controlled, versioned synchronization/publication to Stripe as part of B05. Do not create a second application invoice/collection system or treat a saved draft admin setting as an active Stripe price.

Changing a setting must not silently reprice existing subscriptions or rewrite historical invoices. New pricing needs an explicit effective date and defined application to new subscriptions; migration of existing customers requires a separately reviewed policy. Tax-inclusive/exclusive presentation and market tax readiness remain explicit launch requirements.

**Status:** requirement recorded; admin controls, schema/API, Stripe synchronization and live pricing acceptance are not implemented by this document. Preserve the ordered website-first / subscription-management-next scope, existing merchant/tax gates, tenant isolation and no-trial decision. No Stripe object, customer charge, live account, permission, schema, feature flag or deployment is changed by this clarification.

---

## Controlling billing test-account decision — 2026-10-27

The owner explicitly confirmed the currently connected **Quixo Homes sandbox**, `AUTHORIZED_PROVIDER_OBJECT`, as the **canonical billing integration test account**. Fresh connector inventory confirms that exact account with `livemode=false`.

**Account selection is CLOSED.** This supersedes the earlier intended-sandbox selection and the account-selection blocker recorded in issue #375 and historical checkpoints. Earlier account IDs and objects remain historical evidence only; do not provision or use them for new canonical B05 work. No relationship between the old accounts is asserted or required to proceed with this newly selected sandbox.

Use the existing approved sandbox catalog and portal; do not recreate duplicates. The latest [read-only readiness checkpoint](BILLING-READINESS-20261027.md) records active sandbox Tax settings, no tax registrations and no registered webhook endpoint. Sandbox selection does not establish live merchant readiness, tax/Merchant-of-Record acceptance or paid-lifecycle acceptance. No Stripe object, credential, business profile, tax registration, subscription, charge, application configuration or replica was changed by recording this decision. Live billing and public signup remain gated.

**Decision date:** 2026-10-23  
**Status:** COMMERCIAL DIRECTION APPROVED / IMPLEMENTATION AND MERCHANT-OF-RECORD ACCEPTANCE PENDING  
**Authority:** Owner-confirmed commercial decisions in the Quixo.Homes planning conversation.  
**Scope:** Quixo.Homes B2B software subscriptions only; not tenant rental invoices, security deposits, landlord payment collection, or public marketplace commissions.

## 1. Approved commercial decisions (do not silently reopen)

| Parameter | Canonical value |
| --- | --- |
| Billing currency | USD |
| Unit price | **USD 5.00 per dwelling per month** |
| Interval | **Monthly only**; no annual price |
| Trial | **None**; no 30-day or no-card free trial |
| Paying customer | **One property-management organization** |
| Price authority | **Stripe Product/Price catalog**; no editable app-side pricing or plans |
| Subscription billing and payment | Stripe-hosted Checkout, Stripe Billing and supported Stripe-hosted customer/account management |
| Income from rental seekers | **None by default**; public property search is free |
| Rent/deposit collection | **Excluded** from this SaaS subscription; existing tenant invoices and landlord issuer identity remain separate |
| Tax liability objective | **Evaluate Stripe Managed Payments (merchant of record)** before launch; eligibility and coverage **unverified**, not automatically assumed |

The USD 5 rate is a business decision, **not evidence that a Stripe test or live Price exists**. Before a live rollout, configure the actual Product, Price, recurring interval, quantity model, tax code and, where eligible, Managed Payments settings in Stripe. Do not create live prices, subscriptions, charges or tax registrations as part of documenting this decision.

A single Product and one licensed, per-unit USD 5 recurring monthly Price are the intended starting shape; other tiers, annual periods, onboarding fees and free trials are **not** approved. Price changes in the future require a new Stripe Price, explicit migration policy and commercial authorization; never silently overwrite legacy subscription economics.

## 2. Commercial quantity and organization ownership

- The chargeable unit is an **independently rentable dwelling** (unit/apartment/whole house), not a property building, staff member, rental seeker, or signed tenancy. A building with twelve separately rentable apartments can represent twelve dwellings; a whole house offered as one unit represents one.
- Charge = `500 cents × subscribed dwelling quantity` per month **before tax**. Tax-inclusive versus exclusive presentation, proration, mid-cycle adjustments, cancellations and minimum/zero-dwelling handling remain **explicit operational policy decisions**; do not invent defaults and charge customers.
- The Quixo.Homes organization is the billed customer, not its owner as a personal renter. One authenticated organization is linked to one active Stripe Customer and its governed SaaS subscription (subject to a separately defined migration/duplicate policy).
- **Quixo.Homes is the source of truth for organization ownership and the billable dwelling inventory.** Stripe is authoritative for Product/Price, subscription item quantity charged, collection, invoices, refunds and payment/subscription state.
- Reconcile billed quantity with the server-counted, organization-scoped inventory using authenticated, idempotent commands and periodic readback; forbid cross-organization/customer/subscription reassignment.
- Do **not** allow unrestricted quantity editing in the Stripe Customer Portal when quantity is determined by dwelling inventory. The portal may expose payment methods, billing details, invoices and cancellation options as permitted by Stripe; quantity changes require controlled app-to-Stripe synchronization.
- Do **not** conflate public property listing status, rental occupancy and the billed-inventory definition. Agree the exact billable status/exclusions before implementing quantity changes.

## 3. Signup and account lifecycle (dependent design)

- **Rental seekers:** global account, browse/search/enquire without paid software subscription or automatic membership in a landlord organization.
- **Property-management operators:** global account, create/claim a separate organization only via secure verified ownership flow; a new organization remains **billing-pending / non-entitled** until a valid subscription is confirmed. No free trial is granted by delayed payment.
- **Existing renters:** access tenant documents/payments only through verified tenant membership/invitation/tenancy relationship; registering as a seeker never creates landlord-tenant authority.
- Preserve one global identity per email, server-resolved organization memberships and tenant authorization. The legacy `/auth/sign-up` path currently auto-assigns a `rentee` to the existing `kh-rentals` organization and **must be redesigned before public regional signup is exposed**. Do not rebrand existing tenant IDs/slugs as a shortcut.
- Where an operator owns multiple organizations, require an explicit context and one separately associated Stripe subscription per billable organization; no subscription ID may grant another organization's entitlements.
- Stripe Checkout should be launched only by a verified organization billing administrator; derive customer/subscription/quantity server-side; validate completion by Stripe API/webhooks, **never only by browser success redirect**.

## 4. Stripe responsibilities vs Quixo.Homes responsibilities

| Stripe authority | Quixo.Homes retained authority |
| --- | --- |
| Product, Price, currency, interval, coupons if later authorized | Organizations, members, properties and dwelling lifecycle |
| Subscription, invoice, credit and payment state | Inventory count, entitlements and authorization decisions |
| Hosted Checkout/Customer Portal or Managed Payments + Link supported tools | Authenticated organization billing entry points |
| Payment collection and Stripe-side tax accounting | Verified webhook ingestion, durable ID mapping and reconciliation |
| Eligible merchant-of-record indirect taxes under Managed Payments | Product delivery, customer support outside transaction level, audit and regional policy |

The app stores **identifiers and a verified billing entitlement projection only**, such as organization ID, Stripe Customer ID, Subscription ID, Subscription Item ID, Price ID, billed quantity, billing status, current period, last applied Stripe event, timestamps and reconciliation outcome. This is **not** an editable product, tax or plan catalog.

Implement verified signed Stripe webhooks, deduplicated event IDs, idempotent transitions, out-of-order handling, replay/reconciliation, and server-side entitlement checks. Account for `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed` (and additional events supported by the selected integration). A Checkout success page or a Stripe event alone cannot grant access to an unrelated organization.

Dunning/grace behavior, whether a failure blocks publishing vs existing tenancy operations, downgrade handling, cancellation timing and refunds require explicit and humane business rules. **Never delete tenant records, signed agreements, invoices or audit artifacts because SaaS billing lapses.**

## 5. Tax, merchant-of-record and regional release gates

**Preferred evaluation:** Stripe Managed Payments for eligible direct digital SaaS sales under Quixo, Inc. (the connected Stripe account currently available to this project is in **test mode**). US business location is listed as supported, but **Stripe must determine account/product/transaction eligibility**; a registered company or test account is not approval.

Current Stripe documentation (reviewed 2026-10-23):

- Managed Payments supports eligible automated digital SaaS sold directly, with an eligible product tax code (e.g. `txcd_10103001`, SaaS business use, subject to Stripe confirmation). It excludes Connect-platform arrangements and non-digital/assisted professional services.
- It is merchant of record for **indirect tax** where supported: calculates, collects, files and remits sales tax/VAT/GST in covered jurisdictions; Stripe/Link may issue customer-facing tax documents and transaction messages. It is **not a blanket guarantee for every jurisdiction or for corporate income taxes**.
- **Sri Lanka is absent from Stripe's published cross-border Managed Payments indirect-tax coverage list as of this review.** Do not assert that Stripe collects/remits local indirect tax there without explicit independent confirmation. Region-by-region launch approval must capture tax coverage, customer country, cross-border/domicile rules and fallback obligations.
- In non-covered jurisdictions, merchant remains responsible for applicable registrations/filing/remittance, with Stripe Tax and partner services as possible supports; do not infer that ordinary Stripe Tax transfers tax liability to Stripe.
- Verify Quixo's Merchant-of-Record acceptance, eligibility for monthly licensed/quantity-based subscriptions, linked Customer Portal and quantity adjustment behavior, applicable fees and Stripe-side customer terms/branding before implementing. Managed Payments checkouts do not support a custom domain and can be labeled Link/Sold through Link.
- Confirm the public rental marketplace remains a **separate discovery product**. Landlord rent and deposits must not be routed through Managed Payments, and no Stripe Connect payouts are implicitly approved.

References:
- https://docs.stripe.com/payments/managed-payments/eligibility
- https://docs.stripe.com/payments/managed-payments/how-it-works
- https://docs.stripe.com/payments/managed-payments/tax-compliance
- https://docs.stripe.com/payments/managed-payments/set-up
- https://docs.stripe.com/billing/subscriptions/metered-billing/thresholds
- https://docs.stripe.com/billing/subscriptions/webhooks

## 6. Ordered delivery gates

1. **B01 — Commercial decision (CLOSED):** USD 5 per dwelling monthly, no trial, Stripe-only plans, free seekers, subscriptions separate from rental payments.
2. **B02 — Stripe merchant-of-record feasibility (OPEN):** confirm Quixo, Inc. account acceptance for Managed Payments, tax coverage for initial countries, supported subscription quantity changes, fees and disclosures. Stripe Tax/Billing fallback must be explicitly approved if Managed Payments is unavailable.
3. **B03 — Billable dwelling policy (CORE RULES APPROVED; SECONDARY DETAILS/IMPLEMENTATION OPEN):** owner approved dwelling counting, vacant/listed treatment, prorated increases, reductions at renewal, 7-day payment-failure grace and preserving historic documents on cancellation. See the controlling approval in `QUIXO-STRIPE-B02-B03-READINESS.md`; zero units, proration invoice timing and detailed cancellation/write-access behavior need explicit completion.
4. **B04 — Public/organization signup redesign (OPEN):** secure seeker, renter and owner/admin journeys with verified tenant isolation and no auto-attach of public seekers to `kh-rentals`; handle payment-pending organizations without an implicit trial.
5. **B05 — Stripe test-mode catalog and integration (NOT STARTED):** after B02/B03 decisions, configure Stripe test Product and Price using Stripe-owned configuration, Checkout, portal settings, webhooks and customer linkage; prove no live keys/charges.
6. **B06 — Two-organization quantity and failure acceptance (NOT STARTED):** same identity in multiple organizations, per-org subscription isolation, count change, duplicate events, retries, tax-region cases, cancellation and no destructive data loss.
7. **B07 — Regional launch (BLOCKED):** approve supported pilot country, completed merchant/tax mapping, legally reviewed checkout disclosures and price presentation, secure live payment activation and evidence-based launch decision.

**Boundary with existing execution plan:** preserve Phase 4 original C02/C03/C05 acceptance and Invoice Designer I02 default-off release separately. Existing tenant rent invoice PDFs and issuer details are not Stripe SaaS invoices. Current domain/marketing deployment work is independent.

**Change control:** This document approves **requirements and architecture planning only**. It does not authorize live Stripe objects, real payments, invoice issuance, SQL writes, workflow feature activation or changes to historical financial records.

**B02/B03 status note (2026-10-23):** See the detailed [merchant-readiness evidence and proposed dwelling/quantity lifecycle](QUIXO-STRIPE-B02-B03-READINESS.md). Stripe account screening is read-only and **not an eligibility approval**. B03 business rules are proposed only; no subscriptions, products, prices or transactions were created. B02 and B03 remain **OPEN** pending owner/Stripe decisions.


**B03 owner approval (2026-10-23):** The previous B02/B03 status note above predates approval of the eight summarized commercial dwelling rules. [B03 approval and remaining implementation details](QUIXO-STRIPE-B02-B03-READINESS.md#b03-owner-confirmation--approved-dwelling-charging-rules-2026-10-23) is controlling; **do not mark B03 implemented or close B02**.


**B04 architecture review (2026-10-23):** See [secure seeker, owner and existing-renter registration design](QUIXO-HOMES-B04-SIGNUP-ARCHITECTURE.md). Existing public sign-up still auto-attaches new users to `kh-rentals`, and generic email linking requires explicit security remediation before public marketplace onboarding. B04 remains **OPEN / DESIGN-ONLY**.
