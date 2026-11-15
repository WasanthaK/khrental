# R5 self-handoff — 15 November 2026

Latest verified acceptance: 15 November 2026, 16:26:11 Asia/Colombo (10:56:11 UTC).
This handoff supports continuation; the canonical status remains in [Execution Plan](EXECUTION-PLAN.md), [Delivery](R4-R5-DELIVERY.md), and [Acceptance Ledger](R5-LIFECYCLE-ACCEPTANCE-20261105.md).

## Current decision
R5 is PARTIAL. LK is not launch-ready. Live charging and full enforcement remain OFF. Evia is paused by owner; BN is a separate later release. Continue controlled sandbox acceptance without repeating accepted fixtures.

Accepted serving build: `e0f7e821b8e511898836f71df86fde2fa8399463`, deployed in run 43702359791 and reverified by acceptance run 43706276982. Reverify the runtime baseline before a new deployed test.

## Accepted evidence and limits
- Actual restoration renewal: [run 43706276982](https://github.com/WasanthaK/khrental/actions/runs/43706276982), twelve groups passed. The 2→1→2 fixture renewed at USD 10 for two dwellings; reconciliation, retries, retained states/history, privacy, protected accounts, cleanup, configuration and build/SQL health passed. [Both attempts and cleanup evidence](evidence/r5-restoration-renewal-20261115.json). First run 43705778853 remains failed; PR #664 corrected its retained-state assertion. Do not replay either fixture. Service/SQL scope only.
- Actual cessation renewal: [run 43704182377](https://github.com/WasanthaK/khrental/actions/runs/43704182377), ten groups passed. A fresh sandbox clock advanced only this fixture: 2→1 cessation preserved the original USD 10 invoice, then the next invoice automatically paid USD 5 for one dwelling; pending quantity cleared, retries/history passed, cleanup/configuration/build/SQL health passed. [All attempts and cleanup evidence](evidence/r5-cessation-renewal-20261115.json). This is service/SQL acceptance, not HTTP/UI or natural grace-expiry acceptance.
- Staged-stock hosted Checkout: [run 43677343501](https://github.com/WasanthaK/khrental/actions/runs/43677343501), ten groups passed. Genuine hosted sandbox payment for three dwellings (USD 15) reconciled exactly three private inactive records; retries did not duplicate stock, Checkout or subscription. Cleanup, full configuration restoration and build/SQL health passed. [Evidence, including two failed attempts and their verified cleanup](evidence/r5-hosted-checkout-20261115.json). PRs #656–658 changed the acceptance harness only. Rendered stock forms and credential login are not accepted by this result.
- Paid HTTP cessation, restoration and split: [run 43673712405](https://github.com/WasanthaK/khrental/actions/runs/43673712405), 17 groups and 15 negative requests; cleanup, exact configuration restoration, serving build and SQL health passed. [Evidence](evidence/r5-paid-http-transitions-20261115.json). Current quantity stayed 2; schedules changed to [2,1], [2,2], then [2,4]. No actual renewal or clock advancement was accepted.
- Staged create/import and paid promotion over HTTP: [run 43669450738](https://github.com/WasanthaK/khrental/actions/runs/43669450738), 12 groups and cleanup passed. The overall run remains RED because its original configuration comparison failed. Follow-up revision-template parity and health do not establish full original configuration parity retrospectively. [Evidence](evidence/r5-paid-http-stock-20261115.json).
- HTTP authority: 80 denials over 16 routes plus two foreign command checks accepted. [Evidence](evidence/r5-paid-http-permissions-20261115.json).
- Earlier paid service promotion and transitions are accepted only within their recorded scope. [Promotion evidence](evidence/r5-paid-promotion-20261115.json), [transition evidence](evidence/r5-paid-inventory-20261114.json).
- Core OP03–06 lifecycle is accepted. Do not reopen, re-sign or reactivate the closed demo to repeat it.
- Retained-history service/API role checks are accepted; rendered journeys and credential login remain separate.
- Portal/customer recovery and recorded billing renewal/grace checks are accepted. Other recovery kinds and natural seven-day grace expiry are not thereby accepted.

## Split renewal — harness merged; execution pending — 15 November 2026

[PR #665](https://github.com/WasanthaK/khrental/pull/665) merged as `16a619710cd929cee82a470fe03eb1a0d6557461` after syntax validation, lint, authorization tests and build passed (43706960779, 43706960788). Post-merge verification 43707124525 also passed. The fresh `split-renewal` scenario requires three exact units replacing one of two dwellings, an unchanged initial USD 10 invoice and an actual USD 20 renewal for four dwellings; reconciliation, retries, retained identities/history, privacy, protected accounts and cleanup are mandatory.

**Execution is pending, not accepted.** Browser submissions closed the dispatch form, but workflow-page and Actions API readback showed no new run. No split fixture/provider mutation is evidenced. Prepared operation UUID: `97d45d47-899e-490f-bcc1-0a09a02a3431`; expected serving build: `e0f7e821b8e511898836f71df86fde2fa8399463`. Before submitting again, inspect recent dispatches; if this operation has run, do not replay it. Use scenario `split-renewal`, branch `main`, confirmation `VERIFY-PAID-INVENTORY`. The workflow independently verifies serving build before mutation. Do not change triggers, permissions or flags to bypass this dispatch issue.

Restoration and cessation renewals remain accepted within their recorded service/SQL scope. R5 remains partial; live charging/full enforcement OFF; Evia paused.

## Next executable slice
**Split renewal execution, then remaining stock states and obligations.**
Inspect the existing transition harness and choose a fresh isolated sandbox fixture to verify actual next-period invoice quantity after split. Cessation 2→1 and restoration 2→1→2 actual renewals are accepted; do not repeat those as standalone acceptance. Keep final-dwelling zero-stock behavior separately explicit. Do not advance protected or previously accepted clocks.

PR #660 normalized UUID billing lock names; real SQL regression and both SQL suites passed before deployment. Earlier deadlock graphs were not retained, so exact prior contention is unproven. PRs #661–662 corrected financial invoice comparison and cleanup. Compare stable invoice identity/financial fields, not the entire provider JSON. Never issue even redundant UPDATEs to already-inactive ceased properties: SQL 51074 intentionally rejects them. Cleanup-only run 43704049415 resolved the prior fixture; all prior attempts have verified cleanup. Never replay any creation UUID recorded in the evidence.

Hosted Checkout remains accepted within its recorded scope. Explicitly set synthetic fixture opt-out after promotion while its parent remains inactive. Rendered stock forms and credential login remain separate.

## Remaining queue and exit criteria
1. Rendered create/import forms remain; hosted Checkout payment/promotion is accepted.
2. Remaining stock/resource states, stale/conflict cases, obligations, transition combinations, split renewal quantity and genuine final-dwelling zero-stock acceptance.
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

