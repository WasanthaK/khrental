# R5 self-handoff — 15 November 2026

Latest verified acceptance: 15 November 2026, 17:33:04 Asia/Colombo (12:03:04 UTC).
This handoff supports continuation; the canonical status remains in [Execution Plan](EXECUTION-PLAN.md), [Delivery](R4-R5-DELIVERY.md), and [Acceptance Ledger](R5-LIFECYCLE-ACCEPTANCE-20261105.md).

## Current decision
R5 is PARTIAL. LK is not launch-ready. Live charging and full enforcement remain OFF. Evia is paused by owner; BN is a separate later release. Continue controlled sandbox acceptance without repeating accepted fixtures.

Accepted serving build: `e0f7e821b8e511898836f71df86fde2fa8399463`, deployed in run 43702359791 and reverified by acceptance run 43711743955. Reverify the runtime baseline before a new deployed test.

## Accepted evidence and limits
- Actual split renewal: [run 43711743955](https://github.com/WasanthaK/khrental/actions/runs/43711743955), ten groups passed; USD 20 for four dwellings, exact units/history, retries, privacy, protected accounts, cleanup/configuration/build/SQL health verified. [Evidence](evidence/r5-split-renewal-20261115.json). Never replay the accepted operation or clock.
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

## Actual renewal after split — bounded pass — 15 November 2026

[Run 43711743955](https://github.com/WasanthaK/khrental/actions/runs/43711743955) passed ten groups. One of two paid dwellings was split into three exact private units; the parent was not double-counted. The original USD 10 invoice remained unchanged, and the next sandbox invoice automatically paid USD 20 for four dwellings with no extra invoice. Reconciliation cleared pending quantity. Split/refresh retries, exact retained unit and parent identities, split history and private inactive records passed; protected accounts, subscriptions and clocks remained unchanged.

Cleanup passed at **17:33:01 Asia/Colombo**: the fixture subscription was canceled without invoice/proration, the fixture was deactivated and records retained. Full configuration equality, unchanged serving build `e0f7e821b8e511898836f71df86fde2fa8399463`, Ready revision `khrental-app--0000523` and SQL health passed through **17:33:04 Asia/Colombo**. [Durable evidence](evidence/r5-split-renewal-20261115.json) retains the proof, source SHA and artifact digest. PR #665 supplied the harness; no application code or serving flags changed.

The earlier dispatch issue is resolved by the owner's submission. Operation `97d45d47-899e-490f-bcc1-0a09a02a3431` has now run and must never be replayed. Cessation, restoration and split actual renewals are accepted for their recorded service/SQL cases. HTTP/UI, credential login, other state/obligation combinations and natural grace expiry are separate.

**Next executable slice:** genuine final-dwelling zero-stock cancellation and retained-history acceptance on a fresh isolated sandbox fixture. R5 remains partial; live charging/full enforcement OFF; Evia paused.

## Final-dwelling cancellation — harness ready, execution pending — 15 November 2026

[PR #666](https://github.com/WasanthaK/khrental/pull/666) merged as `7b02b44e533399a200fffa0aa344a3fae59d0566` after successful CI runs 43712486629 and 43712486632. Local Node, workflow YAML, embedded Bash and positive/negative proof-gate checks passed. The new `zero-stock-cancellation` case ceases two paid dwellings, checks schedule release and period-end cancellation, advances only its fresh fixture clock, and requires no renewal invoice, read-only historical access, retained private records, exact retries and the existing protected-account/cleanup/configuration/health gates. No application code or serving flags changed.

Browser submission closed the form without producing a workflow run; the latest observed manual run remains split acceptance 43711743955. **Execution and acceptance remain pending.** The prepared fixture UUID is `b1d18f31-6fd5-41bb-b1ee-467b4c8abb65`, expected build `e0f7e821b8e511898836f71df86fde2fa8399463`, branch `main`, confirmation `VERIFY-PAID-INVENTORY`. Before submitting or retrying, check for a new run using that UUID; once used, never replay it. The next action is submit this prepared case and inspect immutable proof plus cleanup/configuration/build/SQL health before marking it accepted.

## Next executable slice
**Final-dwelling zero-stock cancellation and retained-history acceptance.**
The harness is now merged in PR #666 with green CI. Submit the prepared `zero-stock-cancellation` form after checking no run already used UUID `b1d18f31-6fd5-41bb-b1ee-467b4c8abb65`, then verify cancellation timing, no renewal invoice, billing projection, retained private records and cleanup. Browser submission produced no run; manual submission is pending. Actual cessation, restoration and split renewals have passed; do not repeat accepted fixtures or advance their clocks.

PR #660 normalized UUID billing lock names; real SQL regression and both SQL suites passed before deployment. Earlier deadlock graphs were not retained, so exact prior contention is unproven. PRs #661–662 corrected financial invoice comparison and cleanup. Compare stable invoice identity/financial fields, not the entire provider JSON. Never issue even redundant UPDATEs to already-inactive ceased properties: SQL 51074 intentionally rejects them. Cleanup-only run 43704049415 resolved the prior fixture; all prior attempts have verified cleanup. Never replay any creation UUID recorded in the evidence.

Hosted Checkout remains accepted within its recorded scope. Explicitly set synthetic fixture opt-out after promotion while its parent remains inactive. Rendered stock forms and credential login remain separate.

## Remaining queue and exit criteria
1. Rendered create/import forms remain; hosted Checkout payment/promotion is accepted.
2. Remaining stock/resource states, stale/conflict cases, obligations, transition combinations, genuine final-dwelling zero-stock acceptance.
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

