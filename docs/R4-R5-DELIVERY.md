# R4 and R5 delivery programme

## R5 continuation — 5 November 2026

The owner directed execution of the R5 handoff. A fresh browser reached the ordinary sign-in form after bounded readiness recovery. One secure credential submission returned **Invalid login credentials**; no account reset or repeated credential request followed. The next required role was clarified as **JEERY’S PLACE owner/Administrator, approved alias +514** for move-in/deposit/activation. Rentee and assigned maintenance staff are separate later acceptance roles; Global Admin is for platform pricing/billing. Name the account and purpose before every switch.

Independent source correction now uses persisted agreement `terms.currency` for move-in deposit and exit-settlement displays. It does not infer denomination from the current property market or rewrite historical amounts/documents. Missing or malformed currency is explicitly identified rather than silently shown as LKR. Existing unrelated currency callers keep their previous behavior. Source and focused tests are prepared; CI/browser verification and deployment are pending. No live tenancy, inspection, payment or signature is claimed. R1–R4 scope decisions and single-replica capacity remain unchanged; R5 stays active and live charging disabled.

## R5 deployment checkpoint — 5 November 2026

The five-task [R5 acceptance ledger](R5-LIFECYCLE-ACCEPTANCE-20261105.md) records merged [PR #503](https://github.com/WasanthaK/khrental/pull/503), application CI **886/886**, passing browser/PDF and disposable SQL acceptance, and successful [deployment 41991277841](https://github.com/WasanthaK/khrental/actions/runs/41991277841). Public build **268e409b33a86b789e8cd6f1e0e767d596b6ac2b** is serving from revision **0000458** with live MSSQL connectivity and unchanged single-replica capacity. Future-contract layout and move-in/deposit retry corrections are deployed. Historical signed documents are unchanged.

Signed-in browser acceptance remains blocked: one secure-authentication request timed out, and the post-deployment verification tab reaches the ordinary sign-in page without an authenticated session. No repeated login request was made. [PR #504](https://github.com/WasanthaK/khrental/pull/504) passed disposable SQL exit/settlement/closure/history checks and 44 public page/viewport checks; its support/policy links were deployed by [marketing release 41993738422](https://github.com/WasanthaK/khrental/actions/runs/41993738422) and observed on the live LK help page. Implementation, automated tests, deployment and live participant acceptance remain distinct. R1–R4 retain PR #502's owner decisions; R5 remains active and live charging remains disabled.

## Controlling owner decision — 5 November 2026

The owner requested closing R3/R4 and moving to R5 after the deployed evidence and remaining work were reported. **R3 is CLOSED BY OWNER for its single-replica scope. R4 is CLOSED BY OWNER for the deployed sandbox foundation. R5 is ACTIVE.** This supersedes the 4 November instruction to progress both milestones as open workstreams.

Closure accepts the recorded scope and changes the execution priority. It does not certify genuine Stripe payment acceptance, production paid-access enforcement, merchant readiness or scaling. The unfinished obligations are retained below as R5 paid-launch prerequisites or pre-scaling checks. They do not block the operational rental journey from proceeding.

## Accepted R4 foundation

| Outcome | Accepted evidence at owner closure | Carried-forward paid-launch work |
| --- | --- | --- |
| R4.1 Global Admin pricing | Market versions, UTC effective dates, minor-unit preview, audit and concurrency checks; live USD 5 preview and persisted LK draft; one development workspace enrolled | Final thresholds/excess/FX policy and effective commercial publication |
| R4.2 Sandbox Checkout | Deployed organization/customer/session/subscription binding, server-derived inventory and pinned catalogue; credentials configured | Genuine hosted Checkout payment and return/refresh, two-organization acceptance |
| R4.3 Webhooks | Registered receiver activated; strict schema/runtime permissions, signed synthetic probe and unsigned denial passed; SQL duplicate/concurrent/isolation proof | Genuine Stripe-origin events, retry/out-of-order and lifecycle reconciliation |
| R4.4 Quantity lifecycle | Server inventory counting, proration/deferred reduction commands, confirmed schedule readback and durable retry proof | Actual Stripe quantity/proration/renewal testing; staged create/import/restore/split/cessation with no generic-write bypass |
| R4.5 Entitlements and complimentary access | Initial-payment/grace/cancellation/risk projection plus audited grant/revoke/expiry controls deployed; SQL and desktop/mobile evidence | Live complimentary operations; production guards and asynchronous reconciliation across routes, jobs and imports |
| R4.6 Renewal/cancellation | Deployed reconciliation and period-end cancellation; synthetic schedule-decrease/cancellation/recovery proof | Genuine renewal success/failure/recovery, seven-day expiry, cancellation, payment-method update and history/renter preservation |
| R4.7 Merchant readiness | Selected sandbox/catalogue retained; live collection remains disabled | Merchant eligibility, tax responsibility, collection/payout readiness, commercial terms and unresolved lifecycle policies |

Evidence: [R3/R4 closure checkpoint](R4-SANDBOX-RUNTIME-ACCEPTANCE-20261104.md), deployed [PR #500](https://github.com/WasanthaK/khrental/pull/500) and successful [deployment](https://github.com/WasanthaK/khrental/actions/runs/41972688322). All 881 merged application tests passed. Acceptance types remain distinct: real application observations, disposable SQL/browser fixtures, synthetic Stripe transport and genuine hosted payment events are not interchangeable.

## Active R5 execution ledger

| Work item | Current evidence | Remaining exit / next action |
| --- | --- | --- |
| R5.1 Contract design and completion artifacts — **FIX DEPLOYED; LIVE RETENTION OPEN** | Historical demo discovery-through-signing/download acceptance retained. PR #503 layout fix deployed at 268e409b; seven-page render and desktop/mobile evidence reviewed | Verify provider-placed signatures and automatic signed/audit retention on the next legitimate signing. Preserve the historical signed PDF. |
| R5.2 Move-in and activation | PR #503 required-item checklist, deposit retry/ledger and activation retry fixes deployed; disposable concurrent/isolation/rollback acceptance passed | Meaningful checklist evidence, authorized deposit ledger/readback, explicit tenancy activation, occupancy and public-stock withdrawal. An empty checklist is not inspection evidence; any authorized simulation must be labelled. |
| R5.3 Ongoing tenancy and exit | PR #504 disposable continuation passed notice acknowledgement, inspection, refund-reference settlement, concurrent closure, stock release, retained history and renter access; existing invoice/payment/maintenance suite also passed | Complete the same demo journey through invoice, payment/receipt, maintenance, notice/exit, settlement and eligible relisting with history and actor/workspace isolation. |
| R5.4 Sri Lanka commercial acceptance | Scoped LK browsing and operational journey results retained | Consolidated desktop/mobile content/UX/UI/usability, country currency/date/notifications, support, terms, privacy/retention, unavailable/withdrawn-stock cases and applicable paid-launch prerequisites below. |
| R5.5 Brunei rollout | Regional surface partially prepared | Follow Sri Lanka acceptance with country-specific commercial and complete lifecycle verification. LK results do not establish BN acceptance. |
| R5.6 Paid-launch prerequisites carried from R4 | Sandbox foundation accepted and milestone owner-closed | Complete every carried-forward item in the R4 table before live paid launch: genuine payment lifecycle; inventory/entitlement enforcement; final commercial/lifecycle policies; merchant/tax/collection readiness. Operational R5 work continues while these remain open. |

Execution order: **future-contract layout → meaningful move-in/deposit/activation → ongoing tenancy/exit/relisting → Sri Lanka launch acceptance → Brunei**. Paid-launch prerequisites must pass before collecting live subscription payments; they are not a reason to repeat accepted R3/R4 work or pause the operational journey. Issue [#459](https://github.com/WasanthaK/khrental/issues/459) remains the active operational tracker.

R1 remains owner-closed with its recorded narrow waivers. R2 invoice immutability remains owner-deferred and incomplete. Multi-replica R3 verification remains a separate mandatory pre-scaling check. Live charging remains disabled. No runtime flag, access grant, payment, tenancy, capacity or deployment change is made by this status decision.

## Current sandbox bindings

- Account: `acct_1UTgcdQ4sARuLNQa`, `livemode=false`. Account selection is closed.
- Approved baseline product: `prod_VUjs23Auy0fWYE`; price: `price_1UTkOuQ4sARuLNQaJnbZ03Hs`, USD 5 monthly licensed quantity, no trial.
- Portal: `bpc_1UTku3Q4sARuLNQanUojlMVj`, payment methods/customer details/invoice history; direct subscription changes, cancellation and pause disabled.
- Current receiver configuration/activation and 5 November enrollment evidence are recorded in the closure checkpoint. The older zero-webhook snapshot is superseded by the registered, activated receiver. Merchant/tax readiness is not established by sandbox configuration.
- Reuse the selected baseline and restricted portal; do not duplicate catalogue objects.

## Retained runtime procedure — use only for the applicable paid-launch work

Keep credentials exclusively in the existing GitHub/Azure secret mechanism. Never put secret keys in Vite variables, source files, browser storage, logs, canonical documents or chat.

1. Review and verify source, migration and UI. Run the governed SQL Server execution proof and required authorization/build checks.
2. Deploy the disabled runtime and apply `20261103_01_management_billing` with the dedicated migration executor; strictly verify every managed migration.
3. Configure `STRIPE_SANDBOX_SECRET_KEY` (selected account test key), `STRIPE_SANDBOX_ACCOUNT_ID`, and `STRIPE_SANDBOX_WEBHOOK_SECRET` using secrets. `PUBLIC_APP_URL` must be the approved HTTPS application origin.
4. Enable schema readiness only after verification. Enable sandbox billing only after account readback matches. The callback path is `/api/management-billing/webhook`; register it only after the deployed receiver is verified.
5. Explicitly enroll approved development workspaces. Select an effective published market version or explicitly choose the approved baseline for sandbox testing. No automatic market fallback or repricing of existing organizations.
6. Exercise two-organization hosted Checkout, complete event delivery, quantity changes, renewal failure/recovery, cancellation, comp and preserved historical/renter access. Record actual test evidence.
7. Complete production inventory/entitlement enforcement and the merchant/regional launch decisions before any live rollout. Sandbox keys cannot be used to establish live readiness.

## R5 paid-launch commercial decisions carried from R4

Retain the approved monthly/no-trial, next-invoice proration, next-renewal reduction, seven-day grace and historical/renter preservation rules. Remaining commercial decisions are final LK/BN thresholds, excess-rate/FX/rounding policy, zero-dwelling/cessation/reactivation details, cancellation disclosures, unusual bulk-increase controls and merchant/tax responsibility. Research examples are not defaults. Do not silently select Managed Payments or a tax-liability fallback.

Evidence references: [canonical execution plan](EXECUTION-PLAN.md), [billing contract](QUIXO-HOMES-STRIPE-SAAS-BILLING.md), [billing readiness](BILLING-READINESS-20261027.md), [one-property pilot](ONE-PROPERTY-PILOT-STATUS.md), and GitHub issues #375 and #459.

## Historical sandbox release evidence — 4 November 2026

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

### Runtime readiness correction — 2026-11-04

Release 41890029841 and diagnostic preflight 41892510734 stopped before secret binding or activation. Strict executor verification passed, while the application identity had all required DML permissions and no VIEW DEFINITION permission on the five billing tables. Hidden filtered-index/check definitions caused the runtime structural inspector to report a false failure. Runtime readiness now uses zero-row column access plus required DML permission checks, following the enquiry readiness pattern. Full structural acceptance remains mandatory through the isolated executor; no database grants change. Disposable SQL regression coverage reproduces hidden definitions and rejects missing audit-write or read access. This correction alone does not prove Stripe delivery or Checkout acceptance.
