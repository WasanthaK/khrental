# R5 rental lifecycle acceptance — 5 November 2026

R1 remains owner-closed; R2 remains deferred; R3 remains closed within the single-replica scope; R4 remains closed for its deployed sandbox foundation. R5 is active. This record supersedes no accepted historical signing/download evidence.

## Current work and evidence

| Task | Implementation/test state | Deployment/live acceptance | Remaining exit |
| --- | --- | --- | --- |
| 1. Future contract layout and retention | Root causes found in the existing DocumentService used by the Evia upload flow: final-page duplicate footer; no signature clearance. Scoped correction prepared, with real-renderer multipage/browser regression. | Pending release and rendered artifact review. Historical signed agreement untouched. | Provider-positioned signatures and automatic retention of both PDFs on the next authorized signing. |
| 2. Move-in, deposit and activation | Empty checklist incorrectly counted as complete; deposit retries inserted duplicates. Correction adds required item evidence, empty-snapshot repair, reference-based retry protection, atomic ledger/audit, visible ledger and activation retry audit protection. Disposable SQL/browser tests prepared. | Pending CI/deployment; no production deposit or inspection was recorded. | Actual approved demo owner/renter/staff acceptance, occupancy/public withdrawal and conflicting activation checks. |
| 3. Active tenancy, maintenance, exit and relisting | Existing services retained. | Not live accepted; depends on authorized demo activation. | Invoice/receipt, maintenance, notice/settlement/closure/relisting and participant/isolation evidence. |
| 4. Sri Lanka commercial acceptance | R4 foundation retained. Existing pricing decisions unchanged. | Only Stripe sandbox account is connected. Hosted Checkout/payment and lifecycle acceptance remain unproven. | Full commercial matrix, merchant readiness, tax/disclosure decisions and launch authorization. Live charging remains disabled. |
| 5. Brunei acceptance | Existing country application retained. Source review found onboarding uses the LKR-only currency helper; separate BN review is required. | Not accepted; sequenced after LK. | Authorized BN fixtures and separate currency/commercial/lifecycle evidence. |

## Browser limitation

On 5 November the cloud browser opened the live application, reached its connection-retry screen, and then reached the ordinary email/password sign-in page after one retry. The secure authentication request timed out without a result. The required fresh verification tab returned the connection-retry screen and provided no positive authenticated signal. Session state remains unknown. No credential values were entered through model-visible tooling, and no second credential request was made. This blocks signed-in live acceptance only; implementation and CI continue.

## Verification boundary

Local focused regression: 32/32 pass. Full local suite: 885/886 pass; the single browser test cannot launch because its Chromium executable is unavailable. CI must pass before merge. Disposable tests use synthetic identities, agreements and labelled simulated money only, never production records, signatures or physical inspection evidence.

The active source already prepares the PDF in `src/services/DocumentService.js` and uploads it through the existing Evia signing flow. This correction repairs that existing renderer; it introduces no document service, dependency or alternate PDF integration. Historical agreement `D13ECCF2-A82A-41DB-9EB7-3AB968440BB0`, signed PDF and audit PDF are not rewritten.

## Owner-only prerequisites

- A functioning secure demo session for the live owner/renter/staff journeys; do not request routine login repeatedly.
- Real participant authorization/signing for the next contract retention test. Existing signatures are not reused or fabricated.
- Meaningful inspection evidence or an explicitly agreed simulated inspection scope; simulated deposits alone do not prove a physical inspection.
- Final unresolved threshold/surcharge/FX, zero-dwelling, cessation and reactivation decisions recovered from and reconciled with the canonical commercial ledger before launch. Do not invent values.
- Evidence of the intended live merchant's eligibility, collection/payout readiness, tax responsibility and launch authorization. Sandbox success cannot supply this evidence.
