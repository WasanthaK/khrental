# R5 rental lifecycle acceptance — 5 November 2026

R1 remains owner-closed; R2 remains deferred; R3 remains closed within the single-replica scope; R4 remains closed for its deployed sandbox foundation. R5 is active. This record supersedes no accepted historical signing/download evidence.

## Current work and evidence

| Task | Implementation/test state | Deployment/live acceptance | Remaining exit |
| --- | --- | --- | --- |
| 1. Future contract layout and retention | Root causes found in the existing DocumentService used by the Evia upload flow: final-page duplicate footer; no signature clearance. Correction merged in PR #503; real-renderer seven-page PDF and desktop/mobile regression passed. | Deployed build 268e409b, revision 0000458. All seven footers and both signature pages inspected. Historical signed agreement untouched. | Provider-positioned signatures and automatic retention of both PDFs on the next authorized signing. |
| 2. Move-in, deposit and activation | Empty checklist incorrectly counted as complete; deposit retries inserted duplicates. Correction adds required item evidence, empty-snapshot repair, reference-based retry protection, atomic ledger/audit, visible ledger and activation retry audit protection. Disposable SQL/browser tests passed, including concurrent checklist initialization, deposit replay/conflict/rollback and activation. | Deployed build 268e409b. No production deposit or inspection was recorded. | Actual approved demo owner/renter/staff acceptance, occupancy/public withdrawal and conflicting activation checks. |
| 3. Active tenancy, maintenance, exit and relisting | Existing services retained. Existing disposable SQL suite passed invoice/payment/receipt and maintenance isolation. A continuation through notice, settlement, closure and stock release is prepared for CI. | Not live accepted; depends on authorized demo activation. | Invoice/receipt, maintenance, notice/settlement/closure/relisting and participant/isolation evidence. |
| 4. Sri Lanka commercial acceptance | R4 foundation retained. Existing pricing decisions unchanged. | Only Stripe sandbox account is connected; current Checkout session list is empty. Published company support/policy links are being added; they do not establish Homes-specific commercial approval. Hosted payment and lifecycle acceptance remain unproven. | Full commercial matrix, merchant readiness, tax/disclosure decisions and launch authorization. Live charging remains disabled. |
| 5. Brunei acceptance | Existing country application retained. Source review found onboarding uses the LKR-only currency helper; separate BN review is required. | Not accepted; sequenced after LK. | Authorized BN fixtures and separate currency/commercial/lifecycle evidence. |

## Browser limitation

On 5 November the cloud browser opened the live application, reached its connection-retry screen, and then reached the ordinary email/password sign-in page after one retry. The secure authentication request timed out without a result. The required fresh verification tab returned the connection-retry screen and provided no positive authenticated signal. Session state remains unknown. No credential values were entered through model-visible tooling, and no second credential request was made. This blocks signed-in live acceptance only; implementation and CI continue.

## Verification boundary

- [PR #503](https://github.com/WasanthaK/khrental/pull/503) merged after all five checks passed on reviewed head `6e9ae2450d1ca6168b246b28ebe6ceef1da88385`.
- [Application verification](https://github.com/WasanthaK/khrental/actions/runs/41990594054): **886/886** and build passed. Local focused regression: **32/32**; the local full-suite browser limitation was resolved by the CI runner's installed Chromium.
- [Contract/UI browser proof](https://github.com/WasanthaK/khrental/actions/runs/41990594164): real DocumentService rendered a seven-page contract; one `Page n of 7` footer per page and signature clearance passed. Artifact `r5-contract-onboarding-proof` contains the PDF, geometry and 1440/390px onboarding captures. Both signature pages and both UI captures were visually inspected.
- [Disposable SQL acceptance](https://github.com/WasanthaK/khrental/actions/runs/41990594048): empty-checklist denial and repair, concurrent initialization, deposit duplicate/conflict/rollback, organization isolation, concurrent activation, retained inspection and renter readback passed. The existing billing/maintenance suite passed in the same run.
- [Rental transaction chain](https://github.com/WasanthaK/khrental/actions/runs/41990594065) and [enquiries](https://github.com/WasanthaK/khrental/actions/runs/41990594059) passed.
- [Application release](https://github.com/WasanthaK/khrental/actions/runs/41991277841) succeeded: public build `268e409b33a86b789e8cd6f1e0e767d596b6ac2b`, revision `0000458`, SQL connectivity verified, min/max replicas still 1. Independent public build-info read matches.

Disposable tests use synthetic identities, agreements and labelled simulated money only. They establish neither production signatures nor physical inspection, real funds, new automatic document retention, or live participant acceptance. Stock status in a disposable database is not proof of production marketplace withdrawal/relisting.

The active source already prepares the PDF in `src/services/DocumentService.js` and uploads it through the existing Evia signing flow. This correction repairs that existing renderer; it introduces no document service, dependency or alternate PDF integration. Historical agreement `D13ECCF2-A82A-41DB-9EB7-3AB968440BB0`, signed PDF and audit PDF are not rewritten.

## Remaining prerequisites and decisions

- Provider/browser recovery is required for signed-in demo journeys. This is an access blocker, not a request to repeat routine login.
- Real participant authorization/signing for the next contract retention test. Existing signatures are not reused or fabricated.
- Meaningful demo checklist evidence, clearly distinguished from a physical inspection; user-authorized simulated deposits must remain labelled and never be described as real receipts.
- Final unresolved threshold/surcharge/FX, zero-dwelling, cessation and reactivation decisions recovered from and reconciled with the canonical commercial ledger before launch. Do not invent values.
- Evidence of the intended live merchant's eligibility, collection/payout readiness, tax responsibility and launch authorization. Sandbox success cannot supply this evidence.


## Sri Lanka support and commercial boundary

The existing published company contact is `support@quixo.online`, verified against [Quixo contact](https://quixo.online/contact.html). Add it to the existing help section and link the already published [company terms](https://quixo.online/terms.html) and [company privacy policy](https://quixo.online/privacy.html) from LK pages. Those policies describe Quixo's company/quote-platform services; linking them does **not** establish Homes-specific rental-document retention terms, tax responsibility, regional merchant readiness or launch approval. No new policy text or commercial default is invented.

Production inventory/entitlement enforcement across alternative writes, jobs and imports remains unfinished engineering work, alongside the genuine Stripe lifecycle acceptance and unresolved commercial decisions. Browser failure does not convert those obligations into accepted results.
