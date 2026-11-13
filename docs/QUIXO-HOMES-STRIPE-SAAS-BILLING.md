# Quixo.Homes canonical SaaS billing contract

**BL07.2 — Passed.** Administrator grant/revoke, stale-save rejection and audit checks passed. Test workspace deactivated. Remaining R5 gates stay open.

## BL07.3 paid access after complimentary expiry — passed 13 November 2026

[Run 43362222581](https://github.com/WasanthaK/khrental/actions/runs/43362222581), job 131678160465, passed all five checks at **09:28:46 Asia/Colombo / 03:58:46 UTC**. In an isolated fixture with seeded paid state, authenticated writes succeeded before and after a 30-second complimentary grant expired naturally by SQL time; the post-expiry change was read back and billing/complimentary state remained unchanged. Both protected billing fixtures remained unchanged; Stripe writes were zero. The fixture session was revoked and user/membership/tenant deactivated.

Original enforcement settings and public health were restored at **09:29:30 Asia/Colombo / 03:59:30 UTC**, revision **khrental-app--0000506**, unchanged application build `5dff24f354ed0f3a40d5d51bd61829b145d6fbf8`. [PR #625](https://github.com/WasanthaK/khrental/pull/625) added the check; [#626](https://github.com/WasanthaK/khrental/pull/626) corrected the source allowlist; [#627](https://github.com/WasanthaK/khrental/pull/627) shortened Azure commands after a pre-execution handshake 404. All three passed CI. Earlier runs 43361034868 and 43361502496 did not execute acceptance checks and are superseded by this pass.

[Durable evidence](evidence/r5-paid-comp-expiry-20261113.json). **The paid-underlay expiry case is closed; do not rerun it.** Seeded paid/grant state is not real payment or actual Platform Admin grant/revoke/audit acceptance. BL07.2 privileged controls, natural seven-day grace, remaining role/resource/route and launch acceptance stay open; R5 is not complete. Live charging remains **OFF**, Evia **paused**, and accepted prior proofs, worker scope and retained clocks are preserved.

## R5 checkpoint — 13 November 2026

**Invoice/payment and maintenance HTTP acceptance passed (bounded scope).** [Run 43359060142](https://github.com/WasanthaK/khrental/actions/runs/43359060142), job 131668301669, passed all **21 checks** at **09:00:01 Asia/Colombo / 03:30:01 UTC**. Expired-access writes were denied, invoice and maintenance history remained readable, and seeded paid/grace/complimentary actions were allowed. Original enforcement settings and public health were restored at **09:00:51 Asia/Colombo / 03:30:51 UTC**, revision **khrental-app--0000502**, on unchanged application build `5dff24f354ed0f3a40d5d51bd61829b145d6fbf8`.

[#610](https://github.com/WasanthaK/khrental/pull/610) is merged and deployed. Its subsequent run 43238563485 stopped in fixture setup because property country was required (SQL 51001). [#624](https://github.com/WasanthaK/khrental/pull/624), merged as `ddd7b67306706b75221604b55c928e6e9caba23a`, supplies the fixture country/type, opts it out of public listing, and executes a hash-verified corrected harness through one short Azure connection. [CI 43358799803](https://github.com/WasanthaK/khrental/actions/runs/43358799803) passed syntax, lint, authorization tests and build.

[Durable financial/maintenance evidence](evidence/r5-http-financial-maintenance-20261113.json) records the exact 21 checks and limits. The fixture was closed/deactivated and its session revoked; this does not mean every synthetic row was deleted. Both protected billing fixtures were unchanged and Stripe writes were zero. Synthetic rental records, seeded billing states and persisted session authority do **not** establish real payment, credential-login, natural seven-day grace, external dispatch or full role/resource/route acceptance. **BL08.3 and the maintenance portion of BL08.4 advance only for this bounded scope; R5 remains open.**

**BL08.11-A customer response-loss recovery also passed:** [run 43357605904](https://github.com/WasanthaK/khrental/actions/runs/43357605904) recovered the original genuine sandbox customer without duplication, blocked checkout, and deleted the disposable customer. [Customer evidence](evidence/r5-genuine-customer-recovery-20261113.json). Do not repeat either accepted proof. Remaining provider-operation and isolation cases remain open. Live charging stays **OFF**, Evia stays **paused**, and retained clocks and existing worker scope are unchanged.

## Historical financial/maintenance attempts — 12 November 2026

Superseded by the passed 13 November checkpoint above; pending and retry instructions in this dated record are historical.

**Current checkpoint:** corrected-fixture run [43233999467](https://github.com/WasanthaK/khrental/actions/runs/43233999467) uploaded four payload chunks, then Azure rejected the execution connection with HTTP 429 at **14:10:38 UTC / 19:40:38 Asia/Colombo**, requesting 600 seconds. The acceptance script did not start: no fixture SQL or HTTP checks ran. Exact original enforcement settings and health were restored at **14:11:29 UTC / 19:41:29 Asia/Colombo**, Ready **0000497**, unchanged image `59050153ad96b10be7c1990df846363a1642c046`. Fixture ID `dd1cdbab-5284-49ac-8f4f-2e45da124f67` identifies this transport-only attempt. No new Stripe or Evia operation occurred.

**Development follow-up:** source review found monthly invoice generation uses bare SQL `OUTPUT INSERTED.*` despite the enabled cessation INSERT trigger. [#610](https://github.com/WasanthaK/khrental/pull/610) changes this to captured IDs plus tenant-scoped readback and adds disposable SQL insert/refusal coverage. The acceptance workflow also verifies the image-bundled harness checksum and executes it through one short connection, eliminating repeated payload-upload connections. CI and deployment remain pending. Complete this correction before fresh-fixture deployed acceptance; do not treat transport failure as an application acceptance result. Earliest Azure retry is **14:20:38 UTC / 19:50:38 Asia/Colombo**. [Durable attempt evidence](evidence/r5-http-financial-maintenance-20261112.json).

**First run stopped in fixture setup; acceptance remains open.** [43230080351](https://github.com/WasanthaK/khrental/actions/runs/43230080351) returned SQL `EREQUEST` before any public HTTP checks. The rental-fixture transaction rolled back; cleanup completed without a cleanup error. Original enforcement settings and public health were restored on Ready **0000495** at **13:49:13 UTC / 19:19:13 Asia/Colombo**, on the unchanged application image. Do not rerun fixture `cd0cb0bb-b433-4f1a-a25b-132642533120`. Historical next step was schema diagnosis (completed below), then a corrected fresh-fixture run; this is not an accepted enforcement failure. Harness [#606](https://github.com/WasanthaK/khrental/pull/606) passed lint/tests/build in [43229670659](https://github.com/WasanthaK/khrental/actions/runs/43229670659).

Read-only diagnosis [43232018563](https://github.com/WasanthaK/khrental/actions/runs/43232018563) stopped at JavaScript command parsing before executing SQL; enforcement and fixture steps were skipped. The diagnostic command now encodes its SQL literal to avoid nested command quoting. No application fix or acceptance result is inferred.

Read-only schema inspection [43232955461](https://github.com/WasanthaK/khrental/actions/runs/43232955461) passed on unchanged Ready **0000495**. It exposes required fixture columns without visible default definitions. The corrected harness explicitly supplies timestamps, renter status/flags, agreement document-generation flag and maintenance priority/type; no database schema or application behavior is changed. The earlier log lacks the exact SQL field error, so the default-dependency diagnosis remains provisional until a fresh-fixture execution succeeds.

**Prepared, not yet accepted:** the next isolated public-HTTP harness covers monthly draft generation; invoice draft/component/adjustment writes; payment verification/manual-payment/reminder-record denial; maintenance create/assign/start/complete/cancel/comment denial; retained invoice/maintenance reads; and allowed draft edits/comments under seeded paid, current grace and fixed complimentary access. Denials compare complete fixture domain/event/notification rows before and after. Issued invoice state and rental records are explicitly synthetic; no successful customer payment, contract signature, invoice delivery or reminder delivery is claimed. Dispatch routes are excluded. The fixture session and memberships are deactivated afterward and its synthetic agreement returns to draft.

The workflow temporarily enables enforcement only for the new fixture, preserves both existing billing fixtures and the one-organization worker scope, then restores the exact original enforcement configuration and checks public health. The first-attempt restored runtime was Ready **0000495** on image `59050153ad96b10be7c1990df846363a1642c046` until new execution evidence is recorded. All prior accepted checks below remain accepted and must not be repeated. **R5 stays open:** BL08.3/BL08.4 are partial; automatic jobs, remaining roles/resources, dispatch, stock/activation/exit and broader rollout are still unaccepted. Evia stays paused and live charging remains OFF.

## Scoped public HTTP enforcement — passed and restored 12 November 2026

**Nine public-HTTP checks passed.** [Run 43227139115](https://github.com/WasanthaK/khrental/actions/runs/43227139115) temporarily enabled serving write enforcement for a new isolated fixture on Ready **0000492**. Authenticated agreement-template requests denied seeded expired-grace create/update without writes, allowed current grace and seeded paid access, retained historical reads, allowed complimentary access then denied it after **natural 30-second expiry** and revocation, and denied foreign-organization and stale-administrator-role requests. The fixture session was revoked and its actor/membership/organization deactivated. Existing billing fixtures were unchanged; no Stripe or Evia operation occurred. [Durable evidence](evidence/r5-public-http-enforcement-20261112.json).

**Current runtime is Ready 0000493**, restored at **13:28:38 UTC / 18:58:38 Asia/Colombo**, on unchanged application image `59050153ad96b10be7c1990df846363a1642c046`. Exact original enforcement environment settings were restored and public health returned HTTP 200. Full serving enforcement is again OFF; the existing one-organization recovery worker scope remains unchanged. The two revisions were configuration-only, not an application image release. Harness [#604](https://github.com/WasanthaK/khrental/pull/604) passed lint, regression tests and build in [43226685951](https://github.com/WasanthaK/khrental/actions/runs/43226685951).

**Boundary and next work:** this closes the bounded public template-route enforcement/rollback case. Grace dates and paid status were seeded test data; the session used persisted fixture authority and does not establish credential-login or UI acceptance. Seven-day natural grace/later recovery, remaining endpoint/job/stock/role coverage, privileged complimentary controls and paid-access fallback after complimentary expiry remain open. BL07/BL08 remain partial; do not rerun these nine accepted checks. Continue the uncovered matrix, preserve accepted lifecycle/signing evidence and keep Evia paused.

## Deployed grace and recovery — passed 12 November 2026

**BL05.4 passed: genuine failed renewal, grace and recovery within grace.** [Run 43224159517](https://github.com/WasanthaK/khrental/actions/runs/43224159517) passed at **13:09:20 UTC / 18:39:20 Asia/Colombo** on unchanged Ready **0000491**, image `59050153ad96b10be7c1990df846363a1642c046`. A distinct USD 5 renewal on the dedicated sandbox fixture failed; signed deployed HTTP reconciliation persisted grace at the first genuine failure time, **13:09:11 UTC**. A duplicate did not extend its seven-day deadline. Genuine payment within grace restored active paid-through and cleared grace. Failure and payment each retained exactly one SQL event/audit row. [Durable evidence](evidence/r5-deployed-grace-recovery-20261112.json).

The deployed SQL write guard allowed the genuine grace and recovered states and denied an unenrolled negative-control account. These checks used read-only transactions and an explicit **process-local fixture scope**; full serving HTTP enforcement remains OFF. No SQL timestamps, leases or backoff were changed. The original retained account/subscription/clock and worker scope stayed unchanged. Harness [#602](https://github.com/WasanthaK/khrental/pull/602) passed strict lint, **1,400 tests** and build in [43223747593](https://github.com/WasanthaK/khrental/actions/runs/43223747593). No app redeployment or live charge occurred.

The dedicated fixture remains active with paid-through `1802436793` and frozen provider time `1799765593`. Its prior delayed-event proof is historical and still accepted. Recovery cleared grace; the recorded **19 November 13:09:11 UTC** deadline is not a pending expiry. **Next open work:** BL05.5 real SQL grace expiry/later recovery, controlled full HTTP enforcement/role acceptance, and the remaining financial-operation/isolation cases. Do not rerun accepted renewal, portal recovery, delayed-event or within-grace proofs. R5 remains open; Evia stays paused.

## Deployed delayed failure after recovery — passed 12 November 2026

**BL06.3 delayed-failure case passed.** [Run 43221739128](https://github.com/WasanthaK/khrental/actions/runs/43221739128) passed at **12:53:39 UTC / 18:23:39 Asia/Colombo**, using the unchanged Ready **0000491** application image `59050153ad96b10be7c1990df846363a1642c046`. A new empty sandbox fixture genuinely failed a USD 5 renewal and paid it before its customer was bound to deployed SQL. Signed HTTP delivery of that old failure retained **active** entitlement, verified paid-through and **no grace**. Two additional signed duplicates returned duplicate and left exactly **one failure event and one audit**; the paid event likewise has one event/audit. The protected retained account/subscription and clock were unchanged. [Durable evidence and exact IDs](evidence/r5-deployed-delayed-failure-20261112.json).

The dedicated fixture `2383f4fc-e107-4ac7-9e13-39db501f40ec` has no users, memberships or properties and remains outside the automatic worker scope. Its separate frozen clock `clock_1UaxV7Q4sARuLNQazaI2X0i2`, customer `cus_VcBsCPq1TS8N9K` and subscription `sub_1UaxV8Q4sARuLNQaOeDFrlg3` are retained for distinct future acceptance. The original accepted renewal clock remains protected. Harness [#600](https://github.com/WasanthaK/khrental/pull/600) passed strict lint, **1,400 tests** and build in [43221214749](https://github.com/WasanthaK/khrental/actions/runs/43221214749). No application redeploy, worker-scope change, feature activation or live charge occurred.

**Subsequent progress:** deployed failure-to-grace/recovery and process-local SQL guard acceptance passed above; real grace expiry, full HTTP enforcement, and remaining financial-operation/role/isolation cases stay open. This proof closes only the delayed-event case; it does not establish grace-expiry enforcement or all organization isolation. Do not repeat the accepted retained renewal, portal response-loss or delayed-failure proofs. R5 remains open and Evia remains paused.

## Canonical R5 engineering status — 12 November 2026

**Recovery, all-state cessation, restoration and property splitting are implemented and source-verified. The Stripe test-clock failure-history bug is fixed and genuine isolated renewal/failure/recovery acceptance passed. Evia is paused by the user. The app currently serves Ready 0000493 (`5905015`) after the scoped HTTP enforcement test and exact configuration restore recorded above. The retained two-to-one renewal and deployed genuine-event/duplicate ledger proof also passed. Scoped recovery activation passed. The deployed genuine portal response-loss, delayed failure-after-recovery and within-grace failure/recovery cases passed. R5 remains open for other provider-operation and acceptance cases and broader launch exits.** Do not requeue completed implementation or accepted signing. The dated checkpoints below are historical evidence, not the current task queue.

| Area | Canonical state | Evidence / remaining boundary |
| --- | --- | --- |
| Interrupted provider operations | Implemented and source-verified | Journal, stable provider keys/readback, SQL fencing, scoped worker/dry-run, bounded retries/review alerts; #574 and subsequent operation proofs. Scoped activation and deployed genuine portal response-loss recovery passed; other operation kinds and role/isolation cases remain open. |
| All-state cessation | Implemented and source-verified | #576–#578; local no-write cases, grace/trial cleanup, retained unpaid invoices, zero-stock cancellation and duplicate webhook handling. |
| Restoration | Implemented and source-verified | #579, merge `2120f2959b3c9cd4c58ecb312290cfb8a7929d2a`; retained episodes, paid-capacity policy, no backdating and explicit cancelled-subscription reactivation. |
| Property split and transition consistency | Implemented and source-verified | #580, merge `7fc7fd66578e2cbb869ba3ebdf393f7fd1ecdbf2`; private reservations, renewal-only billing, parent identity/history retention, overlap guards, compensation before provider intent, atomic activation and transition sequences. |
| Application clock and replay | Implemented and source-verified | #581 merged; #583 fixes real-event versus simulated-invoice timestamps for verified test clocks. 1,397 tests, lint/build and both SQL workflows pass. SQL remains authoritative for persisted dates and write authorization; test-clock expiry uses the injected application clock. |
| Evia service/package and matching audit | **Paused by user / not accepted** | Completed signing stays accepted. A supported service exchange or genuine completed package is still unconfirmed; latest recorded provider failures remain 404/501. See [provider evidence](EVIA-PUBLIC-DOCUMENTATION-REFERENCE.md#r5-service-recovery-recheck--12-november-2026). No guessed routes, resend or re-sign. |
| Genuine Stripe lifecycle | **Passed: isolated API + application service** | [Run 43194909443](https://github.com/WasanthaK/khrental/actions/runs/43194909443): 24 checks, paid renewal, failed renewal, exact application-clock grace expiry, recovery within/after grace, duplicate/stale events and cleanup. [Durable evidence](evidence/stripe-lifecycle-20261112.json). Uses transactional memory; separate retained/deployed evidence is recorded below. |
| Retained renewal and deployed duplicate delivery | **Passed (BL04; bounded BL06)** | [Run 43199377112](https://github.com/WasanthaK/khrental/actions/runs/43199377112) passed the existing 2→1 schedule renewal: USD 5 recurring plus USD 5 retained proration, USD 10 paid, paid through 6 January 2027 12:44:35 UTC. Genuine delivery persisted one event/audit row before replay; two signed HTTP duplicates both returned duplicate and left one row each. [Durable evidence](evidence/retained-stripe-renewal-20261112.json). |
| Application deployment | **Passed** | [Release 43201035104](https://github.com/WasanthaK/khrental/actions/runs/43201035104): Ready **0000490**, serving `59050153ad96b10be7c1990df846363a1642c046`; independent public build and SQL health readback passed. Configuration-only recovery activation subsequently reached Ready **0000491** on the same image. |
| Scoped recovery dry-run | **Passed before activation** | [Run 43202578930](https://github.com/WasanthaK/khrental/actions/runs/43202578930) passed strict ledger/schema verification for all 23 migrations and a SELECT-only recovery dry-run for the accepted sandbox organization. All six tables are readable and existing SELECT/INSERT/UPDATE permissions are sufficient; candidates/due/review counts are 0/0/0. Worker was disabled during that pre-activation run. Zero candidates is not evidence of a recovered operation. [Durable rollout evidence](evidence/r5-migration-apply-20261112.json). |
| Scoped recovery activation | **Passed; worker ON for one sandbox organization** | [Activation 43204524714](https://github.com/WasanthaK/khrental/actions/runs/43204524714) passed on Ready **0000491**, retaining application SHA `59050153ad96b10be7c1990df846363a1642c046`. Recovery schema readiness and the automatic worker are enabled for the resolved single sandbox organization; strict schema, empty scope, existing permissions, exact image, one-replica boundary and SQL health passed. [Durable activation evidence](evidence/r5-recovery-activation-20261112.json). [Post-activation readback 43205174978](https://github.com/WasanthaK/khrental/actions/runs/43205174978) confirmed worker enabled, six readable tables, sufficient existing permissions and candidates/due/review counts 0/0/0 on the same scoped organization. |
| Database rollout / Sri Lanka launch | **23/23 verified** / launch held | [Apply 43202047924](https://github.com/WasanthaK/khrental/actions/runs/43202047924) applied and verified inventory staging, cessation, recovery, restoration and splitting; the existing 18 were skipped. Scoped recovery worker is now enabled; no live charging or launch. Rental QA and commercial/merchant/tax/privacy exits remain open. |

Final split head `8a0529bbfccaa6dc3dc33089f06f2e6780117b0c`: **1,386/1,386 tests**, strict lint and build [43188754958](https://github.com/WasanthaK/khrental/actions/runs/43188754958); real SQL [43188754932](https://github.com/WasanthaK/khrental/actions/runs/43188754932); two-tenant SQL [43188754915](https://github.com/WasanthaK/khrental/actions/runs/43188754915); public regression [43188754870](https://github.com/WasanthaK/khrental/actions/runs/43188754870); desktop/mobile/keyboard browser [43188754985](https://github.com/WasanthaK/khrental/actions/runs/43188754985), all passed. Final split review screenshots at 390/1440 were inspected from artifact **13929583405**. The process suite has **100 SIGKILL/restart cases**, including 10 split cases. Real SQL separately verifies response loss, audit rollback, compensation, parent identity and overlap guards, parent-and-unit restoration, and all three transition sequences. No synthetic result is promoted to provider or production acceptance.

Current next work: complete the remaining deployed financial-operation/lifecycle recovery matrix; the bounded portal response-loss and delayed failure-after-recovery cases passed; natural grace expiry/later recovery and the remaining endpoint/job/provider/role/isolation/launch cases stay open; deployed within-grace failure/recovery and bounded public HTTP enforcement passed above. Scoped activation is complete; do not repeat it or widen the worker scope by default. Deployment is complete; do not redeploy the same runtime merely for acceptance-script/documentation changes. Evia stays paused by user direction. #581 clock/inspection work and #582/#583 isolated Stripe API acceptance are complete; do not repeat them or the accepted signing journey. The separate retained run closes BL04 and the genuine renewal/duplicate portion of BL06; the separate deployed delayed failure-after-recovery case is now passed above, while other remaining matrix cases are not implied. Do not advance this retained clock again to repeat the accepted renewal.


## Deployed recovery acceptance checkpoint — 12 November 2026

**Genuine post-provider response-loss recovery passed.** [Run 43216870550](https://github.com/WasanthaK/khrental/actions/runs/43216870550) created restricted sandbox portal session `bps_1UawzaQ4sARuLNQanPIOtvkL` for operation `5f86cad1-cbd4-44e7-93d9-9e20d1d88fad`, discarded the successful response at 12:20:38 UTC, and passed final readback at 12:21:29 UTC. The existing automatic worker completed attempt two: command completed, journal succeeded, exactly one completed step, one recovered audit and one matching Stripe event `evt_1UawzaQ4sARuLNQaTf3NyAkw`. The original provider key was preserved; the recovered session equals the discarded response. SQL billing-account and provider subscription financial snapshots were unchanged. No manual recovery, SQL clock/backoff/lease edits, live charge, application redeployment or scope widening occurred. [Durable passing evidence](evidence/r5-deployed-portal-recovery-20261112.json).

**Scope and next work:** close the bounded portal response-loss case and original-operation inspection; do not repeat either. BL08.11 remains partial for other provider-operation kinds and authenticated role/resource/isolation acceptance. Next is the remaining deployed financial-operation/lifecycle recovery matrix, using dedicated sandbox fixtures without advancing the accepted retained renewal clock. This proof is a controlled response discard after a genuine provider effect, not a whole-process outage or proof of all operations. Stock/enforcement feature activation and the remaining R5 rental, usability and launch exits stay open; Evia remains paused.

**Original-operation inspection passed.** [Read-only run 43215152035](https://github.com/WasanthaK/khrental/actions/runs/43215152035) confirmed original command `ce7208e7-bb54-4bc8-81db-8d837f0de221` completed, journal succeeded, two attempts, one completed portal step, one `sandbox.portal.recovered` audit and one matching test-mode Stripe event. Session `bps_1UawUMQ4sARuLNQac8wqZVTA` matches event `evt_1UawUMQ4sARuLNQaOaxCryPD`; customer binding passed. The exact saved provider key contains uppercase SQL UUIDs, confirming the original harness comparison mismatch corrected in #597. The automatic worker recovered after the harness failed before its provider write. This is **not** post-provider response-loss acceptance. Preserve the completed command and do not replay it. [Durable attempt/readback evidence](evidence/r5-deployed-recovery-attempts-20261112.json).

The transport and inspection blockers are resolved for this original operation. #593–#597 provide the guarded harness and default read-only inspection mode; final harness CI passed. Ready 0000491, application image `59050153ad96b10be7c1990df846363a1642c046` and one-organization worker scope remain unchanged. The now-passed separate response-loss case used a new ID only after this confirmed completion; no original state or key was reset. Evia remains paused; R5 remains open.

## Development progress and remaining acceptance — controlling queue

This section and the current engineering status above control execution. Older dated checkpoints retain their evidence, but their “next”, “not implemented”, “migration pending” and “worker off” statements are historical. The detailed [handoff task dispositions](R5-LIFECYCLE-ACCEPTANCE-20261105.md#handoff-task-level-dispositions) are reconciled to this queue; an acceptance gap must not be turned back into an implementation task.

| Workstream / task IDs | Development and rollout | Remaining acceptance or decision |
| --- | --- | --- |
| Provider-operation recovery — BL08.11 | 🟢 Implemented; journal/fencing and 100 process-interruption cases; deployed, 23/23 schema verified, single-organization worker enabled on 0000491 | 🟢 Bounded portal response-loss case passed in 43216870550: automatic attempt 2, same key/session, one step/audit/event, unchanged account/subscription. 🟡 Other operation kinds and authenticated role/resource/isolation acceptance remain. Do not repeat accepted portal proof. |
| Staged create/import — BL08.6 | 🟢 Normal forms/full metadata and exact promotion implemented; staging migration applied | 🟡 Dedicated feature readiness and controlled live actor/resource/form acceptance; recovery activation did not enable stock feature flags. |
| All-state cessation — BL08.9 | 🟢 Remaining entitlement states and cleanup integrated through #578; schema applied | 🟡 Controlled genuine-provider and deployed role/stock acceptance. |
| Restoration, split, transition consistency — BL08.7/BL08.10 | 🟢 Implemented through #579/#580 with retained history, atomic activation and SQL/process/browser fixtures; migrations applied | 🟡 Dedicated feature activation and controlled live transition/role/provider acceptance. Do not rebuild restore/split. |
| Stripe lifecycle — BL04.2/BL05.4/BL05.5/BL06.3 | 🟢 Isolated genuine lifecycle passed; retained 2→1 renewal, deployed duplicate/delayed-event ledger and within-grace failure/recovery passed | 🟡 Natural grace expiry/later recovery and remaining endpoint/job/organization-isolation coverage; bounded public template-route expiry enforcement passed. Do not advance the accepted retained clock again. |
| Management enforcement and complimentary controls — BL07/BL08.2–5/BL08.12 | 🟢 Existing endpoint/job guards and SQL fixtures retained | 🟡 Bounded public HTTP template-route expiry/revoke, stale-role/isolation and rollout/restore passed. Remaining route/job/stock coverage, privileged controls and paid-access fallback remain; full enforcement restored OFF. |
| Rental operations, retained history and usability — OP/CT04 | 🟢 Preserve accepted signing and delivered lifecycle source | 🟡 Remaining stock/expiry/negative cases, inbox receipt, retained-role reads, naturally paused DB timing and final desktop/mobile/keyboard journeys. |
| Evia service/package and matching audit — CT03.4/CT03.5 | ⏸ Paused by owner; accepted signing remains accepted | Working provider service/package and matching retention remain unaccepted; no retries or re-signing while paused. |
| Commercial/merchant/tax/privacy; LK then BN — CM/RG | 🟡 Existing decision pack and regional work retained | Owner/provider decisions and actual merchant readiness remain; no live charging or launch. BN follows LK. R2 stays deferred; distinct-replica R3 proof is only a pre-scaling requirement. |

Evidence: [schema rollout](evidence/r5-migration-apply-20261112.json), [worker activation and enabled readback](evidence/r5-recovery-activation-20261112.json), [isolated Stripe lifecycle](evidence/stripe-lifecycle-20261112.json), [retained renewal/deployed duplicate ledger](evidence/retained-stripe-renewal-20261112.json). Current application image remains `59050153ad96b10be7c1990df846363a1642c046`; #590–#597 are controls, documentation and acceptance-harness changes, not another runtime-image release. R5 remains open for the listed acceptance and launch exits.

## Current recovery and billing implementation — 12 November 2026

**Provider-operation recovery — merged and source-verified:** [PR #574](https://github.com/WasanthaK/khrental/pull/574) merged as `8b5d1f30633a83dc548415b957e77c57f31f170d`. Final head `7034d7526ffb42bae47588069f5fd646d268d020` passed [strict lint, 1,257/1,257 tests and production build](https://github.com/WasanthaK/khrental/actions/runs/43169040896), [migration/recovery SQL](https://github.com/WasanthaK/khrental/actions/runs/43169040880) and [two-tenant billing SQL](https://github.com/WasanthaK/khrental/actions/runs/43169040834). This includes 41 process-interruption cases. Customer/Checkout, portal, preview, cessation-provider and pricing-publication recovery are source-complete; do not requeue them. [Operation coverage and evidence boundaries](R5-RECOVERY-IMPLEMENTATION-20261112.md#remaining-provider-operations--pr-574) remain controlling. No deployment, migration apply or activation occurred. Workstream 1 remains yellow for staging/real-provider acceptance. **Historical next step at #574:** subsequently completed through #578–#580; use the controlling queue above.


The [canonical plan](EXECUTION-PLAN.md#canonical-current-status--12-november-2026) and [task ledger](R5-LIFECYCLE-ACCEPTANCE-20261105.md#handoff-task-level-dispositions) supersede historical implementation queues below. Forms #561 are deployed at Ready 0000488. Recovery #564–#568/#570/#572/#574 is merged, source-verified and not deployed; the latest evidence is above; historically, #572 passed 1,230 tests, lint and build in [43151088826](https://github.com/WasanthaK/khrental/actions/runs/43151088826).

The [approved discovery corrections/defaults](R5-ENGINEERING-DISCOVERY-20261112.md) authorize engineering of aggregate billing, renewal-only split differences and restoration from restoration time while preserving paid capacity. They do not publish customer terms or resolve remaining merchant, tax, FX, refund or privacy decisions. Restore/split implementation and other cessation states are unfinished. Provider-operation recovery source is complete through #574; staging and genuine provider acceptance remain open. Follow the [completed-work/reopening rule](EXECUTION-PLAN.md#completed-work-and-reopening-rule); do not repeat accepted signing, initial billing or form preparation. Production migrations/readiness and live charging remain off.

## Historical implementation and commercial checkpoints


## Implementation and commercial boundary — 11 November 2026

The [verified inventory/cessation release](R5-INVENTORY-CESSATION-RELEASE-20261110.md) and [current task ledger](R5-LIFECYCLE-ACCEPTANCE-20261105.md) supersede older implementation-pending wording below. PR #545 provides bound cancellation readback recovery; PR #547 provides private durable preparation and exact paid-confirmed promotion; PR #548 provides atomic obligations-closed cessation for paid active/ending subscriptions with retained history and renewal-only reductions/final cancellation. PR #561 supplies full-metadata normal-form preparation and retry integration with browser/SQL evidence in the task ledger; release #1546 is verified at Ready 0000488, serving `4baeabc14cd96481101cda7071d93393a4819fb2`. Production readiness and controlled live acceptance remain pending. Restoration/splits, other cessation states and broader reconciliation remain open.

These are deployed, default-off source preparations. Both new migrations remain pending under the last read-only production plan; inventory/cessation readiness flags, controlled enforcement and live charging remain OFF. All seven final cessation checks passed, including 922 tests and SQL/browser fixtures; genuine enabled-scope live acceptance is distinct.

No commercial decision changes in this documentation update. Retain monthly/no-trial, ordinary additions on the next invoice, renewal reductions, seven-day grace and authorized history/recovery. The [commercial decision pack](QUIXO-STRIPE-B02-B03-READINESS.md) retains unapproved FX/rounding, restoration timing, exceptional bulk, refund, merchant/tax/privacy choices as drafts. Older dated entries are evidence at their recorded time, not current rollout authority.

## Monthly invoice guard release — 10 November 2026

[PR #538](https://github.com/WasanthaK/khrental/pull/538) is merged as `5caced59fa6b344ca5b21a91d114203ff9151c90`. [Release 42753074986](https://github.com/WasanthaK/khrental/actions/runs/42753074986) **passed**, with Ready revision **0000476**. Independent public build readback matched `5caced59fa6b344ca5b21a91d114203ff9151c90`. The first live SQL-health read returned HTTP 503 during rollout; a subsequent independent read returned `connection=ready`, and the deployment verifier also passed live SQL connectivity. This records recovery, not an established cause of the initial unavailable response.

Final reviewed head `b3352bb98f0060c4c5d9bdb85f0516013396cba9` passed [912/912 authorization tests and build](https://github.com/WasanthaK/khrental/actions/runs/42752771309), [real disposable SQL billing/lifecycle acceptance](https://github.com/WasanthaK/khrental/actions/runs/42752771203), [migration proof](https://github.com/WasanthaK/khrental/actions/runs/42752771392), [sandbox readiness](https://github.com/WasanthaK/khrental/actions/runs/42752771193) and [webhook regression](https://github.com/WasanthaK/khrental/actions/runs/42752771224). Local focused tests passed 95/95. Real SQL and a real disposable administrator session proved expiry/risk/initial-payment denial, valid paid/ending/grace/complimentary access, ignored caller override fields, a readable HTTP 403, revocation locking, full-invoice rollback, retained tenant-scoped reads and an unaffected unselected organization. New mutation fixtures follow existing global read-only snapshot assertions; those expected counts were preserved.

**The monthly guard is deployed but rollout remains OFF; this is not full BL08 acceptance.** This release configures no enforcement enable flag or organization scope and performs no production billing-record or provider mutation. Do not activate the rollout until the remaining direct/generic/import guards, staged inventory, audited obligations-closed cessation and asynchronous reconciliation are accepted. Existing testing organizations retain their access. Historical reads and billing recovery remain available. Next engineering work is the remaining transactional business writers and inventory/cessation paths.

Genuine renewal/failure/grace/recovery, actual Platform Administrator complimentary controls, missing Evia audit retention, remaining operational/presentation cases and commercial/merchant/tax/privacy exits remain open. Signing stays accepted. R5 remains active; live charging remains disabled. Sri Lanka readiness precedes Brunei.

## Monthly invoice write enforcement preparation — 10 November 2026

The monthly invoice generator now checks management access inside its own SERIALIZABLE transaction, before invoice, component, utility or lifecycle writes. The billing-account row remains locked through commit; expiry is evaluated against the database clock. Manual and automatic scheduler callers share this boundary. Paid active/ending access, current renewal grace and valid complimentary access are admitted; missing/unverified payment, expired access and risk holds deny generation. Existing invoice reads and billing recovery are unchanged.

This is **one bounded BL08 implementation slice**, not full production enforcement or management cessation. Server rollout requires both `MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED=true` and an explicit comma-separated UUID scope in `MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS`; the default is OFF. Invalid enabled configuration fails closed, and selected organizations require schema readiness and the mutation's SQL transaction. Enrollment, payment and request bodies cannot opt an organization in. **Do not configure these controls until the complete write-path and inventory/cessation acceptance is ready.** This change does not configure production flags or restrict existing testing organizations.

The disposable SQL acceptance includes selected/unselected organizations, manual/scheduler invocation, paid/ending/grace/complimentary states, expiry/risk denial without partial writes, a real competing revocation lock timeout, invoice-write rollback and preserved tenant-scoped historical reads. These are fixtures; genuine renewal and privileged live complimentary acceptance remain separate. Direct/generic/import mutations, audited obligations-closed cessation, staged inventory and asynchronous reconciliation still require implementation. `applicationEnforcementEnabled` remains false. R5 stays active and live charging disabled; accepted signing is preserved.

## Zero-stock renewal correction — 10 November 2026

[PR #536](https://github.com/WasanthaK/khrental/pull/536) is merged as `8b67b3ebfc1cdd6647a98b89f2ef2b66bbbefcac`. Zero-stock quantity review now confirms cancellation at renewal, retains the current billed quantity, rejects renewal restoration while stock is empty, and retries ambiguous provider success using the same operation and idempotency key. This is the billing behavior for empty managed inventory; it does not implement the separate management-cessation journey.

Final reviewed head `8e1cd39645898feaf1faaee633985f376f97b30d` passed [909/909 authorization tests and production build](https://github.com/WasanthaK/khrental/actions/runs/42739324416), [disposable SQL Server migrations and billing transactions](https://github.com/WasanthaK/khrental/actions/runs/42739324179), [full browser checks](https://github.com/WasanthaK/khrental/actions/runs/42739324190), and [sandbox readiness](https://github.com/WasanthaK/khrental/actions/runs/42739324188). The SQL fixture removes its own private listing-preference child before deleting its disposable property; production foreign-key protection is unchanged. SQL proves cancellation, retained quantity, rollback/lost-response retry, durable duplicate result and empty-stock renewal denial using explicitly synthetic provider transport. Inspected zero-stock review/ending screenshots at 390px and 1440px match the final-head artifact byte-for-byte. Local focused tests passed 26/26.

[Release 42739654622](https://github.com/WasanthaK/khrental/actions/runs/42739654622) **passed**, with Ready revision **0000475** and exact serving source `8b67b3ebfc1cdd6647a98b89f2ef2b66bbbefcac`. Independent reads of the public `build-info.json` and `/api/mssql/health` matched that SHA and returned `connection=ready`. The merged-source disposable SQL verification [42739654368](https://github.com/WasanthaK/khrental/actions/runs/42739654368) also passed. Marketing is unchanged.

This checkpoint supersedes earlier source-only/CI-pending wording for PR #536. **Signing remains accepted and is not repeated. R5 remains active and incomplete; live charging stays disabled.** No existing provider subscription, occupied property, signed document or production billing record was changed for this acceptance. Genuine deployed zero-stock confirmation is unperformed.

Remaining dependencies and next work:

- BL04/BL05: connected Stripe operation discovery on 10 November still exposes clock creation only, not listing/advancement. Retain the existing clocks and subscriptions; genuine renewal, failed payment, grace expiry and recovery remain open.
- BL07: actual complimentary grant/revoke/expiry acceptance remains pending for the verified **Platform Administrator** (`AUTHORIZED_ACCOUNT`). The previously declined sign-in is not repeated. Organization-owner billing authority is separate.
- BL08: implement audited obligations-closed cessation, staged managed inventory and transaction-scoped expiry/write authority across direct, generic, import and job paths, plus asynchronous reconciliation. Preserve billing recovery, renter reads and historical documents. The current summary still reports `applicationEnforcementEnabled=false`; do not mark production enforcement complete or activate a blanket restriction for existing test organizations.
- Missing Evia audit retention remains separately open. Preserve accepted operational evidence. Remaining stock/failure/presentation, commercial/merchant/tax/privacy and Sri Lanka launch exits remain open; Brunei follows Sri Lanka.

## Sri Lanka handoff execution and owner decisions — 9 November 2026

This checkpoint incorporates the owner's 8 November signing clarification and the Sri Lanka completion handoff. **Signing is completed and accepted; do not repeat signing or reopen the whole journey.** Preserve accepted demo move-in, invoicing/receipts, maintenance, exit/relisting, organization switching and the two existing sandbox subscriptions. Missing Evia audit retention remains a separate open item. R1/R3/R4 owner dispositions and deferred R2 remain unchanged; R5 is active and live charging stays disabled.

The owner selected these business rules during handoff execution:

- After subscription expiry, management becomes **read-only**, including existing-tenancy management writes. Preserve historical documents and renter reads; billing recovery must remain available.
- Management cessation is allowed **only after obligations close**: no active tenancy, unresolved financial or maintenance work, or applicable hold.
- Ceasing the final dwelling schedules **cancellation at renewal**, with retained history and explicit resumption when stock exists. Do not create a zero-quantity subscription.

These decisions replace the corresponding open choices below. They are not evidence of full enforcement or cessation implementation. Automatic cessation eligibility, inventory staging, transaction guards across direct/generic/import/job paths, asynchronous reconciliation and actual complimentary controls remain open (BL07/BL08).

Current investigation: the live database readiness endpoint returned `connection=ready` on 9 November; the previously observed unavailable state is no longer the current observation. Platform Administrator sign-in was declined, so no authenticated complimentary mutation, receiver-ledger query or page acceptance is claimed. No repeated sign-in request was issued. Read-only provider checks confirm the retained second subscription is active with two billed dwellings and an active schedule reducing to one at **6 December 2026 12:44:35 UTC**. The connected operation search still exposes clock creation, but not listing/advancement. BL04/BL05 and genuine deployed BL06 evidence remain blocked/open; existing provider objects were retained and no provider write occurred.

The bounded source correction replaces the zero-stock policy-pending error with explicit period-end cancellation review and confirmation, preserves the current billed quantity, rejects empty-stock renewal restoration, and supports retry after a lost provider response and independent ending-state readback. It does **not** create management cessation or certify production enforcement. Local focused tests: **26/26**; affected production build: PASS; remaining stock/activation/exit/retained-document tests: **67/67**. Local full authorization: **908/909**, with the one failure caused by Chromium launch restrictions. Browser and disposable SQL evidence require CI; no deployment/live zero-stock acceptance is claimed yet.

## Current milestone disposition — 5 November 2026

The owner closed R3 for the accepted single-replica release and R4 for its deployed sandbox foundation, and made R5 the active priority. See the [canonical status](EXECUTION-PLAN.md) and [delivery ledger](R4-R5-DELIVERY.md).

The commercial contract below is unchanged. Genuine hosted payment/lifecycle acceptance, production inventory and entitlement enforcement, unresolved pricing/cessation/reactivation rules and merchant/tax readiness remain **R5 paid-launch prerequisites carried from R4**. They are not certified by the milestone closure, and live charging remains disabled. Operational R5 work proceeds without waiting for those paid-launch exits.

---

## Controlling owner decision — configurable market pricing, 30 October 2026

This section supersedes the earlier fixed-USD-5/no-app-side-pricing-edit restriction below. The owner requires **global-admin-controlled base fees and included rental-value thresholds**, informed by market research, without a code release for each price change. This is a commercial/configuration requirement for the subscription-management phase, not evidence of implemented controls or live billing activation.

### Customer offer and journey

- The base fee pays for property and rental-lifecycle management. Standard public listing is an included value-add, automatic for eligible available inventory unless the owner opts out; there is **no separate listing fee**.
- Premium/paid-prominence listings are **out of initial scope**.
- Rental seekers browse freely, choose **Express your interest**, then register/sign in and continue with that property. Do not require registration just to browse.
- Owner signup leads to adding/managing property and the governed paid subscription flow, rather than a separate pay-to-list product.

### Required Global Admin settings

| Setting | Configuration authority and meaning |
| --- | --- |
| Market | Explicit supported country/market, initially LK and BN; no silent cross-market fallback |
| Base management fee | Editable amount and billing currency, per independently rentable dwelling per month; USD 5 remains the starting baseline, not a hardcoded permanent price |
| Included monthly-rent threshold | Editable amount in the market's rent currency (e.g. LKR for LK, BND for BN); independently set using market research |
| Above-threshold adjustment | Configurable policy/rate once commercially approved; calculation basis and rounding must be explicit, with a preview |
| Effective date and version | Schedule and identify each pricing rule; retain previous versions |
| Research rationale | Record the source/date or decision note supporting the market threshold |

The user specifically approved configurability of the **base fee and threshold**. The excess fee/rate, final threshold values, billing currency overrides, FX treatment and rounding are not yet commercially finalized. Rs 25,000, USD 100 and BND 1,200 are discussion examples, not production defaults or researched market findings. No example may activate an unapproved surcharge.

Only a server-verified active **global/platform admin** may create/change these rules. Organization owners, staff, seekers and client-supplied roles/country values must not grant price-edit authority. Validate amounts/currencies, prevent stale concurrent overwrites, record actor/before/after/reason/effective time, and preview the customer price before activation. Unconfigured/incomplete market rules must not silently invent a fee or enable paid checkout.

### Billing ownership and change application

Global-admin settings govern the commercial market rules; Stripe continues to own actual payment collection, subscription/invoice state and Stripe Product/Price resources. Implement controlled, versioned synchronization/publication to Stripe as part of B05. Do not create a second application invoice/collection system or treat a saved draft admin setting as an active Stripe price.

Changing a setting must not silently reprice existing subscriptions or rewrite historical invoices. New pricing needs an explicit effective date and defined application to new subscriptions; migration of existing customers requires a separately reviewed policy. Tax-inclusive/exclusive presentation and market tax readiness remain explicit launch requirements.

**Status:** requirement recorded; admin controls, schema/API, Stripe synchronization and live pricing acceptance are not implemented by this document. Preserve the ordered website-first / subscription-management-next scope, existing merchant/tax gates, tenant isolation and no-trial decision. No Stripe object, customer charge, live account, permission, schema, feature flag or deployment is changed by this clarification.

---

## Controlling billing test-account decision — 2026-10-27

The owner explicitly confirmed the currently connected **Quixo Homes sandbox**, `AUTHORIZED_PROVIDER_OBJECT`, as the **canonical billing integration test account**. Fresh connector inventory confirms that exact account with `livemode=false`.

**Account selection is CLOSED.** This supersedes the earlier intended-sandbox selection and the account-selection blocker recorded in issue #375 and historical checkpoints. Earlier account IDs and objects remain historical evidence only; do not provision or use them for new canonical B05 work. No relationship between the old accounts is asserted or required to proceed with this newly selected sandbox.

Use the existing approved sandbox catalog and portal; do not recreate duplicates. The latest [read-only readiness checkpoint](BILLING-READINESS-20261027.md) records active sandbox Tax settings, no tax registrations and no registered webhook endpoint. Sandbox selection does not establish live merchant readiness, tax/Merchant-of-Record acceptance or paid-lifecycle acceptance. No Stripe object, credential, business profile, tax registration, subscription, charge, application configuration or replica was changed by recording this decision. Live billing and public signup remain gated.

**Decision date:** 2026-10-23  
**Status:** COMMERCIAL DIRECTION APPROVED / IMPLEMENTATION AND MERCHANT-OF-RECORD ACCEPTANCE PENDING  
**Authority:** Owner-confirmed commercial decisions in the Quixo.Homes planning conversation.  
**Scope:** Quixo.Homes B2B software subscriptions only; not tenant rental invoices, security deposits, landlord payment collection, or public marketplace commissions.

## 1. Approved commercial decisions (do not silently reopen)

| Parameter | Canonical value |
| --- | --- |
| Billing currency | USD |
| Unit price | **USD 5.00 per dwelling per month** |
| Interval | **Monthly only**; no annual price |
| Trial | **None**; no 30-day or no-card free trial |
| Paying customer | **One property-management organization** |
| Price authority | **Stripe Product/Price catalog**; no editable app-side pricing or plans |
| Subscription billing and payment | Stripe-hosted Checkout, Stripe Billing and supported Stripe-hosted customer/account management |
| Income from rental seekers | **None by default**; public property search is free |
| Rent/deposit collection | **Excluded** from this SaaS subscription; existing tenant invoices and landlord issuer identity remain separate |
| Tax liability objective | **Evaluate Stripe Managed Payments (merchant of record)** before launch; eligibility and coverage **unverified**, not automatically assumed |

The USD 5 rate is a business decision, **not evidence that a Stripe test or live Price exists**. Before a live rollout, configure the actual Product, Price, recurring interval, quantity model, tax code and, where eligible, Managed Payments settings in Stripe. Do not create live prices, subscriptions, charges or tax registrations as part of documenting this decision.

A single Product and one licensed, per-unit USD 5 recurring monthly Price are the intended starting shape; other tiers, annual periods, onboarding fees and free trials are **not** approved. Price changes in the future require a new Stripe Price, explicit migration policy and commercial authorization; never silently overwrite legacy subscription economics.

## 2. Commercial quantity and organization ownership

- The chargeable unit is an **independently rentable dwelling** (unit/apartment/whole house), not a property building, staff member, rental seeker, or signed tenancy. A building with twelve separately rentable apartments can represent twelve dwellings; a whole house offered as one unit represents one.
- Charge = `500 cents × subscribed dwelling quantity` per month **before tax**. Tax-inclusive versus exclusive presentation, proration, mid-cycle adjustments, cancellations and minimum/zero-dwelling handling remain **explicit operational policy decisions**; do not invent defaults and charge customers.
- The Quixo.Homes organization is the billed customer, not its owner as a personal renter. One authenticated organization is linked to one active Stripe Customer and its governed SaaS subscription (subject to a separately defined migration/duplicate policy).
- **Quixo.Homes is the source of truth for organization ownership and the billable dwelling inventory.** Stripe is authoritative for Product/Price, subscription item quantity charged, collection, invoices, refunds and payment/subscription state.
- Reconcile billed quantity with the server-counted, organization-scoped inventory using authenticated, idempotent commands and periodic readback; forbid cross-organization/customer/subscription reassignment.
- Do **not** allow unrestricted quantity editing in the Stripe Customer Portal when quantity is determined by dwelling inventory. The portal may expose payment methods, billing details, invoices and cancellation options as permitted by Stripe; quantity changes require controlled app-to-Stripe synchronization.
- Do **not** conflate public property listing status, rental occupancy and the billed-inventory definition. Agree the exact billable status/exclusions before implementing quantity changes.

## 3. Signup and account lifecycle (dependent design)

- **Rental seekers:** global account, browse/search/enquire without paid software subscription or automatic membership in a landlord organization.
- **Property-management operators:** global account, create/claim a separate organization only via secure verified ownership flow; a new organization remains **billing-pending / non-entitled** until a valid subscription is confirmed. No free trial is granted by delayed payment.
- **Existing renters:** access tenant documents/payments only through verified tenant membership/invitation/tenancy relationship; registering as a seeker never creates landlord-tenant authority.
- Preserve one global identity per email, server-resolved organization memberships and tenant authorization. The legacy `/auth/sign-up` path currently auto-assigns a `rentee` to the existing `kh-rentals` organization and **must be redesigned before public regional signup is exposed**. Do not rebrand existing tenant IDs/slugs as a shortcut.
- Where an operator owns multiple organizations, require an explicit context and one separately associated Stripe subscription per billable organization; no subscription ID may grant another organization's entitlements.
- Stripe Checkout should be launched only by a verified organization billing administrator; derive customer/subscription/quantity server-side; validate completion by Stripe API/webhooks, **never only by browser success redirect**.

## 4. Stripe responsibilities vs Quixo.Homes responsibilities

| Stripe authority | Quixo.Homes retained authority |
| --- | --- |
| Product, Price, currency, interval, coupons if later authorized | Organizations, members, properties and dwelling lifecycle |
| Subscription, invoice, credit and payment state | Inventory count, entitlements and authorization decisions |
| Hosted Checkout/Customer Portal or Managed Payments + Link supported tools | Authenticated organization billing entry points |
| Payment collection and Stripe-side tax accounting | Verified webhook ingestion, durable ID mapping and reconciliation |
| Eligible merchant-of-record indirect taxes under Managed Payments | Product delivery, customer support outside transaction level, audit and regional policy |

The app stores **identifiers and a verified billing entitlement projection only**, such as organization ID, Stripe Customer ID, Subscription ID, Subscription Item ID, Price ID, billed quantity, billing status, current period, last applied Stripe event, timestamps and reconciliation outcome. This is **not** an editable product, tax or plan catalog.

Implement verified signed Stripe webhooks, deduplicated event IDs, idempotent transitions, out-of-order handling, replay/reconciliation, and server-side entitlement checks. Account for `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed` (and additional events supported by the selected integration). A Checkout success page or a Stripe event alone cannot grant access to an unrelated organization.

Dunning/grace behavior, whether a failure blocks publishing vs existing tenancy operations, downgrade handling, cancellation timing and refunds require explicit and humane business rules. **Never delete tenant records, signed agreements, invoices or audit artifacts because SaaS billing lapses.**

## 5. Tax, merchant-of-record and regional release gates

**Preferred evaluation:** Stripe Managed Payments for eligible direct digital SaaS sales under Quixo, Inc. (the connected Stripe account currently available to this project is in **test mode**). US business location is listed as supported, but **Stripe must determine account/product/transaction eligibility**; a registered company or test account is not approval.

Current Stripe documentation (reviewed 2026-10-23):

- Managed Payments supports eligible automated digital SaaS sold directly, with an eligible product tax code (e.g. `txcd_10103001`, SaaS business use, subject to Stripe confirmation). It excludes Connect-platform arrangements and non-digital/assisted professional services.
- It is merchant of record for **indirect tax** where supported: calculates, collects, files and remits sales tax/VAT/GST in covered jurisdictions; Stripe/Link may issue customer-facing tax documents and transaction messages. It is **not a blanket guarantee for every jurisdiction or for corporate income taxes**.
- **Sri Lanka is absent from Stripe's published cross-border Managed Payments indirect-tax coverage list as of this review.** Do not assert that Stripe collects/remits local indirect tax there without explicit independent confirmation. Region-by-region launch approval must capture tax coverage, customer country, cross-border/domicile rules and fallback obligations.
- In non-covered jurisdictions, merchant remains responsible for applicable registrations/filing/remittance, with Stripe Tax and partner services as possible supports; do not infer that ordinary Stripe Tax transfers tax liability to Stripe.
- Verify Quixo's Merchant-of-Record acceptance, eligibility for monthly licensed/quantity-based subscriptions, linked Customer Portal and quantity adjustment behavior, applicable fees and Stripe-side customer terms/branding before implementing. Managed Payments checkouts do not support a custom domain and can be labeled Link/Sold through Link.
- Confirm the public rental marketplace remains a **separate discovery product**. Landlord rent and deposits must not be routed through Managed Payments, and no Stripe Connect payouts are implicitly approved.

References:
- https://docs.stripe.com/payments/managed-payments/eligibility
- https://docs.stripe.com/payments/managed-payments/how-it-works
- https://docs.stripe.com/payments/managed-payments/tax-compliance
- https://docs.stripe.com/payments/managed-payments/set-up
- https://docs.stripe.com/billing/subscriptions/metered-billing/thresholds
- https://docs.stripe.com/billing/subscriptions/webhooks

## 6. Ordered delivery gates

1. **B01 — Commercial decision (CLOSED):** USD 5 per dwelling monthly, no trial, Stripe-only plans, free seekers, subscriptions separate from rental payments.
2. **B02 — Stripe merchant-of-record feasibility (OPEN):** confirm Quixo, Inc. account acceptance for Managed Payments, tax coverage for initial countries, supported subscription quantity changes, fees and disclosures. Stripe Tax/Billing fallback must be explicitly approved if Managed Payments is unavailable.
3. **B03 — Billable dwelling policy (CORE RULES APPROVED; SECONDARY DETAILS/IMPLEMENTATION OPEN):** owner approved dwelling counting, vacant/listed treatment, prorated increases, reductions at renewal, 7-day payment-failure grace and preserving historic documents on cancellation. See the controlling approval in `QUIXO-STRIPE-B02-B03-READINESS.md`; zero units, proration invoice timing and detailed cancellation/write-access behavior need explicit completion.
4. **B04 — Public/organization signup redesign (OPEN):** secure seeker, renter and owner/admin journeys with verified tenant isolation and no auto-attach of public seekers to `kh-rentals`; handle payment-pending organizations without an implicit trial.
5. **B05 — Stripe test-mode catalog and integration (NOT STARTED):** after B02/B03 decisions, configure Stripe test Product and Price using Stripe-owned configuration, Checkout, portal settings, webhooks and customer linkage; prove no live keys/charges.
6. **B06 — Two-organization quantity and failure acceptance (NOT STARTED):** same identity in multiple organizations, per-org subscription isolation, count change, duplicate events, retries, tax-region cases, cancellation and no destructive data loss.
7. **B07 — Regional launch (BLOCKED):** approve supported pilot country, completed merchant/tax mapping, legally reviewed checkout disclosures and price presentation, secure live payment activation and evidence-based launch decision.

**Boundary with existing execution plan:** preserve Phase 4 original C02/C03/C05 acceptance and Invoice Designer I02 default-off release separately. Existing tenant rent invoice PDFs and issuer details are not Stripe SaaS invoices. Current domain/marketing deployment work is independent.

**Change control:** This document approves **requirements and architecture planning only**. It does not authorize live Stripe objects, real payments, invoice issuance, SQL writes, workflow feature activation or changes to historical financial records.

**B02/B03 status note (2026-10-23):** See the detailed [merchant-readiness evidence and proposed dwelling/quantity lifecycle](QUIXO-STRIPE-B02-B03-READINESS.md). Stripe account screening is read-only and **not an eligibility approval**. B03 business rules are proposed only; no subscriptions, products, prices or transactions were created. B02 and B03 remain **OPEN** pending owner/Stripe decisions.


**B03 owner approval (2026-10-23):** The previous B02/B03 status note above predates approval of the eight summarized commercial dwelling rules. [B03 approval and remaining implementation details](QUIXO-STRIPE-B02-B03-READINESS.md#b03-owner-confirmation--approved-dwelling-charging-rules-2026-10-23) is controlling; **do not mark B03 implemented or close B02**.


**B04 architecture review (2026-10-23):** See [secure seeker, owner and existing-renter registration design](QUIXO-HOMES-B04-SIGNUP-ARCHITECTURE.md). Existing public sign-up still auto-attaches new users to `kh-rentals`, and generic email linking requires explicit security remediation before public marketplace onboarding. B04 remains **OPEN / DESIGN-ONLY**.
