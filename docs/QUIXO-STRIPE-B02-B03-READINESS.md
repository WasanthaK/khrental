# Quixo.Homes Stripe B02/B03 — merchant readiness and dwelling policy

## Current engineering versus commercial decisions — 12 November 2026

**Provider-operation continuation:** [PR #574](https://github.com/WasanthaK/khrental/pull/574) implements the remaining customer/Checkout, portal, preview, cessation-provider and pricing-publication recovery policies. [Operation coverage and evidence boundaries](R5-RECOVERY-IMPLEMENTATION-20261112.md#remaining-provider-operations--pr-574) distinguish source work from staging/production acceptance. Its final-head validation/merge state is recorded on the PR; this is not a deployment or activation record. After this source package is accepted, do not reimplement those paths: next engineering is restore/split and remaining cessation entitlement states, followed by controlled acceptance. Full Workstream 1 still requires accepted staging/operational recovery evidence.


The [canonical plan](EXECUTION-PLAN.md#canonical-current-status--12-november-2026) and [task ledger](R5-LIFECYCLE-ACCEPTANCE-20261105.md#handoff-task-level-dispositions) supersede historical implementation queues below. Forms #561 are deployed at Ready 0000488. Recovery #564–#568/#570/#572 is merged, source-verified and not deployed; #572 passed 1,230 tests, lint and build in [43151088826](https://github.com/WasanthaK/khrental/actions/runs/43151088826).

The [approved discovery corrections/defaults](R5-ENGINEERING-DISCOVERY-20261112.md) authorize engineering of aggregate billing, renewal-only split differences and restoration from restoration time while preserving paid capacity. They do not publish customer terms or resolve remaining merchant, tax, FX, refund or privacy decisions. Restore/split implementation, other cessation states and remaining provider recovery operations are unfinished. Follow the [completed-work/reopening rule](EXECUTION-PLAN.md#completed-work-and-reopening-rule); do not repeat accepted signing, initial billing or form preparation. Production migrations/readiness and live charging remain off.

## Historical implementation and commercial checkpoints


## Implementation reconciliation — 11 November 2026

The [release evidence](R5-INVENTORY-CESSATION-RELEASE-20261110.md) now records tested staged additions and paid active/ending obligations-closed cessation, plus bound readback-only cancellation recovery. These source changes implement parts of the approved behavior below; they do not approve new pricing, FX, refunds, tax, privacy or restoration terms. Production readiness migrations remain pending and rollout/live charging stay OFF.

CM01/CM02 decisions below remain held exactly as drafted. Normal property/unit form preparation integration is merged in PR #561 with full-metadata SQL and browser acceptance. Restoration/splits, other cessation states, broader reconciliation and controlled live acceptance remain open in the [task ledger](R5-LIFECYCLE-ACCEPTANCE-20261105.md). Preserve genuine provider objects and accepted signing; do not manufacture recurring events or repeat sign-in to resolve owner-only evidence.

## Controlling commercial decision pack — 10 November 2026

The 9 November owner decisions and 10 November completion handoff supersede older open questions below about post-expiry management writes, cessation eligibility and the last dwelling. This section prepares exact reviewable choices without publishing a price, changing provider settings or requesting repeated owner input while the owner is away.

### Approved contract retained

| Topic | Controlling treatment |
| --- | --- |
| Base/monthly/no trial | USD 5 per independently rentable managed residential dwelling per month; no trial and no separate listing fee |
| Additions | Server-computed dwelling quantity; ordinary increases prorated onto the next invoice using the accepted preview/confirmation flow |
| Removal | Audited obligations-closed cessation; quantity reduction at next renewal, with no immediate current-period reduction credit |
| Zero stock | Final dwelling schedules cancellation at renewal; retain current billed quantity, never send subscription quantity zero; renewal cannot be restored with empty eligible stock |
| Expiry | Management read-only, including existing-tenancy management writes; retain authorized historical reading and SaaS recovery |
| Cessation | Only after applicable tenancy, financial, maintenance and hold obligations close; tenancy closure/relisting is a different operation |
| Regions/charging | Sri Lanka readiness first; Brunei separately subsequent; live charging remains disabled |

### CM01.3 exact calculation choices prepared, not selected

Retain the owner's LKR 25,000 threshold and 2 percent excess direction. The candidate calculation below is a concrete proposal for the unresolved complete formula; it is not a newly approved commercial rule or a deployed price. No illustrative rate is substituted for an approved FX source.

Let `R` be one dwelling's monthly contractual rent in LKR and `F` the approved LKR-per-USD conversion rate. Candidate per-dwelling monthly fee: USD 5 plus `0.02 × max(R − 25,000, 0) / F`. Proposed rounding: compute using decimal/rational arithmetic, convert once to USD cents using half-up rounding, then sum the per-dwelling rounded charges. A different aggregation/rounding choice needs an explicit decision. Do not use floating-point estimates to settle invoices.

| Monthly dwelling rent | Excess rent above LKR 25,000 | 2% of that excess | Proposed monthly USD cents before tax |
| --- | --- | --- | --- |
| LKR 20,000 | LKR 0 | LKR 0 | 500 |
| LKR 25,000 | LKR 0 | LKR 0 | 500 |
| LKR 25,001 | LKR 1 | LKR 0.02 | `round_half_up(500 + 2/F)` |
| LKR 50,000 | LKR 25,000 | LKR 500 | `round_half_up(500 + 50,000/F)` |
| LKR 100,000 | LKR 75,000 | LKR 1,500 | `round_half_up(500 + 150,000/F)` |

One owner decision remains to bind the exact rent/excess basis, approved FX source, rate observation/fallback time, whether the rate locks per period or price version, and per-dwelling versus invoice rounding. Boundary examples above are symbolic and deterministic; they establish no current exchange rate or tax amount. Existing sandbox USD 5 prices remain unchanged. `parsePricing` deliberately rejects percentage/FX publication until the commercial contract is implemented and approved; a draft `pending` rule must not be published as complete.

### CM01.4–CM01.7 concrete publication and reactivation proposal

| Topic | Reviewable proposed treatment | Required evidence before acceptance/publication |
| --- | --- | --- |
| Version/effective date | Save immutable commercial version with formula, currency, FX convention, rounding, tax presentation, effective UTC instant and approver; preview each customer cohort before publication | Current draft/version/preview controls exist; final commercial percentage implementation and approval are still missing. Never silently reprice existing subscriptions |
| Existing customers | Preserve each existing subscription's recorded commercial version unless a separately approved change and notice process applies | Exact grandfathering/notice decision and a provider/application cohort readback |
| Restore before paid period ends | Restore only through staged inventory authority; show any renewal schedule/resumption change explicitly; no arbitrary reactivation fee. Existing already-paid quantity is not charged twice | Approved timing plus provider preview, quantity/schedule confirmation and staged promotion proof |
| Restore after expiry | Stage stock; require genuine confirmed payment under the approved effective commercial rule before management/public promotion. Prepare either a new period/subscription or a supported provider recovery operation based on actual object status | Owner selects the commercial treatment; source currently rejects duplicate Checkout when an existing subscription binding remains, so post-cancellation reactivation needs engineering rather than a new manual charge |
| Exceptional bulk increase | Preserve ordinary next-invoice additions. If a separate exceptional path is needed, require a stated quantity/value threshold, approving role and visible preview/consent/audit; apply no invented threshold | Supported scope decision that the exception is unnecessary, or one approved explicit threshold/authority rule |
| Credits/refunds | Preserve accepted next-renewal reductions and period-end cancellation. Do not infer a general no-refund policy from absence of immediate removal credits | Approved SaaS refund/credit/dispute treatment reconciled with actual provider settings and customer notice |

Draft customer wording for already approved behavior: **“Your changes will be shown for review before you confirm. Added dwellings are prorated on your next invoice. Approved removals reduce the quantity at renewal. If you stop managing the final dwelling, your subscription ends at the end of the paid period. After access ends, management is read-only; your authorized historical records and subscription recovery remain available.”** Keep it as draft until the complete actual flow and final terms are reviewed. It does not describe renter rent/deposit collection, guarantee tax handling or settle the unresolved refund/reactivation terms.

### CM02 readiness facts and owner-only evidence held

Fresh 10 November connector inventory exposes only the approved Quixo Homes sandbox, `AUTHORIZED_PROVIDER_OBJECT`, with `livemode=false`. Therefore no current live collection/payout/merchant eligibility, actual bank destination, live tax registration or accepted Managed Payments terms is established here. Earlier account properties and fee/tax research below are dated historical observations, not a current live determination. No live account, bank detail, tax toggle, price, subscription or charge was created or edited.

| Item | Exact evidence still needed | Prepared implementation/review boundary |
| --- | --- | --- |
| Intended merchant | Approved legal entity/name/address/country, actual Stripe live account, collection capability, outstanding verification requirements and payout readiness/destination confirmation | Read-only verification first; never substitute another merchant or change bank details to obtain a green status |
| Tax | Merchant/customer country responsibilities, actual applicable registration evidence, tax-inclusive/exclusive presentation and approved SaaS invoice issuer | Verify current authoritative jurisdiction-specific sources after actual business facts are established. Do not enable `automatic_tax` or assert compliance from sandbox settings |
| Privacy roles | Approved service entity/contact; Quixo/organization controller/processor responsibilities for actual operations | Reconcile exact policy text with deployed data processing rather than treating published company pages as substantive approval |
| Providers/transfers | Actual provider account contracts, data locations/jurisdictions, subprocessors and transfer safeguards | Source identifies Azure runtime/SQL, R2 object storage, Evia documents, outbound email and Stripe billing; exact account-specific data locations and transfer facts must be evidenced. A runtime region does not establish all provider storage locations |
| Retention/deletion | Approved purpose-based retention criteria, hold authority, actor verification, backup expiry/restoration limits and response process | Signed/staged Evia evidence remains protected from deletion. No retention period, legal hold expiry, purge or backup guarantee is invented |

### CM02.5 prepared request-handling runbook, operational proof pending

1. Record receipt, request ID, stated scope and requested outcome without copying credentials or excess personal data into the case.
2. Verify the requester using existing authenticated authority; resolve global identity, organization membership and any legally authorized representative separately. Email spelling alone is not proof.
3. Resolve exact record ownership and authorized scope. Identify signed artifacts, financial history, tenancy obligations and actual holds before deciding an action.
4. Record the approved retention/hold decision and actor. When policy, legal authority or scope is unresolved, hold destructive action and continue separable work. Historical access remains governed by its existing permissions.
5. Execute only an authorized action through the existing protected API, with durable audit, consistent storage/database results, failure/retry handling and a verified readback. Use reversible controlled fixtures for operational proof; do not purge real records to demonstrate a workflow.
6. Explain the actual outcome and any retained material/backup limits in a scoped response. Record response time and actor. Do not promise immediate deletion from backups without verified capability and approved policy.

This runbook is preparation, not an invented received request, completed deletion, legal approval or operational acceptance. A controlled end-to-end request and actual backup evidence remain open. The consolidated readiness and task dispositions are in `R5-LIFECYCLE-ACCEPTANCE-20261105.md`.


## Controlling billing test-account decision — 2026-10-27

The owner explicitly confirmed the currently connected **Quixo Homes sandbox**, `AUTHORIZED_PROVIDER_OBJECT`, as the **canonical billing integration test account**. Fresh connector inventory confirms that exact account with `livemode=false`.

**Account selection is CLOSED.** This supersedes the earlier intended-sandbox selection and the account-selection blocker recorded in issue #375 and historical checkpoints. Earlier account IDs and objects remain historical evidence only; do not provision or use them for new canonical B05 work. No relationship between the old accounts is asserted or required to proceed with this newly selected sandbox.

Use the existing approved sandbox catalog and portal; do not recreate duplicates. The latest [read-only readiness checkpoint](BILLING-READINESS-20261027.md) records active sandbox Tax settings, no tax registrations and no registered webhook endpoint. Sandbox selection does not establish live merchant readiness, tax/Merchant-of-Record acceptance or paid-lifecycle acceptance. No Stripe object, credential, business profile, tax registration, subscription, charge, application configuration or replica was changed by recording this decision. Live billing and public signup remain gated.

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
