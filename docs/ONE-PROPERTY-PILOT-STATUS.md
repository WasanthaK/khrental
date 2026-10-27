# One-property pilot — current release preparation status

Updated 2026-10-27. The existing [master plan](EXECUTION-PLAN.md) retains program authority. This redacted companion records current evidence and the owner's latest priority/cost decision without reproducing private property data.

## Owner decision: defer scaling, continue the remaining canonical work

Scaling and distinct-replica acceptance are deferred. The existing single-replica technical acceptance is sufficient to continue the current bounded pilot preparation; the multi-replica gate stays open for a future scaling decision. No new replica or scale-up is required now. General signup remains OFF.

If a future separately authorized test temporarily adds replicas, remove the extra test capacity afterward and verify the actual active revision/replica inventory and limits. Do not leave test replicas running. This avoids ongoing additional replica costs; it does not establish zero total Azure/GitHub/SQL/storage costs or authorize shutting down the existing production app.

## Current verified deployment and cost boundary

[Read-only audit #40533092490](https://github.com/WasanthaK/khrental/actions/runs/40533092490) PASS: revision mode Single, minReplicas=1, maxReplicas=1, one active revision, one running replica and 100% traffic. No extra replica required shutdown. Restart remained false; no scaling, traffic override or app deployment occurred. Serving build `f631e7902a4fdae736a47ed6207271c503d81db9`, latest/ready revision 0000392; app and MSSQL health passed.

[PR #437](https://github.com/WasanthaK/khrental/pull/437) merged at `d4aa82081e0239578e3b0bf2b79da9383bc7ef9e`. Manual release controls, anonymous verifier and emergency rollback are now on main; [release/withdrawal runbook](ONE-PROPERTY-PUBLIC-PILOT.md). It did not activate publication or redeploy the application.

[Disabled-state verification #40533333116](https://github.com/WasanthaK/khrental/actions/runs/40533333116) PASS: exact serving build, app/SQL health and LK/BN anonymous inventory denied. Earlier #40532918290 stopped on an HTTP 503 before cloud login/mutation and remains failed evidence. A direct subsequent MSSQL check and independent release audit returned ready. The underlying reason for that transient response is not established.

## Execution queue

| Priority | Work | Status |
| --- | --- | --- |
| Completed | Private selected-property reference, eligibility, permitted content and newly approved derivative | Accepted privately; do not repeat |
| Completed | Release/rollback controls and disabled-state verification | #437 merged; fresh verification passed |
| 1 | Production account/linked identity, recovery custody and proxy readiness | OPEN; direct-public-domain audit already passed |
| 2 | Configure exact privately approved projection in the Production release fixture | NOT configured by this package |
| 3 | Obtain separate exact one-property activation decision | NOT approved |
| 4 | Controlled API/site country, photo delivery and public withdrawal/cache acceptance | NOT performed; follows approval |
| Next independent program work | Paying-organization/billing readiness, then regional launch acceptance | OPEN; advance preparation if a pilot dependency is blocked |
| Parked | Scaling/distinct-replica proof, invoice archive R2, expanded copy and general signup activation | Preserve existing evidence; resume under their respective decisions |

Validation: pilot verifier CI #40531810965 passed all 15 Node cases. Application verification #40531810644 passed authorization tests and build. Local YAML/embedded Bash syntax and isolated mocked activation ordering, failed-acceptance shutdown and standalone rollback passed. The replica audit enhancement is read-only.

Anonymous listing/media, LK/BN website live feeds and temporary administrator controls remain OFF. No secret configuration, property edit or public activation was performed. API PASS alone does not accept website, withdrawal or proxy/cache behavior.

R1 remains closed; R3 remains conditionally accepted for one replica; invoice archive R2 remains owner-deferred. The current business package remains the bounded one-property pilot. The latest owner decision defers scaling; it does not waive the other public-release gates.

The earlier attempted master/supporting full-file replacements were blocked by automatic approval review because those existing files contain private identifiers and financial/photo details. Those files were preserved. This companion adds no private property identifiers, field values or image references.
