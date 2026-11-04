# R4 and R5 delivery programme

## Controlling execution instruction — 4 November 2026

The owner requested completion of R4 (paying property-management organizations) and R5 (marketplace and regional rollout). This authorizes progressing independent subscription engineering alongside the remaining rental lifecycle work. It supersedes the former blanket instruction to postpone all subscription implementation until website completion. It does not establish merchant readiness or authorize live customer charges, invented commercial decisions or fabricated tenancy evidence.

Sri Lanka is the first commercial acceptance market; Brunei follows it. Keep one canonical programme and record evidence against the outcomes below. Existing R1 closure, R2 owner deferral and R3 single-replica acceptance remain scoped as previously recorded.

## Completion ledger

| Outcome | Current evidence | Remaining acceptance |
| --- | --- | --- |
| R4.1 Global Admin pricing | Draft implementation: market versions, UTC effective dates, minor-unit amounts, threshold decisions, preview, audit and optimistic concurrency | SQL execution proof, rendered review, platform-admin live acceptance; approved market thresholds and excess/FX policy |
| R4.2 Sandbox Checkout | Draft implementation binds organization/customer/session/subscription IDs, derives quantity on the server, reuses the approved catalogue and pins existing subscription pricing | Configured runtime credentials, a real sandbox hosted Checkout payment and return/refresh acceptance |
| R4.3 Webhooks | Draft implementation validates raw-body signatures and timestamps, retrieves authenticated Stripe events, deduplicates in SQL and reconciles current subscription/invoice state | Registered verified endpoint, delivery/retry/out-of-order/concurrent SQL proof and actual sandbox event evidence |
| R4.4 Quantity lifecycle | Draft inventory and preview/quantity commands; occupied/vacant and public visibility do not change count; parent/children counted once | Durable command recovery and verified proration/schedule readback; staged activation/cessation across create/import/restore/split paths; no bypass through generic writes |
| R4.5 Entitlements and comp | Initial-payment, seven-day grace, cancellation and risk-hold projection drafted; existing development access is preserved | Production operation guards, admin comp grant/revoke/expiry workflow, asynchronous reconciliation, every route/job/import covered |
| R4.6 Renewal/cancellation | Sandbox renewal reconciliation and period-end cancellation drafted | Test-clock success/failure/grace expiry, scheduled decrease plus cancellation, interrupted command recovery, payment method update and preserved renter access |
| R4.7 Merchant readiness | Selected sandbox and catalogue verified; live collection is disabled | Merchant/MoR eligibility and terms, verified support/business details, country tax responsibility, live collection/payout readiness and customer-facing terms |
| R5.1 Discovery through signing | Scoped demo acceptance already recorded; current signed document and audit PDF download passed | Preserve these accepted results; template formatting review is distinct from an assumed signing application defect |
| R5.2 Move-in and activation | Deposit and move-in readiness guards exist | Meaningful inspection/checklist evidence, an actual authorized deposit record, activation and occupied-stock withdrawal |
| R5.3 Ongoing tenancy and exit | Existing billing/payment/maintenance and exit implementations have automated coverage | Complete the agreed end-to-end demo: invoice, payment/receipt, maintenance, exit, settlement and relisting; distinguish synthetic fixtures from actual operational evidence |
| R5.4 Sri Lanka commercial acceptance | Operational website testing active | Country content/currency/date/notifications, landlord/renter support, commercial terms, privacy/retention, subscription and operational launch checklist |
| R5.5 Brunei acceptance | Regional surface partially prepared | Repeat country-specific commercial and lifecycle acceptance after Sri Lanka; do not infer acceptance from LK results |

Neither R4 nor R5 is closed by source preparation or a green unit test suite. The current implementation is deliberately restricted to platform-admin-enrolled `development-testing` organizations and the selected sandbox. Billing projections do not yet replace application authorization.

## Current sandbox bindings

- Account: `acct_1UTgcdQ4sARuLNQa`, `livemode=false`. Account selection is closed.
- Approved baseline product: `prod_VUjs23Auy0fWYE`; price: `price_1UTkOuQ4sARuLNQaJnbZ03Hs`, USD 5 monthly licensed quantity, no trial.
- Portal: `bpc_1UTku3Q4sARuLNQanUojlMVj`, payment methods/customer details/invoice history; direct subscription changes, cancellation and pause disabled.
- Fresh read-only check: active baseline price and portal confirmed; zero webhook endpoints and zero tax registrations. A second existing unnamed USD 5 price was observed and is not the canonical binding.
- No new Stripe customer, subscription, payment, webhook registration or tax record was created by that inspection.

