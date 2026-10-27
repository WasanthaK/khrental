# Billing readiness checkpoint — 2026-10-27

Read-only canonical follow-on while the one-property pilot's human account/recovery and private release configuration dependencies remain open. R1 stays closed; invoice archive R2 and scaling remain deferred. No paid signup, live charging or replica change is authorized by this checkpoint.

## Fresh connector evidence

Only the previously authorized supplemental **Quixo Homes sandbox** is exposed by the Stripe connection, with livemode=false. It remains different from the earlier owner-designated sandbox recorded in issue #375. Their relationship and canonical selection are unconfirmed. No mode or account switch was performed.

| Check | Fresh result | What it does not establish |
| --- | --- | --- |
| Recurring dwelling Price | Active; USD 500 cents; per_unit; monthly interval_count=1; licensed quantity; trial_period_days=null; tax_behavior=unspecified | Application Checkout, invoice collection, correct quantity or entitlement behavior |
| Stripe Tax settings | status=active, livemode=false | Active tax registration, verified legal/head-office data, live collection or Managed Payments acceptance |
| Tax registrations | Empty list; has_more=false | Do not infer registered jurisdictions from active Tax settings |
| Webhook endpoints | Empty list; has_more=false | No Stripe webhook endpoint registered in this connected sandbox; app signature/idempotency acceptance remains open |
| Existing Customer Portal | Active/default; invoice history, payment method and limited customer-detail updates enabled; subscription update, cancellation and pause disabled | Verified application portal-session authorization or an accepted cancellation policy |

The Tax-settings result supersedes the older pending/head_office-missing observation **for this supplemental sandbox only**. The returned profile/address was not independently verified and is not copied into this repository. No tax registration or legal/business profile was created or modified.

## Controlling policy and delivery boundary

USD 5 per actively managed residential dwelling/month, monthly only, no trial. Do not double-count residential parents and child units. Vacancy/publication changes do not change billability. For an existing paid subscription in good standing, mid-cycle additions record proration for the next regular invoice, not an immediate out-of-cycle collection. Reductions apply next renewal; failed renewal has seven-day grace. Preserve historical records and renter access. Audited platform-admin comp is an exception, not public self-service.

Repository issue #375 contains earlier immediate-settlement proposals; its later controlling next-invoice owner decision supersedes them. Do not implement the earlier proposal.

## Next actions

1. Owner confirms whether the currently connected supplemental Quixo Homes sandbox becomes the canonical B05 integration test account, or connects the previously designated account. Do not silently resolve the mismatch or recreate duplicate catalog objects.
2. In the selected isolated sandbox, prepare organization billing-pending setup and server-owned inventory/Stripe reference mapping; paid entitlement remains false until verified initial payment. Zero-dwelling, cessation/reactivation and cancellation details remain explicit decisions.
3. Build the real signed/idempotent webhook endpoint before registering it; do not invent a destination URL. Test duplicate/out-of-order events and independent organization isolation.
4. Add hosted Checkout and quantity reconciliation under the approved next-invoice proration policy, then exercise sandbox lifecycle acceptance.
5. Independently resolve merchant/Managed Payments, customer-country tax coverage and business profile/terms through the authorized owner process before any live paid launch. Active sandbox Tax settings are not that acceptance.

No Stripe writes, Checkout Sessions, subscriptions, customers, webhook endpoints, tax registrations, charges, SQL migrations or application deployments were performed during this audit. No Cloudflare sign-in retry occurred; plugin discovery returned no matching Cloudflare integration. Human ownership/recovery therefore remains open rather than being represented as completed by API object access.

[Master plan](EXECUTION-PLAN.md) · [Current pilot status and cost boundary](ONE-PROPERTY-PILOT-STATUS.md) · [Supporting billing work package #375](https://github.com/WasanthaK/khrental/issues/375)
