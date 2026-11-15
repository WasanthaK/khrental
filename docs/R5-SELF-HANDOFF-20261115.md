# R5 self-handoff — 15 November 2026

Latest verified acceptance: 15 November 2026, 10:12:51 Asia/Colombo (04:42:51 UTC).
This handoff supports continuation; the canonical status remains in [Execution Plan](EXECUTION-PLAN.md), [Delivery](R4-R5-DELIVERY.md), and [Acceptance Ledger](R5-LIFECYCLE-ACCEPTANCE-20261105.md).

## Current decision
R5 is PARTIAL. LK is not launch-ready. Live charging and full enforcement remain OFF. Evia is paused by owner; BN is a separate later release. Continue controlled sandbox acceptance without repeating accepted fixtures.

Read the accepted serving build and runtime baseline from the current canonical evidence and reverify them before a new deployed test.

## Accepted evidence and limits
- Staged-stock hosted Checkout: [run 43677343501](https://github.com/WasanthaK/khrental/actions/runs/43677343501), ten groups passed. Genuine hosted sandbox payment for three dwellings (USD 15) reconciled exactly three private inactive records; retries did not duplicate stock, Checkout or subscription. Cleanup, full configuration restoration and build/SQL health passed. [Evidence, including two failed attempts and their verified cleanup](evidence/r5-hosted-checkout-20261115.json). PRs #656–658 changed the acceptance harness only. Rendered stock forms and credential login are not accepted by this result.
- Paid HTTP cessation, restoration and split: [run 43673712405](https://github.com/WasanthaK/khrental/actions/runs/43673712405), 17 groups and 15 negative requests; cleanup, exact configuration restoration, serving build and SQL health passed. [Evidence](evidence/r5-paid-http-transitions-20261115.json). Current quantity stayed 2; schedules changed to [2,1], [2,2], then [2,4]. No actual renewal or clock advancement was accepted.
- Staged create/import and paid promotion over HTTP: [run 43669450738](https://github.com/WasanthaK/khrental/actions/runs/43669450738), 12 groups and cleanup passed. The overall run remains RED because its original configuration comparison failed. Follow-up revision-template parity and health do not establish full original configuration parity retrospectively. [Evidence](evidence/r5-paid-http-stock-20261115.json).
- HTTP authority: 80 denials over 16 routes plus two foreign command checks accepted. [Evidence](evidence/r5-paid-http-permissions-20261115.json).
- Earlier paid service promotion and transitions are accepted only within their recorded scope. [Promotion evidence](evidence/r5-paid-promotion-20261115.json), [transition evidence](evidence/r5-paid-inventory-20261114.json).
- Core OP03–06 lifecycle is accepted. Do not reopen, re-sign or reactivate the closed demo to repeat it.
- Retained-history service/API role checks are accepted; rendered journeys and credential login remain separate.
- Portal/customer recovery and recorded billing renewal/grace checks are accepted. Other recovery kinds and natural seven-day grace expiry are not thereby accepted.

## Next executable slice
**Remaining stock states, obligations and transition renewal execution.**
Inspect the stock-state matrix and current cessation/restoration/split harness before selecting the smallest unaccepted case. Prior tests proved scheduling only; add a fresh isolated sandbox case that verifies actual next-period invoice quantity for a transition, including idempotency and cleanup. Do not advance protected or previously accepted clocks. Keep final-dwelling zero-stock behavior separately explicit.

The hosted Checkout slice is complete within its recorded scope. Do not replay its successful or failed operation IDs. Earlier failed attempts remain failed; their cleanup is verified in the evidence. The public-listing preference default is not opt-out: explicitly set synthetic fixture opt-out after promotion while its parent remains inactive.

## Remaining queue and exit criteria
1. Rendered create/import forms remain; hosted Checkout payment/promotion is accepted.
2. Remaining stock/resource states, stale/conflict cases, obligations, transition combinations, actual renewal quantities and genuine final-dwelling zero-stock acceptance.
3. Checkout/subscription operation recovery, isolation and broader authority/resource-state combinations. Preserve the recovery worker's exact existing tenant scope.
4. Billing enforcement remaining routes, jobs, imports, generic bypass and stale actor/resource paths. Full rollout stays OFF.
5. Desktop/mobile/keyboard journeys, rendered retained-history permissions, actual mailbox receipt and naturally paused database wake-up.
6. Natural grace-expiry/later recovery observation without advancing accepted clocks; paused Evia work only after owner resumes it.
7. LK commercial and launch decisions: formula/FX/rounding/versioning, reactivation/refund, merchant payout, tax/privacy and final release approval. BN follows separately.

## Execution and safety boundaries
- User authorized continued R5 work, merges and controlled deployed sandbox acceptance; do not repeatedly ask for the same authorization.
- Use the protected-account set from the existing controlled acceptance harness. Snapshot and verify it unchanged; never advance protected clocks.
- Each attempt gets a fresh operation UUID. Never replay any operation UUID recorded in the linked evidence, including failed attempts.
- Synthetic stock must stay private, inactive where appropriate, and public opt-out. Use random non-login credentials and short-lived programmatic sessions only; these do not prove credential login.
- Cleanup must revoke sessions, deactivate fixture users/memberships/workspaces, and cancel sandbox subscriptions with no invoice or proration. Retain audit/history.
- Snapshot the complete app configuration before temporary flags. Restore exact flag presence and values, image and all configuration; verify Ready, traffic, build and SQL health independently.
- Retain the established production workflow concurrency and single-replica configuration. Do not scale before the separate cross-replica requirements.
- New harness scenarios must update workflow choices, shell preflight, script preflight, temporary activation, restoration comparison conditions and expected proof gates together. PR #655 fixed an omitted shell allowlist entry; do not repeat it.
- Fetch current source and canonical documentation before changing them. Follow PROJECT_RULES.md and AUTHENTICATION-LIFECYCLE.md for fixture/auth changes.
- No new dependencies or unrelated application changes.

## Completion discipline
For every new slice, retain immutable run/artifact evidence and explicit limits, update current headers/queues/task rows in all three canonical documents, and read back exact written content. Keep historical failed runs failed. Report what passed, what remains, and the next executable slice. Update this handoff when the next slice changes.