## Runtime configuration and release sequence

Keep credentials exclusively in the existing GitHub/Azure secret mechanism. Never put secret keys in Vite variables, source files, browser storage, logs, canonical documents or chat.

1. Review and verify source, migration and UI. Run the governed SQL Server execution proof and required authorization/build checks.
2. Deploy the disabled runtime and apply `20261103_01_management_billing` with the dedicated migration executor; strictly verify every managed migration.
3. Configure `STRIPE_SANDBOX_SECRET_KEY` (selected account test key), `STRIPE_SANDBOX_ACCOUNT_ID`, and `STRIPE_SANDBOX_WEBHOOK_SECRET` using secrets. `PUBLIC_APP_URL` must be the approved HTTPS application origin.
4. Enable schema readiness only after verification. Enable sandbox billing only after account readback matches. The callback path is `/api/management-billing/webhook`; register it only after the deployed receiver is verified.
5. Explicitly enroll approved development workspaces. Select an effective published market version or explicitly choose the approved baseline for sandbox testing. No automatic market fallback or repricing of existing organizations.
6. Exercise two-organization hosted Checkout, complete event delivery, quantity changes, renewal failure/recovery, cancellation, comp and preserved historical/renter access. Record actual test evidence.
7. Complete production inventory/entitlement enforcement and the merchant/regional launch decisions before any live rollout. Sandbox keys cannot be used to establish live readiness.

## Decisions still needed for commercial release

Retain the approved monthly/no-trial, next-invoice proration, next-renewal reduction, seven-day grace and historical/renter preservation rules. Remaining commercial decisions are final LK/BN thresholds, excess-rate/FX/rounding policy, zero-dwelling/cessation/reactivation details, cancellation disclosures, unusual bulk-increase controls and merchant/tax responsibility. Research examples are not defaults. Do not silently select Managed Payments or a tax-liability fallback.

Evidence references: [canonical execution plan](EXECUTION-PLAN.md), [billing contract](QUIXO-HOMES-STRIPE-SAAS-BILLING.md), [billing readiness](BILLING-READINESS-20261027.md), [one-property pilot](ONE-PROPERTY-PILOT-STATUS.md), and GitHub issues #375 and #459.

## Sandbox release evidence — 4 November 2026

PR #494 merged at `f946074acf37c0380b049688aed23b1d681791a7` as a disabled sandbox foundation. Its seven CI workflows passed, including real SQL migration/concurrency and two-organization recovery tests with synthetic Stripe transport. The full authorization suite passed 875 tests, and the pricing/subscription views passed desktop/mobile checks; the enrollment section was visually reviewed. These do not close live rental acceptance.

The owner saved the sandbox API key and endpoint signing secret. Read-only job `126775402416` confirmed secret presence, the selected account/catalogue/restricted portal, and the registered webhook. Its legacy `sandboxRuntimeReady` label represents configuration discovery only: deployed receiver readiness and Stripe-origin signed delivery were not established by that job.

Release order:

1. Wait for the accepted source SHA to be the Ready application revision.
2. Run **Run production database migrations** on `main`, mode `apply`, through `20261103_01_management_billing`, confirmation `APPLY-PRODUCTION`. This uses the existing dedicated migration executor and never upgrades the runtime identity.
3. Run **Management billing sandbox release controls** on `main`, mode `sandbox`, expected_build equal to the accepted serving SHA, confirmation `ENABLE-SANDBOX-BILLING`.
4. The release workflow requires strict migration verification, exact public/image build agreement, one-replica configuration and runtime table permissions before binding secrets and enabling only sandbox flags. Failure after enablement disables both billing flags again.
5. Its signed synthetic transport probe verifies HMAC transport and unsigned denial without customer/database mutations. It is not Stripe-origin event acceptance and must not be reported as a real Checkout/payment test.
6. Complete an explicitly enrolled demo organization's hosted sandbox Checkout and confirm real Stripe event reconciliation before claiming end-to-end acceptance.

Rollback: run the same release workflow with mode `rollback` and confirmation `CLOSE-SANDBOX-BILLING`. Existing renter and development access remains governed by existing authorization.
