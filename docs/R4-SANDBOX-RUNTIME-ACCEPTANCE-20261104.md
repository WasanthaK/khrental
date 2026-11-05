# R3/R4 current acceptance checkpoint

## Owner closure and handoff — 5 November 2026

After reviewing the evidence and unfinished work below, the owner requested closing R3/R4 and moving to R5. **R3 is CLOSED BY OWNER within the accepted single-replica scope; R4 is CLOSED BY OWNER for the deployed sandbox foundation; R5 is ACTIVE.** The [canonical plan](EXECUTION-PLAN.md) and [delivery ledger](R4-R5-DELIVERY.md) control the next work.

The remaining checks below are retained as pre-scaling or R5 paid-launch prerequisites, not represented as passed or removed. No live charge, scale change, payment acceptance or production enforcement is established by this closure.

## Evidence at closure — 5 November 2026

This checkpoint supersedes older pending-activation and pending-enrollment wording for R4. It preserves the canonical milestone scope: production payment enforcement and commercial launch are separate from sandbox transport and fixture tests.

| Outcome | Verified progress | Still required |
| --- | --- | --- |
| R3 safe registration and account access | Public owner registration/setup, property persistence, bounded account switching and staff access retain their recorded live acceptance. The existing single-replica release scope remains accepted. Platform-admin sign-in and sign-out to a clean login form passed again on 5 November. | Separate multi-replica verification before scaling. The interrupted owner sign-in is unverified; it is not evidence of an application authentication failure. |
| R4 pricing and enrollment | The live platform-admin screen previewed the approved USD 5 monthly/no-trial baseline for one dwelling, saved an LK draft, and enrolled one existing development workspace using the explicit approved sandbox baseline. | Final market thresholds/excess/FX policy and effective published commercial pricing remain open. Draft persistence is not publication. |
| R4 receiver | Sandbox activation, strict migration verification, runtime SQL permissions, exact build identity, signed synthetic acceptance and unsigned rejection passed. | Genuine Stripe-origin payment and lifecycle delivery. A signed synthetic probe does not establish this. |
| R4 complimentary access | [PR #500](https://github.com/WasanthaK/khrental/pull/500) deployed. Adds platform-admin-only fixed expiry, ongoing grants and revocation with version checking and durable audit. Real disposable SQL proves expiry, revoke and stale-write rejection. Actual components reviewed at 390px and 1440px. | Live platform-admin operation remains unverified. This sandbox projection does not enforce paid access across the production application. |
| R4 quantity and recovery | PR #500 confirms schedule ownership, current phase and next-renewal price/quantity by Stripe readback. An unconfirmed reduction stays pending; SQL regression proves retry and later cancellation with synthetic transport. | Actual Stripe increase/decrease, renewal, cancellation and ambiguous-operation acceptance; staged inventory changes across create/import/restore/split paths. |
| R4 paid lifecycle and enforcement | Existing sandbox Checkout, event ledger, portal, reconciliation and entitlement foundation is deployed. No active Stripe subscription was returned during the 5 November check. | Hosted Checkout payment/return/refresh; two-organization isolation; renewal success/failure/recovery and grace expiry; production route/job/import enforcement; preserved history/renter access. |
| R4 merchant readiness | Live charging remains disabled. | Merchant eligibility, collection/payout readiness, tax responsibility and customer-facing commercial terms. |

PR #500 reviewed head: `6b246d24605f2f3be4557a30e96681edc9f24966`; merge: `f98398c3cf275b659ebe71524b595b93f13b93fc`. All four final-head workflows passed: [application build/authorization](https://github.com/WasanthaK/khrental/actions/runs/41972475037), [disposable SQL Server](https://github.com/WasanthaK/khrental/actions/runs/41972475121), [browser desktop/mobile](https://github.com/WasanthaK/khrental/actions/runs/41972475134), and [sandbox readiness](https://github.com/WasanthaK/khrental/actions/runs/41972475093). Screenshots from the same UI source in the prior run were visually reviewed for pricing, subscription and complimentary access. No new database grants, migrations, replicas, live charges or production complimentary grants were applied by PR #500.

Production [deployment 41972688322](https://github.com/WasanthaK/khrental/actions/runs/41972688322) passed: all 881 application tests, production build, ready revision `0000457`, live MSSQL `connection=ready` and exact public build `f98398c3cf275b659ebe71524b595b93f13b93fc`. The separate main-branch disposable SQL proof also passed. Deployment readiness does not replace the still-open hosted payment journey.

The interactive browser became unavailable during the secure owner sign-in. A fresh-tab recovery and connection reset also timed out. Do not infer successful owner sign-in or Checkout, request repeated login into a broken connection, or manufacture payment events. Hosted Checkout and production inventory/entitlement engineering remain in the R5 paid-launch prerequisites. The owner-closed R4 milestone is not reopened by those retained obligations; operational R5 work is the current priority.

Prior milestones are unchanged: R1 remains owner-closed with its recorded narrow waivers; R2 invoice immutability remains owner-deferred and incomplete. R5 retains the accepted demo discovery-through-signing and audit retrieval evidence, with contract layout, meaningful move-in/deposit/activation, active-tenancy/exit and LK-then-BN commercial acceptance still open.

## Runtime activation evidence — 4 November 2026

Sandbox runtime deployment and [activation run 41894911947](https://github.com/WasanthaK/khrental/actions/runs/41894911947) succeeded. The release verified all 18 strict database schema checks, application read/write permissions, matching deployed build, a single serving revision and one-replica configuration. Sandbox credentials were bound through the existing secret mechanism.

The receiver rejected unsigned requests and accepted a correctly signed synthetic probe without business writes. This proves signature transport, not a Stripe-origin payment or event reconciliation.

Two defects were corrected: runtime readiness no longer requires database definition visibility, and the production container installs the tested dependency lockfile. Restricted-identity SQL regression tests and build checks passed. No database grants or dependency versions were changed.

At activation time, development-workspace enrollment and hosted sandbox Checkout remained pending; the enrollment is superseded by the 5 November evidence above. Genuine Stripe event reconciliation, quantity changes, renewal/failure/cancellation, production entitlement and inventory guards, merchant readiness and regional launch remain open. No customer, subscription, payment or workspace enrollment was created by the activation release. Live charging remains disabled. R4 was open at activation; its later owner closure is recorded above. R5 remains active.

Interactive Checkout testing could not continue at this activation checkpoint because the shared browser disconnected. Later enrollment and pricing acceptance is recorded above. This checkpoint intentionally contains no tenant or Stripe account identifiers.
