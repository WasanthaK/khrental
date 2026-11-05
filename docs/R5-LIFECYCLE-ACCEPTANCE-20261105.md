# R5 rental lifecycle acceptance — 5 November 2026

## Current R5 checkpoint — 5 November 2026

[PR #506](https://github.com/WasanthaK/khrental/pull/506) is **implemented, tested and deployed**. Move-in deposits and exit settlements use persisted agreement `terms.currency`; absent/malformed currency is disclosed instead of silently labelling amounts LKR. Historical amounts, agreements and PDFs are unchanged.

All four workflows passed on reviewed head `72a3a22a15675ba72a20ef03573317c457ed7dce`: [authorization/build](https://github.com/WasanthaK/khrental/actions/runs/42023781150) **889/889**, [browser proof](https://github.com/WasanthaK/khrental/actions/runs/42023780887), [rental transaction chain](https://github.com/WasanthaK/khrental/actions/runs/42023781290) and [public listings](https://github.com/WasanthaK/khrental/actions/runs/42023781115). The actual onboarding and settlement screenshots were inspected at 1440px and 390px, including BND and missing-currency states; the LKR/BND/missing/malformed refresh matrix passed. These are fixture checks, not live participant acceptance.

[Release 42024644370](https://github.com/WasanthaK/khrental/actions/runs/42024644370) passed: application build **0024293698963a9eddad7c3c885e9b91f0ded9b7**, Ready revision **0000459**, MSSQL connection ready, min/max replicas **1**. An independent live browser read of `https://app.quixo.homes/build-info.json` matched. Marketing remains at its last recorded **537bef5** release. This is the current application fingerprint; older checkpoints below are historical.

**Next live role: property owner / organization Administrator** for the approved demo move-in/deposit/activation journey. Rentee and assigned maintenance staff are separate acceptance roles. Global/platform administration is for pricing and complimentary controls; the organization owner acts as the sandbox billing customer. Verify the persisted participant and assignment before each switch. Signed-in live acceptance remains **blocked**; no new production deposit, inspection, signature or tenancy activation is claimed.

R1 remains closed; R2 deferred; R3 closed within the single-replica scope; R4 closed for its sandbox foundation. **R5 remains active.** Genuine payment/lifecycle acceptance, production enforcement and merchant/commercial readiness remain open, and live charging remains disabled.

Accepted historical signing/download evidence remains closed.

## Current work and evidence

| Task | Implementation/test state | Deployment/live acceptance | Remaining exit |
| --- | --- | --- | --- |
| 1. Future contract layout and retention | Root causes found in the existing DocumentService used by the Evia upload flow: final-page duplicate footer; no signature clearance. Correction merged in PR #503; real-renderer seven-page PDF and desktop/mobile regression passed. | Originally deployed build 268e409b; retained in current build 0024293. All seven footers and both signature pages inspected. Historical signed agreement untouched. | Provider-positioned signatures and automatic retention of both PDFs on the next authorized signing. |
| 2. Move-in, deposit and activation | Empty checklist incorrectly counted as complete; deposit retries inserted duplicates. Correction adds required item evidence, empty-snapshot repair, reference-based retry protection, atomic ledger/audit, visible ledger and activation retry audit protection. Disposable SQL/browser tests passed, including concurrent checklist initialization, deposit replay/conflict/rollback and activation. | Deployed in current build 0024293, including the agreement-currency correction. No production deposit or inspection was recorded. | Actual approved demo owner/renter/staff acceptance, occupancy/public withdrawal and conflicting activation checks. |
| 3. Active tenancy, maintenance, exit and relisting | Existing services retained. Existing disposable SQL suite passed invoice/payment/receipt and maintenance isolation. PR #504 real-session disposable continuation passed notice acknowledgement, move-out inspection, refund-reference settlement, concurrent closure, stock release, retained history and renter readback. | Settlement currency display deployed in 0024293. Not live accepted; depends on authorized demo activation. | Invoice/receipt, maintenance, notice/settlement/closure/relisting and participant/isolation evidence. |
| 4. Sri Lanka commercial acceptance | R4 foundation retained. Existing pricing decisions unchanged. | Only the Stripe sandbox account is connected; its last recorded Checkout session list was empty. PR #504 company support/policy links are deployed and live-observed; they do not establish Homes-specific commercial approval. Hosted payment and lifecycle acceptance remain unproven. | Full commercial matrix, merchant readiness, tax/disclosure decisions and launch authorization. Live charging remains disabled. |
| 5. Brunei acceptance | Existing country application retained. PR #506 fixes move-in/settlement denomination using stored terms; BND desktop/mobile and refresh fixtures pass. | Currency correction deployed in 0024293; BN live acceptance remains open and sequenced after LK. | Authorized BN fixtures and separate currency/commercial/lifecycle evidence. |

### Account roles for live acceptance

Before every account switch, identify the account, organization, role and intended check; verify the persisted agreement participant or staff assignment before acting.

| Role | Use for | Required scope |
| --- | --- | --- |
| Property owner / organization Administrator | Move-in checklist, labelled demo deposit, explicit activation, invoices, owner maintenance handling, notice/settlement/closure and eligible relisting | The approved demo property's organization |
| Rentee / renter | Own agreement/documents, invoices/receipts, maintenance submission, notice response and retained access | The participant recorded on that agreement |
| Assigned maintenance staff / contractor | Assigned maintenance work, updates and completion | The existing property/job assignment; no expanded permissions |
| Global / platform administrator | Market pricing versions, complimentary controls and platform billing checks | Platform administration; separate from ordinary owner acceptance |
| Organization owner as billing customer | Hosted sandbox Checkout, subscription return/refresh and customer billing management | Only the approved enrolled sandbox organization |

Signed-in participant acceptance remains blocked. A usable approved owner session is the next live prerequisite; the rentee mapping and staff assignment must be verified from persisted records. No credentials are included in this role guide.

## Earlier browser limitation — before PR #506

On 5 November the cloud browser opened the live application, reached its connection-retry screen, and then reached the ordinary email/password sign-in page after one retry. The secure authentication request timed out without a result. The required fresh verification tab returned the connection-retry screen and provided no positive authenticated signal. After application deployment, one bounded reload reached the ordinary sign-in page, confirming no usable authenticated demo session. No credential values were entered through model-visible tooling, and no second credential request was made. This blocks signed-in live acceptance only; implementation and CI continue.

## Verification boundary

- [PR #504](https://github.com/WasanthaK/khrental/pull/504) merged after application [verification/build](https://github.com/WasanthaK/khrental/actions/runs/41993095079), [SQL continuation](https://github.com/WasanthaK/khrental/actions/runs/41993095202) and [public/wake-up browser checks](https://github.com/WasanthaK/khrental/actions/runs/41993095353) passed on head `d01daa2dc393cd4d418392fc76c0b71c87bedf2d`. Public checks covered 44 combinations across 11 pages and 320/390/768/1280px viewports. The 390px and 1280px help screenshots were visually reviewed. These checks use synthetic inventory; no BN live acceptance is claimed.
- [Marketing release 41993738422](https://github.com/WasanthaK/khrental/actions/runs/41993738422) succeeded at source commit `537bef5e40075a2913272264fe592b339b53a420`, preserving the existing Free host. Live [LK help](https://quixo.homes/lk/how-it-works/#help) shows the support email and both company policy links. That marketing release did not redeploy the authenticated app; its then-current build was `268e409b`.
- Live public LK review loaded nine listings and WATER FALL VILLA details with its image, LKR 100,000/month and a listing/country-preserving enquiry link. This narrow read-only observation does not reopen prior registration acceptance or certify the full commercial journey.


- [PR #503](https://github.com/WasanthaK/khrental/pull/503) merged after all five checks passed on reviewed head `6e9ae2450d1ca6168b246b28ebe6ceef1da88385`.
- [Application verification](https://github.com/WasanthaK/khrental/actions/runs/41990594054): **886/886** and build passed. Local focused regression: **32/32**; the local full-suite browser limitation was resolved by the CI runner's installed Chromium.
- [Contract/UI browser proof](https://github.com/WasanthaK/khrental/actions/runs/41990594164): real DocumentService rendered a seven-page contract; one `Page n of 7` footer per page and signature clearance passed. Artifact `r5-contract-onboarding-proof` contains the PDF, geometry and 1440/390px onboarding captures. Both signature pages and both UI captures were visually inspected.
- [Disposable SQL acceptance](https://github.com/WasanthaK/khrental/actions/runs/41990594048): empty-checklist denial and repair, concurrent initialization, deposit duplicate/conflict/rollback, organization isolation, concurrent activation, retained inspection and renter readback passed. The existing billing/maintenance suite passed in the same run.
- [Rental transaction chain](https://github.com/WasanthaK/khrental/actions/runs/41990594065) and [enquiries](https://github.com/WasanthaK/khrental/actions/runs/41990594059) passed.
- [Application release](https://github.com/WasanthaK/khrental/actions/runs/41991277841) succeeded: public build `268e409b33a86b789e8cd6f1e0e767d596b6ac2b`, revision `0000458`, SQL connectivity verified, min/max replicas still 1. Independent public build-info read matches.

Disposable tests use synthetic identities, agreements and labelled simulated money only. They establish neither production signatures nor physical inspection, real funds, new automatic document retention, or live participant acceptance. Stock status in a disposable database is not proof of production marketplace withdrawal/relisting.

The active source already prepares the PDF in `src/services/DocumentService.js` and uploads it through the existing Evia signing flow. This correction repairs that existing renderer; it introduces no document service, dependency or alternate PDF integration. Historical agreement `D13ECCF2-A82A-41DB-9EB7-3AB968440BB0`, signed PDF and audit PDF are not rewritten.

## Remaining enforcement gap

Source review at PR #506 confirms that `entitlement()` is consumed by management-billing summary/complimentary and quantity operations. It is not yet wired across the production rental mutation paths or monthly billing jobs. This correction does not implement those guards. Final enforcement must use the approved commercial contract, preserve historical/rentee access and cover generic writes, imports and alternative paths without silently enabling billing for existing organizations.

## Remaining prerequisites and decisions

- Provider/browser recovery is required for signed-in demo journeys. This is an access blocker, not a request to repeat routine login.
- Real participant authorization/signing for the next contract retention test. Existing signatures are not reused or fabricated.
- Meaningful demo checklist evidence, clearly distinguished from a physical inspection; user-authorized simulated deposits must remain labelled and never be described as real receipts.
- Final unresolved threshold/surcharge/FX, zero-dwelling, cessation and reactivation decisions recovered from and reconciled with the canonical commercial ledger before launch. Do not invent values.
- Evidence of the intended live merchant's eligibility, collection/payout readiness, tax responsibility and launch authorization. Sandbox success cannot supply this evidence.


## Sri Lanka support and commercial boundary

The existing published company contact is `support@quixo.online`, verified against [Quixo contact](https://quixo.online/contact.html). PR #504 adds it to the existing help section and links the already published [company terms](https://quixo.online/terms.html) and [company privacy policy](https://quixo.online/privacy.html) from LK pages. Those policies describe Quixo's company/quote-platform services; linking them does **not** establish Homes-specific rental-document retention terms, tax responsibility, regional merchant readiness or launch approval. No new policy text or commercial default is invented.

Production inventory/entitlement enforcement across alternative writes, jobs and imports remains unfinished engineering work, alongside the genuine Stripe lifecycle acceptance and unresolved commercial decisions. Browser failure does not convert those obligations into accepted results.


## Merchant and enforcement investigation — 5 November

Fresh official Stripe documentation ([eligibility](https://docs.stripe.com/payments/managed-payments/eligibility), [tax coverage](https://docs.stripe.com/payments/managed-payments/tax-compliance)) still requires Stripe's account/product eligibility review. The tax coverage list includes BN and omits LK. Outside covered jurisdictions, the seller retains indirect-tax compliance responsibility. This is a provider-documentation finding, not Quixo-specific eligibility approval or a local tax determination. No legal threshold/rate is inferred or configured. Only the approved sandbox account is connected; intended live merchant collection/payout capability and accepted Managed Payments terms remain unverified.

Source inspection confirms why production enforcement cannot be called complete: `src/api/managementBilling/contract.js` computes entitlements, but the generic MSSQL writer and `src/api/platform/monthlyBillingService.js` do not invoke that billing projection. `store.inventory` reads current property/unit rows; it is not a staged create/import/restore/split/cessation mechanism. Completing these paths must retain approved core rules and the still-unresolved cessation/reactivation/post-cancellation write contract in `QUIXO-STRIPE-B02-B03-READINESS.md`; do not deploy an invented blanket write block or silently activate billing for existing organizations.

## Exact outstanding inputs

1. A usable authenticated approved demo session is required to exercise owner/renter/assigned-staff live journeys. The secure authentication attempt timed out; no second request has been issued. This is not evidence of incorrect credentials or site-wide downtime.
2. Participants must perform the next real signing/consent action when that test reaches it. The completed historical agreement must not be re-signed for this test.
3. Before paid launch, confirm final market threshold/excess/FX/rounding and zero-dwelling/cessation/reactivation/post-cancellation write rules, plus Homes-specific commercial/privacy/retention disclosures. Previously approved USD 5 monthly/no-trial, next-invoice proration, next-renewal reductions, seven-day grace, complimentary access and historical/renter preservation are retained, not re-asked.
4. Supply intended live-merchant eligibility, collection/payout readiness and LK/BN tax-responsibility evidence, followed by regional live-launch authorization only after technical exits pass. Sandbox evidence does not replace these.

Engineering and genuine provider acceptance remain open in addition to these inputs. R5 is not complete; BN acceptance remains after LK, with its own approved fixtures and currency/lifecycle/isolation evidence.
