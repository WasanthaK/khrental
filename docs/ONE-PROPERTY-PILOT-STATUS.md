# One-property pilot — current release preparation status

Updated 2026-10-27. The existing [master plan](EXECUTION-PLAN.md) retains program authority. This redacted companion records current evidence and the owner's latest priority/cost decision without reproducing private property data.

## Exact pilot release configuration ready — 2026-10-27

[Private export #438](https://github.com/WasanthaK/khrental/pull/438) merged and [application deployment #40537493730](https://github.com/WasanthaK/khrental/actions/runs/40537493730) PASS at serving build `d80e8c49b60fdff415f2869a93542934c9560d0d`. The authenticated read-only field combines only the eligible saved public projection and exactly one approved derivative, excluding private/source data. Twelve boundary tests, existing browser photo lifecycle, native image, SQL isolation and application checks passed.

[Private access #40540078231](https://github.com/WasanthaK/khrental/actions/runs/40540078231) PASS. The exact reviewed manifest was read from that field and saved as `R4_PILOT_EXPECTED_PUBLIC_JSON` in the repository's GitHub Production environment; UI metadata confirmed the new protected setting exists. No value, private identifier, rent or image reference is copied here. [Final shutdown #40541016227](https://github.com/WasanthaK/khrental/actions/runs/40541016227) PASS. Independent anonymous listing and selected-photo endpoint checks both returned PUBLIC_LISTINGS_DISABLED afterward. No property, photo approval, original, occupancy or agreement edit was made.

[Draft website release #439](https://github.com/WasanthaK/khrental/pull/439) is prepared, unmerged, all current checks green at head `0cdeb7c409505f4a2a12ed8a7894fd58d103e890`. Sri Lanka search uses the existing guarded feed, category choice and accurate limited-pilot labels; it removes sample results from real search and shows unavailable state on feed failure. Brunei and other feed flags stay off. Browser verification uses localhost synthetic responses only, blocks actual remote requests and covers responsive layouts, exact rendering, category choice, country navigation and failure handling.

Owner reports both public addresses reach the same site; actual browser interaction additionally confirmed `https://quixo.homes/lk/search/` resolves to the public search page. Domain visibility is accepted. The completed Cloudflare direct-bucket privacy audit remains accepted and must not be repeated. The separate human ownership/recovery handover remains an explicitly unverified operational follow-up, not a newly diagnosed storage fault.

**Immediate next decision:** explicit approval to expose exactly the privately reviewed property, permitted fields and one exterior derivative publicly, then activate the single-listing API/media scope, pass anonymous acceptance and merge/deploy #439. Until then anonymous access and temporary controls remain OFF. The protected fixture is configured; do not repeat private photo acceptance or catalog setup. Scaling remains deferred; no extra test replica was created.

Historical execution notes: private setup #40536577750 encountered Azure Too Many Requests; intermediate shutdown #40537376249 was cancelled as the app deployment acquired production concurrency. Later successful private access and final shutdown above establish the final state; those earlier runs are not rewritten as successful. Initial website checks correctly rejected the dormant-only expectation, and a later added category-count assertion had a test-selector error; corrected current checks are green. No public pilot acceptance is claimed from those source tests.

## Owner decision: defer scaling, continue the remaining canonical work

Scaling and distinct-replica acceptance are deferred. The existing single-replica technical acceptance is sufficient to continue the current bounded pilot preparation; the multi-replica gate stays open for a future scaling decision. No new replica or scale-up is required now. General signup remains OFF.

If a future separately authorized test temporarily adds replicas, remove the extra test capacity afterward and verify the actual active revision/replica inventory and limits. Do not leave test replicas running. This avoids ongoing additional replica costs; it does not establish zero total Azure/GitHub/SQL/storage costs or authorize shutting down the existing production app.

## Current verified deployment and cost boundary

[Read-only audit #40533092490](https://github.com/WasanthaK/khrental/actions/runs/40533092490) PASS: revision mode Single, minReplicas=1, maxReplicas=1, one active revision, one running replica and 100% traffic. No extra replica required shutdown. Restart remained false; no scaling, traffic override or app deployment occurred. Serving build `f631e7902a4fdae736a47ed6207271c503d81db9`, latest/ready revision 0000392; app and MSSQL health passed.

[PR #437](https://github.com/WasanthaK/khrental/pull/437) merged at `d4aa82081e0239578e3b0bf2b79da9383bc7ef9e`. Manual release controls, anonymous verifier and emergency rollback are now on main; [release/withdrawal runbook](ONE-PROPERTY-PUBLIC-PILOT.md). It did not activate publication or redeploy the application.

[Disabled-state verification #40533333116](https://github.com/WasanthaK/khrental/actions/runs/40533333116) PASS: exact serving build, app/SQL health and LK/BN anonymous inventory denied. Earlier #40532918290 stopped on an HTTP 503 before cloud login/mutation and remains failed evidence. A direct subsequent MSSQL check and independent release audit returned ready. The underlying reason for that transient response is not established.

## Controlling billing test-account decision — 2026-10-27

The owner explicitly confirmed the currently connected **Quixo Homes sandbox**, `acct_1UTgcdQ4sARuLNQa`, as the **canonical billing integration test account**. Fresh connector inventory confirms that exact account with `livemode=false`.

**Account selection is CLOSED.** This supersedes the earlier intended-sandbox selection and the account-selection blocker recorded in issue #375 and historical checkpoints. Earlier account IDs and objects remain historical evidence only; do not provision or use them for new canonical B05 work. No relationship between the old accounts is asserted or required to proceed with this newly selected sandbox.

Use the existing approved sandbox catalog and portal; do not recreate duplicates. The latest [read-only readiness checkpoint](BILLING-READINESS-20261027.md) records active sandbox Tax settings, no tax registrations and no registered webhook endpoint. Sandbox selection does not establish live merchant readiness, tax/Merchant-of-Record acceptance or paid-lifecycle acceptance. No Stripe object, credential, business profile, tax registration, subscription, charge, application configuration or replica was changed by recording this decision. Live billing and public signup remain gated.

## Independent billing readiness — 2026-10-27

[Fresh read-only billing checkpoint](BILLING-READINESS-20261027.md): connected supplemental sandbox Price still matches the approved USD 5/month licensed dwelling contract. Tax settings now report active, superseding the older pending observation for that sandbox, but tax registrations and webhook endpoints are both empty. Existing portal quantity edits remain disabled. No Stripe mutation or live-mode access occurred.

Canonical sandbox selection is now CLOSED by the owner: use the currently connected Quixo Homes sandbox for B05 tests, superseding the earlier account choice. B02 merchant/tax/MoR acceptance and B04-owner/B05 implementation remain OPEN. Cloudflare plugin discovery returned no matching integration; prior browser sign-in limitation remains, so human ownership/recovery is still open. Scaling remains deferred.

## Execution queue

| Priority | Work | Status |
| --- | --- | --- |
| Completed | Private selected-property reference, eligibility, permitted content and newly approved derivative | Accepted privately; do not repeat |
| Completed | Release/rollback controls and disabled-state verification | #437 merged; fresh verification passed |
| Follow-up | Production account/linked identity and recovery custody handover | OPEN operational record; completed bucket privacy audit remains accepted |
| Completed | Configure exact privately approved projection in the Production release fixture | Saved in protected GitHub Production setting; private readback and shutdown passed |
| 1 | Obtain separate exact one-property activation decision | READY FOR OWNER DECISION; public access remains OFF |
| 2 | Controlled API/site country, photo delivery and public withdrawal/cache acceptance | NOT performed; follows approval; website #439 prepared |
| Next independent program work | Paying-organization/billing readiness, then regional launch acceptance | OPEN; advance preparation if a pilot dependency is blocked |
| Parked | Scaling/distinct-replica proof, invoice archive R2, expanded copy and general signup activation | Preserve existing evidence; resume under their respective decisions |

Validation: pilot verifier CI #40531810965 passed all 15 Node cases. Application verification #40531810644 passed authorization tests and build. Local YAML/embedded Bash syntax and isolated mocked activation ordering, failed-acceptance shutdown and standalone rollback passed. The replica audit enhancement is read-only.

Anonymous listing/media, LK/BN website live feeds and temporary administrator controls remain OFF. No secret configuration, property edit or public activation was performed. API PASS alone does not accept website, withdrawal or proxy/cache behavior.

R1 remains closed; R3 remains conditionally accepted for one replica; invoice archive R2 remains owner-deferred. The current business package remains the bounded one-property pilot. The latest owner decision defers scaling; it does not waive the other public-release gates.

The earlier attempted master/supporting full-file replacements were blocked by automatic approval review because those existing files contain private identifiers and financial/photo details. Those files were preserved. This companion adds no private property identifiers, field values or image references.
