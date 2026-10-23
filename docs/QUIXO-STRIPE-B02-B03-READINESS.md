# Quixo.Homes Stripe B02/B03 — merchant readiness and dwelling policy

**Evidence review:** 2026-10-23  
**Document status:** B02 platform feasibility assessed, **account acceptance OPEN**; B03 counting/quantity rules **PROPOSED, OWNER DECISION OPEN**.  
**This document is read-only research and planning.** No Stripe products, prices, subscriptions, tax registrations, customer records, or transactions were created or edited. No application code, SQL or production features changed.

## Commercial facts already approved — not proposals

- USD **$5.00 per independently rentable dwelling per month**, monthly only.
- **No trial.** Checkout must be completed and verified before paid capabilities activate.
- All SaaS **Product/Price** configuration and subscription billing are managed in Stripe, not a Quixo.Homes product/plan admin console.
- Property-management organizations subscribe; rental seekers browse at no charge; landlord rent/deposits and existing tenant invoices are unrelated to the Quixo SaaS fee.
- Stripe Managed Payments **merchant of record** is preferred for evaluation, **not yet approved/eligible**.

The controlling decision is [QUIXO-HOMES-STRIPE-SAAS-BILLING.md](QUIXO-HOMES-STRIPE-SAAS-BILLING.md).

## B02 — verified evidence and remaining external requirements

### Connected Stripe account: TEST MODE read-only inspection

The connected account name is **Quixo, Inc.**; `livemode = false` and Stripe returned the following account properties at the time of this review:

| Property | Observed |
| --- | --- |
| Country | `US` |
| Account type | `standard` |
| Business type | `corporation` |
| `charges_enabled` | `false` |
| `payouts_enabled` | `false` |
| `details_submitted` | `false` |

**Interpretation:** The US business jurisdiction and software product category are compatible with Stripe's *published general Managed Payments location/category rules*, but the connected account's onboarding/payment readiness is **not complete in test mode**. These flags do not confirm or deny live-account status. No account-wide Managed Payments approval flag or accepted terms were established. Stripe alone determines account, product and transaction eligibility. **B02 remains OPEN**.

**Authorized account-owner next action:** Complete required Stripe business onboarding and review/accept the relevant Managed Payments terms, if offered, through https://dashboard.stripe.com/settings/managed-payments. Confirm specific direct-SaaS eligibility with Stripe. This is an owner action, not assumed complete by an API connection. Do not process test or live payments solely to infer eligibility.

### Published Managed Payments boundaries as of this review

1. Stripe lists the **US** as an eligible business location; eligible digital B2B SaaS can use the category tax code `txcd_10103001` where Stripe confirms appropriate classification. Products must be automated and sold *directly* rather than through a Connect/platform account. Quixo's SaaS sale to organizations is conceptually separate from the public property *discovery marketplace*. No marketplace payout/Connect integration is authorized.
2. Managed Payments is an indirect-tax merchant-of-record service *only in supported tax jurisdictions*; Stripe files/remits covered sales tax/VAT/GST. Where coverage is absent, the seller is still responsible for relevant indirect tax, even though Managed Payments may process the transaction. Corporate income tax or all local taxes are **not** included by default.
3. **Sri Lanka (`LK`) does not appear in Stripe's published Managed Payments cross-border indirect-tax coverage list** on 2026-10-23. It must not be marketed as tax-remitted by Stripe in that jurisdiction without direct new Stripe confirmation. Stripe Tax, registrations and third-party/local filing advice may still be needed. Note: *customer country* and *rental property country* can differ. Capture both distinctly.
4. Managed Payments receipts/invoices and some customer emails are sent by **Link**, and checkout may show **Sold through Link**; Managed Payments does not support custom checkout domains. Link and/or the Stripe Customer Portal can provide payment method and subscription-management functions. Customer Portal direct edits to **dwelling quantity must remain disabled**: quantity is inventory-controlled by Quixo. Cancellation and permitted billing details can remain customer-facing.
5. **Published fee stack, not an account-specific quote:** US domestic card Payments from 2.9% + $0.30; Managed Payments +3.5% of the full transaction including applicable indirect tax; Stripe Billing pay-as-you-go 0.7% of Billing volume. International card, FX, local payment method or negotiated rates may add/change cost. At one $5 subscription paid with a US domestic card and *no tax*, a simplified illustration is $0.30 + (2.9% + 3.5% + 0.7%) × $5 = **$0.655**, or approximately **13.1%** in listed transaction/Billing fees, before other costs. This does **not** establish final account pricing.
6. Managed Payments can support subscriptions, but the precise Checkout/API version, subscription quantity updates, invoice adjustment and customer management behavior must be exercised in approved test-mode acceptance. No published support matrix is proof that Quixo's connected account has the feature enabled.

