# One-property public pilot — current canonical status

Updated 2026-10-27 (Asia/Colombo). The [master program plan](EXECUTION-PLAN.md) retains program scope; this redacted companion reconciles the current pilot evidence and supersedes its earlier readiness/OFF checkpoints.

## Owner acceptance and next package — 2026-10-27

The owner confirmed the property is visible and instructed moving on. The bounded public browsing pilot is **OWNER-ACCEPTED / LIVE**. Do not repeat its private review, publication, country/media or browsing checks solely for another checklist tick. Public withdrawal/cache and operational handover remain honest follow-ups; they are parked from the immediate critical path under this move-on instruction, not falsely marked passed.

**NOW: paying-organization setup (B04-owner/B05)** — verified owner identity, isolated billing-pending organization, server-owned dwelling quantity and Stripe linkage, then sandbox Checkout, signed/idempotent webhooks and paid entitlements. Reuse the owner-confirmed canonical billing sandbox and existing catalog; no duplicate setup. Keep public signup/live billing and scaling under their existing gates.

## Current result: approved pilot LIVE

The owner explicitly approved public visibility of the reviewed single property, permitted fields and one approved exterior derivative. [Open the live Sri Lanka pilot](https://quixo.homes/lk/search/?type=residential).

[Activation #40545952854](https://github.com/WasanthaK/khrental/actions/runs/40545952854) PASS. Exact configured scope was installed and verified in a ready revision before anonymous listing/media gates opened. The verifier accepted exactly one reviewed listing/photo, exact saved public projection, empty BN inventory, country/unrelated-ID denial, anonymous/CORS/no-store boundaries and safe WebP delivery. Temporary management/preparation/review remained OFF.

[Website #439](https://github.com/WasanthaK/khrental/pull/439) merged at `6ca8166b8d573e55b49e270048d33f4478ea142f`; [marketing deployment #40546437978](https://github.com/WasanthaK/khrental/actions/runs/40546437978) PASS. Actual quixo.homes browser acceptance showed one real residential card, the approved photo loaded, the saved rent rendered and no sample-results links on Sri Lanka search. Commercial selection showed no residential card. Switching to Brunei retained the category and showed its illustrative page with the live-feed flag false and no real pilot card. Returning to residential restored the one live listing.

The site's existing hostname and custom domain are visible. Homepage notices identify the limited Sri Lanka pilot and keep other illustrative examples explicit. Signup, viewing enquiries, payments and additional search filters remain unavailable. LK search is enabled; BN and homepage feed flags remain disabled.

## Deployment and cost boundary

[Read-only production audit #40546580955](https://github.com/WasanthaK/khrental/actions/runs/40546580955) PASS:
- Serving app build `d80e8c49b60fdff415f2869a93542934c9560d0d`, latest/ready revision `khrental-app--0000399`.
- Revision mode Single, minReplicas=1, maxReplicas=1.
- One active revision, one running replica, 100% traffic; app and MSSQL health passed.
- Restart false. No scale change or extra test replica; none required shutdown.

Scaling and distinct-replica acceptance remain owner-deferred and do not block this single-replica pilot. Any future authorized temporary test capacity must be removed afterward and actual inventory/limits verified. Existing production costs remain; zero total hosting/SQL/storage/GitHub cost is not claimed.

## Preparation and retained evidence

- Private export [#438](https://github.com/WasanthaK/khrental/pull/438) deployed successfully in [#40537493730](https://github.com/WasanthaK/khrental/actions/runs/40537493730). It exports only the authorized eligible public projection and exactly one approved photo, omitting source/private fields.
- Protected GitHub Production setting `R4_PILOT_EXPECTED_PUBLIC_JSON` was saved and its metadata verified. Actual property values, identifiers and image references are omitted here.
- Private access #40540078231 and final private shutdown #40541016227 passed before activation. Original photo, property, occupancy, rent and agreements were unchanged.
- Direct Cloudflare bucket privacy audit #40494891305 attempt 3 remains PASS; do not repeat it absent a relevant configuration change. Human ownership/recovery custody remains an unverified operational handover follow-up, not an unresolved bucket privacy fault.
- Current website head `0cdeb7c409505f4a2a12ed8a7894fd58d103e890` passed application, R4/privacy/SQL/native-photo and isolated browser acceptance before merge. Browser fixtures were synthetic and external production requests blocked.

Initial activation #40545316163 stopped on an HTTP 503 before cloud mutation. SQL readiness subsequently returned ready. Workflow-only commit `10c28151b9862775a83a4e817678af1b3f9be12f` adds bounded HTTP-unavailability retries before mutation and a fresh-revision SQL health check before catalog acceptance, preserving exact build/scope/field/privacy assertions. The underlying cause of the transient 503 is not established; the failed run remains historical evidence.

Earlier private setup #40536577750 encountered Azure throttling; intermediate shutdown #40537376249 was cancelled as the private-export app deployment acquired concurrency. Later successful access/shutdown and the live activation/audit above establish current state. Earlier draft-only website assertions and one category-test selector error were corrected before green merge; no production exposure was inferred from failed tests.

## Remaining canonical work

| Priority | Work | Disposition |
| --- | --- | --- |
| Completed | Exact private listing/photo review, protected manifest, single-property activation and real-site browsing | LIVE / accepted for this bounded pilot |
| Parked follow-up | Public per-photo withdrawal/cache/takedown lifecycle and controlled rollback acceptance after actual public delivery | OPEN; prior private withdrawal evidence is retained; no public photo withdrawal/deletion was performed in this publication |
| Follow-up | Human ownership/recovery custody and any external proxy/cache operational handover | OPEN; keep separate from the completed direct-bucket privacy audit |
| 1 — NOW | Verified billing-pending owner organization, Checkout, signed/idempotent webhooks and server-owned quantity/entitlement lifecycle | ACTIVE; canonical billing sandbox selection is owner-confirmed, existing sandbox catalog retained |
| Following | Marketplace/enquiry journey and staged Sri Lanka/Brunei regional paid-launch acceptance | OPEN |
| Parked | Scaling/distinct-replica proof, invoice archive R2, expanded copy and general signup activation | Preserve existing decisions and evidence |

R1 remains owner-closed. R3 remains conditionally accepted for one replica with general signup OFF. Invoice archive R2 remains owner-deferred. Public pilot visibility does not close paid billing or regional launch.

## Emergency stop

Use [One-property public pilot controls](../.github/workflows/one-property-public-pilot.yml), branch main, mode rollback, confirmation ROLLBACK. It disables anonymous and temporary administrator gates without depending on app build health or the private fixture, then verifies denial. Preserve exact scope until public gates are safely off. Revert the #439 marketing package if the public site must also return to the prior design-only state. Record actual outcome; interrupted or unverified rollback requires immediate operator action.

Private historical property details in the master/supporting files were preserved after earlier automatic privacy-review blocks; they were not recopied by this reconciliation.
