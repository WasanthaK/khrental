# Quixo.Homes canonical SaaS billing contract

## Controlling billing test-account decision — 2026-10-27

The owner explicitly confirmed the currently connected **Quixo Homes sandbox**, `acct_1UTgcdQ4sARuLNQa`, as the **canonical billing integration test account**. Fresh connector inventory confirms that exact account with `livemode=false`.

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