### B02 exit evidence before any regional paid launch

- Stripe records **accepted Managed Payments terms / enabled capability** for the intended merchant, eligible Quixo SaaS product, and permitted country/region use.
- Completed account onboarding and collection/payout readiness separately verified in the appropriate mode.
- Tax coverage decision made for **each initial subscribing customer's country**, distinct from the property's geography. Local indirect-tax fallback and responsibility approved where Managed Payments does not file/remit.
- Confirm fee economics at 1 / 5 / 20 / 100 dwelling subscription sizes, taxes, refunds, currency conversion and local payment methods.
- If Managed Payments is unavailable, **explicit business approval** for Billing + Stripe Tax with Quixo retaining the legal tax obligations; no silent fallback.

## B03 — proposed unit-count and adjustment policy (NOT yet approved)

### Recommendation A: distinct, persistent billable dwelling identity

Quixo's existing schema supports both `dbo.properties` (with `propertytype`, `status`) and `dbo.property_units` (with `propertyid`, `unitnumber`, `status`). The current status values include `available` and `occupied`; these are *occupancy* states, not trustworthy subscription billability. Product types include apartment complex, house, condominium, commercial and land. Do not count both an apartment parent and its children.

**Proposed deterministic inventory count:**

- For a residential parent with independently rentable `property_units`, count each billable unit **once** by its stable unique unit ID. Do **not** also count the parent property.
- For a standalone residential property without child units (house or condo), count **one** independently rentable dwelling by its stable property ID.
- Commercial properties, undeveloped land, duplicated/imported units and draft/test fixtures must not automatically count as residential dwellings. If commercial SaaS billing is wanted later, approve a separate explicit policy.
- Vacant and occupied units both count when **actively managed**; public-listing visibility does not affect billability. A landlord cannot avoid subscription charges by temporarily unpublishing a unit.
- Define a new governed `billable_managed` lifecycle/scope (or equivalent contract) rather than abusing public availability, occupancy, or an arbitrary browser checkbox. Removal requires an audited, authorized archive/cessation of management; preserve historical invoices, tenancies and signed documents.
- An organization in **billing-pending setup** can enter provisional unit details to calculate the initial quantity, but should not gain full paid features until Stripe confirms payment. This setup state is not a free trial.
- Server-computed quantity is authoritative and tenant-scoped. Prevent overwriting a different organization's Stripe Customer/Subscription ID or changing quantity based on client-supplied totals.

### Recommendation B: lifecycle billing rules (proposals, not defaults already agreed)

| Scenario | Recommended initial rule | Rationale / remaining decision |
| --- | --- | --- |
| First paid activation | Stripe Checkout for server-counted ≥1 dwelling; require verified successful first invoice/payment; no trial | What to do with zero-unit registered organizations needs approval |
| Add an actively managed dwelling mid-cycle | Update licensed quantity promptly and **prorate increases** using Stripe's standard proration; confirm charge preview/customer disclosure | Stripe may add prorations to next invoice or invoice immediately depending on configured update behavior. Recommend preview and invoice at renewal to avoid micro-charges; owner must approve |
| Remove a dwelling from management | Record cessation immediately; **quantity reduction at next renewal**, with no retroactive credit in the current prepaid period, if clear subscription terms disclose it | Avoid oscillation; alternatively symmetric immediate credits. **Owner choice required** |
| Change vacant ↔ occupied | No billing-quantity change | Both are managed dwellings |
| Toggle marketplace listing on/off | No billing-quantity change | Advertising status is independent from management |
| Manage 0 dwellings | Keep account and records without paid feature access; set cancel-at-period-end subject to consent and terms | Never delete documents or silently create a perpetual free tier |
| Payment failure | Stripe retry/dunning; preserve all stored records and existing renter access; after a documented limited grace window, restrict **new paid-management changes** only | Recommend 7 days from failed renewal as *grace*, not a trial. Owner must accept exact window/rights |
| Cancellation | Stripe handles cancel-at-period-end; read-only access/export after expiry; renter access and historical legal artifacts remain safe | Retention and later reactivation policy requires review |
| External Stripe quantity modification | Reconcile against authoritative inventory, record discrepancy and halt unexplained entitlement escalation | Do not trust portal or manual Stripe quantity edits to authorize property access |

**Do not implement these proposed B03 rules until approved.** In particular, upsell proration and downgrade treatment should be visible in customer terms, and behavior must be tested in Stripe's test mode first.

### Engineering acceptance for B03/B04/B05 later

- New organization with one house: 1 billed dwelling; apartment complex with 12 separately rentable apartments: 12, not 13; occupied and vacant units both count; land/commercial excluded under this definition.
- Prevent duplicate counts, unauthorized archive/restore, and cross-tenant inventory/Stripe ID manipulation.
- Global seeker signup must **not** attach the user to the legacy `kh-rentals` tenant. No property-management authority until a verified relationship exists.
- Stripe webhook ingestion must be signature-verified, de-duplicated, reconciled and authorized; Checkout success redirects are **not** payment proof.
- Preserve read access to historical agreements, financial documents and tenant records on unpaid/canceled accounts, subject to separately approved retention and legal access rules.
- No app-maintained Price/Product CRUD, no actual rental payments through Stripe SaaS, no automatic trial.

## Source references reviewed

1. https://docs.stripe.com/payments/managed-payments/eligibility
2. https://docs.stripe.com/payments/managed-payments/tax-compliance
3. https://docs.stripe.com/payments/managed-payments/how-it-works
4. https://docs.stripe.com/payments/managed-payments/set-up
5. https://stripe.com/managed-payments
6. https://stripe.com/pricing
7. https://stripe.com/billing/pricing
8. https://docs.stripe.com/api/subscriptions/update
9. `migrations/20260913_00_create_fresh_mssql_schema.sql`, `src/pages/PropertyForm.jsx`

## Readiness verdict

**B02 = REVIEWED / ACCOUNT ACTIVATION AND TAX COVERAGE OPEN.** Stripe US account-type screening and public product support are encouraging; test-account collection readiness is false; acceptance is not established.  
**B03 = ARCHITECTURAL RECOMMENDATIONS DRAFTED / OWNER APPROVAL OPEN.** No changes to billing quantities, Stripe objects, app behavior or existing financial documents.  
**B04/B05 remain BLOCKED from production execution by verified signup and Stripe merchant decisions.**


## B03 owner confirmation — approved dwelling charging rules (2026-10-23)

**Approval:** The owner answered **"okay"** to the direct request to approve the eight summarized dwelling-billing rules in the 2026-10-23 B02/B03 review. This section is the **controlling decision** for exactly those rules. Earlier draft/proposal language in this file remains historical design rationale, not a reason to classify these eight items as unapproved.

| Rule | Owner-approved policy |
| --- | --- |
| Unit counting | One standalone residential house counts as **1** dwelling; a parent apartment property containing 12 separately rentable apartment units counts as **12, not 13**. Do not count parent and child together |
| Vacancy | A vacant **actively managed** dwelling remains billable |
| Publication | Unpublishing or relisting a dwelling on the public marketplace does **not** alter its SaaS billability |
| Mid-cycle addition | An additional actively managed dwelling increases the subscription quantity with **proration** |
| Mid-cycle removal | Record an authorized cessation of management immediately, but **reduce the billed quantity at the next renewal** rather than issuing an immediate current-period credit |
| Payment failure | Apply a **7-day renewal-payment grace period** before restricting new paid-management operations, with Stripe retries and verified status |
| Cancellation | Preserve historical records, signed documents, retained invoices and renter access; never delete due to subscription cancellation |
| Price/period/trial | The previously approved **USD 5 per billable dwelling, monthly only, no trial** contract remains unchanged |

**Implementation detail not yet approved:** How to handle a newly registered organization with zero managed dwellings; whether proration is invoiced immediately or at renewal; exact archival/status definition for ceasing management, billing-cycle cutoffs, post-cancellation paid-write/read-only rights and reactivation, tax behavior, and whether/how nonresidential units are eventually offered. These decisions require contract language and test-mode proof before paid production activation.

The above is **a policy sign-off, not proof of implemented Stripe Billing behavior**. B03's **eight core business rules are approved**; B03 technical delivery and the listed secondary policy details remain OPEN. B02 Stripe Managed Payments/onboarding is still OPEN. No live or test Stripe mutation, tenant/invoice update, or production feature activation is authorized by this document.
