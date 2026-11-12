# R5 recovery implementation — 12 November 2026

The owner approved the four corrections in [discovery](R5-ENGINEERING-DISCOVERY-20261112.md) and confirmed there are no production clients. This is implementation evidence, not R5 acceptance or a production activation record.

## Slice 1: durable cancellation

The existing command identity, tenant lock, payload hash, public result and provider keys remain authoritative. Two additive tables retain recovery ownership and named provider steps. Cancellation is the first migrated command type; other provider operations remain on their existing paths until individually migrated and verified.

`MANAGEMENT_RECOVERY_SCHEMA_READY=true` enables the new cancellation path only after the migration is applied. Absent/false retains existing behaviour and does not query the new tables. No environment value is changed by this PR. There is no automatic worker in this slice. Explicit retries and the existing cancellation-reconciliation endpoint use the journal when present.

Each provider step commits its input hash, input and stable key before the write. A mandatory provider readback can prove success after a lost response. After 23 hours an unconfirmed step requires review instead of issuing a fresh write. Existing `quixo:{tenantId}:{commandId}` and `:release` keys are preserved. Schedule release and cancellation are separate checkpoints; the final projection, command result, journal completion and audit share a transaction. Provider writes occur outside SQL transactions; final projection still uses the existing transaction with provider reads.

Database time controls five-minute leases and backoff. Every new claim increments an attempt count, capped at eight. A replaced/expired claim cannot checkpoint or complete an operation. Authority and subscription binding are checked before writes, and current actor authority is checked again at completion. Review logs contain command identity and a bounded error code, never raw provider errors. The injectable application clock controls only the conservative provider-key age calculation.

Forward recovery is permitted only when the saved subscription/customer and current provider state prove the intended effect. No automatic compensating charge, credit, cancellation reversal or new subscription is permitted. Unsupported/changed bindings and unprovable old effects stop for review. A terminal cancelled subscription needs a later explicit recovery policy; this slice does not claim that case accepted.

## Migration and rollback

`20261112_01_management_recovery.sql` is additive and replayable. The existing governed runner registers it and inspects columns, identities, checks, foreign keys and the due-work index. The disposable SQL harness applies it twice, tests constraint drift and exercises the real locking/journal boundary with synthetic provider transport.

Owner-run sequence after review:

1. Use the governed migration workflow in **plan** mode through `20261112_01_management_recovery`; review pending prerequisites and permissions. Plan mode performs no DDL.
2. Apply reviewed prerequisites and this migration using the dedicated executor, then inspect/verify the schema. Do not set readiness on an unverified schema.
3. Before any future worker activation, accept a staging dry-run and its bounded recovery evidence. The worker is not delivered in this slice.

Rollback: stop new recovery work by disabling readiness/any future worker flag, retain all journal and step evidence, and review unfinished commands before routing them through an older code version. Do not drop the tables or reset pending operations/keys. Disabling readiness alone is **not** permission to replay a journaled operation through legacy code: drain or hold those commands first.

## Verification and remaining scope

New unit scenarios cover lost cancellation/schedule responses, local completion failure, aged unconfirmed effects, fencing and the attempt cap. Existing paid/ending/zero-stock tests remain unchanged. The disposable SQL proof covers persisted intent before writes, old-effect readback, cross-tenant denial, single-owner claims, replaced-worker fencing, revoked authority and attempt exhaustion.

Full strict lint and production build pass locally. The full local suite requires browser process permissions unavailable in this workspace; browser and real SQL acceptance must come from CI. No real provider payment, migration apply, production recovery or launch is claimed.

Still open after slice 1: disabled worker and read-only dry-run, account-aware invariants, remaining operation migrations, process-interruption harness, full clock/replay coverage, split/restore, remaining cessation states and supported Evia retrieval/audit acceptance. The original R5 ledger remains open.

## Slice 2: scoped worker and inspection

The worker reuses the journal's claim/fencing/backoff authority. It selects at most ten pending journaled operations per workspace and at most ten explicitly named workspaces. Completed and unjournaled legacy commands are not candidates. Review items are visible to inspection but never automatically retried. Competing workers may select the same operation; only the database lease winner proceeds.

The server scheduler is inert unless `MANAGEMENT_RECOVERY_WORKER_ENABLED=true`. Activation also requires verified recovery schema, sandbox billing and a nonempty comma-separated `MANAGEMENT_RECOVERY_TENANT_IDS` UUID list. The first scan is delayed 30 seconds; subsequent scans begin 60 seconds after the preceding scan finishes. Shutdown waits for an in-flight scan before closing the database pool. No activation setting is changed by this implementation.

`node scripts/inspect-management-recovery.mjs` is always read-only and accepts no apply option. It selects scoped candidate IDs, states, attempts and due/lease times; it creates no claims, audit rows or timestamps and has no provider client. Run only against the approved staging database for handoff acceptance. A successful dry-run is inspection evidence, not permission to enable the worker.

Focused tests cover dry-run isolation, default-off/configuration gates, explicit selection, a competing claim, serialized scheduling and shutdown. The disposable SQL proof compares persisted journal metadata before and after inspection. Invariants and other operation types remain separate pending work.

## Slice 3: read-only billing invariants

`node scripts/inspect-management-billing-invariants.mjs WORKSPACE_UUID` observes current paid capacity, operational inventory and next-renewal quantity separately. It verifies the sandbox account/customer/subscription/item binding, current quantity, cancellation state and current/next schedule phases. Paid cessation may retain current quantity while renewal quantity falls; zero stock may retain a positive current item while cancellation makes renewal quantity zero. A complimentary overlay may coexist with paid obligations without requiring a new charge or automatic cancellation.

The inspector never repairs data, claims work or emits provider POSTs. It takes two local snapshots around provider GETs and reports `inconclusive` if local state changed. A pending command prevents a `consistent` verdict even when the observed quantities match. A cancelled subscription with retained stock reports `reactivationRequired`; it creates no checkout. Provider responses, inventory labels and personal payloads are not emitted in the result.

This is a bounded consistency observation, not proof that a provider cannot change immediately afterward, not proration evidence, and not write authorization. The seven focused tests cover scheduled reduction/increase, zero stock, complimentary expiry, terminal reactivation, drift, pending work and snapshot races. The disposable SQL harness also observes the retained positive current quantity and zero renewal quantity without changing journal metadata. Operation-specific idempotency and real provider event acceptance remain separate requirements.

## Slice 4: application clock and synthetic replay

Billing service/store factories accept an application clock; their default and the contract/provider helper defaults share `clock.js`. Entitlement display, complimentary validation, provider failure-history windows/projection, preview/proration timing, legacy key age and recovery key age use that dependency. No API accepts a client clock. Transactional write authorization, leases and persisted database dates still use SQL time; the existing database-time authorization regression remains unchanged.

The replay fixture exercises the actual billing service/webhook code with a transactional in-memory store and a strictly GET-only synthetic provider. Scenarios cover initial paid access, renewal failure, pinned seven-day grace despite retries, exact expiry, recovery, duplicate delivery, delayed old-failure delivery after recovery, complimentary expiry without provider traffic, and foreign-subscription rollback. The fixed clock is deliberately independent of machine time.

This is **synthetic replay**, not a captured Stripe event, genuine recurring charge, provider test-clock advancement or merchant acceptance. Existing SQL and genuine-provider acceptance requirements remain open. Property transitions and every interruption point still need their own operation-specific tests as those types migrate.

## Slice 5: actual cancellation process interruption

Five tests terminate a child process with `SIGKILL` after claim persistence, step intent persistence, provider effect, step checkpoint and final completion. Two subsequent fresh processes resume the same command; each scenario proves one stable provider key/write and one durable completion. The handler and runner are the actual cancellation implementation.

This harness substitutes atomic test files for SQL/provider durability. It tests abrupt process termination rather than caught exceptions, but does not claim a real SQL process-kill or Stripe outage. Actual SQL claim exclusivity, fencing, revoked authority and audit rollback remain covered separately by the disposable SQL integration suite. Other command types still require migration and their own interruption cases.

## Slice 6: quantity-application recovery

New quantity-application commands use the same readiness-gated journal. Existing unjournaled commands retain their original route and keys. The reviewed preview, inventory hash, subscription/item/price, period and schedule fingerprint commit before a provider write. Inventory is checked again before writes and final completion. Exact staged promotion, final projection, command completion and audit retain one SQL transaction.

Named steps cover schedule creation, phase updates and prorated increases; zero-stock reuses cancellation with the existing `:zero-stock` key. Increases keep `create_prorations` and the reviewed proration date; reductions remain renewal-only. No quantity-zero item is created. A request event matching the persisted idempotency key and bound resource is required to attribute an ambiguous proration/schedule effect. Equal quantity alone is insufficient. Missing/delayed evidence defers the attempt; exhausted attempts or old unprovable effects require review. No compensating charge or fresh retry key is generated.

Evidence uses bounded GET `/v1/events` reads and retains only event IDs. Stripe's [event object](https://docs.stripe.com/api/events/object) exposes request/idempotency identity; event payloads may reflect their original API version, so unmatched shapes fail closed. [Schedule creation](https://docs.stripe.com/api/subscription_schedules/create) with `from_subscription` does not accept other modifications; creation and [phase update](https://docs.stripe.com/api/subscription_schedules/update) remain separate steps. The existing pinned API version is unchanged. A pre-existing, exactly matching reviewed schedule can be confirmed without another provider write. Period rollover or changed schedule state prevents replay of an old write.

Unit scenarios cover lost increase/create/phases responses, recovery after 48 hours, mismatched request evidence, zero stock and period rollover. The real SQL extension uses synthetic request events to verify prepared-stock promotion, creation/phases recovery and final-stock cancellation without duplicate effects. These are engineering proofs, not genuine provider proration or recurring-charge acceptance. Other provider command types and dependent stock features remain open.


### Slice 6 verified checkpoint

Quantity recovery [PR #570](https://github.com/WasanthaK/khrental/pull/570) merged as `8175d9587d32d657bedc3ee67e4bf81c1edddedd`. Final head `3e715e7b69f0f0a2b501904e6f315504a7c0ef15` passed strict lint, **1,212/1,212 tests and build** ([43144399885](https://github.com/WasanthaK/khrental/actions/runs/43144399885)), [migration/recovery SQL](https://github.com/WasanthaK/khrental/actions/runs/43144399988) and [two-tenant SQL](https://github.com/WasanthaK/khrental/actions/runs/43144400074). Sandbox readiness intentionally skipped on the PR. The SQL proof uses synthetic provider events; no genuine payment acceptance, deployment, migration apply or activation occurred.

The disposable SQL fixture supplies residential metadata and removes insert-trigger-created listing preferences before deleting its three synthetic properties. Production foreign keys and retention behavior are unchanged. Remaining work starts with other provider operation types and their interruption/evidence cases, followed by split/restore, wider cessation and supported Evia retrieval/audit. The execution environment became unavailable after this slice; GitHub CI supplied final validation. No remaining item is marked accepted by this checkpoint.

## Quantity recovery process-interruption continuation

The existing SIGKILL fixture now executes the actual quantity recovery handler for increases, renewal-only reductions (schedule creation and phase updates), and final-stock cancellation. Eighteen added cases terminate after claim/completion or after each named step's intent, provider effect and checkpoint. Two fresh sequential processes resume each case and verify exactly one write per expected key, one completion, preserved current paid capacity for reductions/zero stock, and the intended renewal quantity. The five existing cancellation cases remain covered.

The fixture persists synthetic provider state and request-event evidence together on disk; it counts every POST rather than masking repeated requests with fake idempotency. This proves process restart/readback behavior, not concurrent SQL fencing, genuine provider events, power-loss durability or production activation. Separate SQL and provider acceptance requirements remain unchanged.

[PR #572](https://github.com/WasanthaK/khrental/pull/572) merged as `b64d756e8d8eb942e0534b55c6bb031b2e9edf07`. Final head `585bcc67cbae51596cd6d35d7779e745160f5ba9` passed strict lint, **1,230/1,230 tests** and production build in [CI 43151088826](https://github.com/WasanthaK/khrental/actions/runs/43151088826), including both browser tests blocked locally. Its 23 process-interruption cases comprise five cancellation and 18 quantity cases. This is synthetic provider/durable-file restart proof; SQL fencing and genuine provider acceptance are separate. No runtime deployment, migration or activation occurred. Local process tests, strict lint and build also passed. The local browser limitation is superseded by CI for this exact source head. No runtime code, migration, readiness flag or production deployment is changed. Remaining operation migrations, restore/split, broader cessation and Evia acceptance remain open.

## Remaining provider operations — PR #574

**Provider-operation recovery — merged and source-verified:** [PR #574](https://github.com/WasanthaK/khrental/pull/574) merged as `8b5d1f30633a83dc548415b957e77c57f31f170d`. Final head `7034d7526ffb42bae47588069f5fd646d268d020` passed [strict lint, 1,257/1,257 tests and production build](https://github.com/WasanthaK/khrental/actions/runs/43169040896), [migration/recovery SQL](https://github.com/WasanthaK/khrental/actions/runs/43169040880) and [two-tenant billing SQL](https://github.com/WasanthaK/khrental/actions/runs/43169040834). This includes 41 process-interruption cases. Customer/Checkout, portal, preview, cessation-provider and pricing-publication recovery are source-complete; do not requeue them. [Operation coverage and evidence boundaries](R5-RECOVERY-IMPLEMENTATION-20261112.md#remaining-provider-operations--pr-574) remain controlling. No deployment, migration apply or activation occurred. Workstream 1 remains yellow for staging/real-provider acceptance. **Active next engineering:** grace/trial cessation cleanup integration, then restore/split and the controlled acceptance matrix.

The remaining tenant operation types now use the existing readiness-gated command/step journal. Unjournaled legacy commands keep their previous routes and keys. No migration, readiness flag, worker activation or deployment is performed by this change.

| Operation | Durable recovery and terminal policy |
| --- | --- |
| Customer creation | Persist the original `:customer` key and operation/workspace metadata before POST. Require the matching sandbox `customer.created` request event and current customer readback after response loss; do not invent a replacement customer after key retention. |
| Checkout creation | Persist reviewed inventory, price and return origin. Recover the unique metadata-bound session from a fully exhausted bounded customer listing and verify its line items. Reuse a validated earlier open session. Bind customer/inventory/result/audit atomically; paid confirmation/promotion retains its existing authority. Expired/completed sessions are terminal outcomes with a next action, not automatic new purchases. |
| Portal session | Retain the original unsuffixed key, recheck disabled subscription-changing controls, and recover by the matching portal creation event. The step stores identity only; hosted URLs are not stored in step metadata or logs. A five-minute conservative validity window ends the command and prompts a fresh user action, without background replacement sessions. |
| Invoice preview | Persist exact quantity/proration inputs and the original unsuffixed key. A valid POST response can checkpoint only total/currency. Lost responses reuse the same input/key within the ten-minute preview window; expiry completes the command with a new-preview prompt. No payable invoice is created. |
| Cessation provider calls | Prepare the original resource, inventory and obligation checks; reuse quantity/cancellation steps with existing suffixes. Recheck authority/stock/obligations before writes. Commit cessation, inventory projection, result and audit together only after provider confirmation. Existing paid/ending semantics are preserved; additional entitlement states belong to the next workstream. |
| Price publication | Platform-scoped operation, not a tenant worker command. Reuse the existing immutable pricing-version row and append-only audit as a hash-only attempt journal, committed before POST. Keep the publication lock and original `quixo:pricing:{versionId}` key; recheck platform authority inside each transaction, exhaust bounded price listings, recover version-tagged prices, cap at eight attempts and forbid unproven writes after 23 hours from the immutable version creation (conservatively covering pre-journal attempts). Final publication and audit remain atomic. No new pricing model/table or live publication is introduced. |

Shared rollback rule: hold/drain journaled commands before selecting legacy routing. Turning off readiness is not permission to replay an unfinished journaled effect through old code. Review states never produce an automatic credit, reversal, fresh key or purchase. Pricing recovery requires an authenticated platform action; it is intentionally outside the tenant-scoped automatic worker.

Provider references checked for this implementation: [portal sessions](https://docs.stripe.com/api/customer_portal/sessions) document creation events and short-lived links; [invoice previews](https://docs.stripe.com/api/invoices/create_preview) are not payable/listed invoices; [Checkout listing](https://docs.stripe.com/api/checkout/sessions/list) provides customer-scoped readback. The pinned API version is unchanged. These references are contract research, not genuine provider acceptance.

Validation: 18 additional SIGKILL/restart cases run actual customer/Checkout, portal and preview handlers, bringing the process suite to 41 cases. Pricing tests exercise response loss, final audit rollback, aged missing evidence, duplicate ownership, changed terms, revoked authority, incomplete listings and attempt exhaustion. The disposable SQL extension exercises actual command/step/service transactions for customer/Checkout losses, cross-tenant denial, open-session reuse, portal expiry/configuration, exact preview retry and cessation recovery. Synthetic transport and durable-file process tests remain distinct from genuine Stripe and concurrent real-SQL process-kill acceptance. Exact final-head CI is linked above and passed; do not infer deployment or staging acceptance from source verification.

## Cessation without provider writes — merged PR #576

The merged Workstream 3 subset adds journaled local cessation for complimentary (including no subscription), incomplete/incomplete-expired, unpaid, expired grace and cancelled accounts. Existing paid active/ending routes and unjournaled legacy commands are preserved. The recovery schema flag gates the extension. Obligations, authority, binding and inventory remain checked; cessation, inventory snapshot, result and audit commit together. No Stripe write, purchase, refund, invoice void or automatic cancellation is made. Complimentary access never extends its expiry or erases underlying paid obligations. A changed access state stops an unfinished local operation for review.

The invariant checker permits retained provider quantity in these explicitly non-renewal-management states while still checking provider/customer/item/status/schedule bindings. The UI says subscription and existing invoices are unchanged rather than promising a renewal reduction. Unit policy cells and real-SQL rollback/retry scenarios cover the new states; final CI and browser evidence are recorded on the slice PR. This is implementation evidence, not genuine provider acceptance.

Still open: grace/trial provider cleanup (no trial enrolment), restore/split, the full state-by-action matrix, new-operation process-interruption evidence and restore/cease transition sequences. Do not mark Workstream 3 complete from this subset. Production remains unchanged.


**Workstream 3 checkpoint:** [PR #576](https://github.com/WasanthaK/khrental/pull/576) merged as `9c1d2d15bda3cff4b8332932140c56df9e60555b`. No-provider-write cessation is source-verified: final head `6de7c0dbfdba0e3754489944c0b5971bd37b05b0` passed [1,274 tests, strict lint and build](https://github.com/WasanthaK/khrental/actions/runs/43171321653), [recovery SQL](https://github.com/WasanthaK/khrental/actions/runs/43171321715), [two-tenant SQL](https://github.com/WasanthaK/khrental/actions/runs/43171321700) and [desktop/mobile/keyboard browser acceptance](https://github.com/WasanthaK/khrental/actions/runs/43171321646). Do not reimplement this subset. The next source slice adds the grace/trial provider cleanup handler and 36 crash/restart cases, but deliberately does not register it in the service. **Next:** integrate reviewed cleanup intent, SQL-time authority/expiry checks, atomic stock completion, restricted trial readback/invariants and customer preview; then prove SQL rollback, webhook/retry and desktop/mobile acceptance. Restore/split follows. [Exact scope and evidence](R5-RECOVERY-IMPLEMENTATION-20261112.md#gracetrial-cleanup-recovery-component) control; Workstream 3 and R5 remain incomplete. No deployment or activation.

## Grace/trial cleanup recovery component

The provider-only component in `recoveryQuantity.js` is not registered in the service: no endpoint, trial access, enrollment or production behavior changes in this slice. It accepts only a saved cessation intent with a positive original quantity, non-increasing target, exact sandbox customer/subscription/item/price/period and trial dates. It rejects changed provider status, ownership, quantity or schedules. Existing paid and local-only cessation routes are untouched.

A reviewed schedule release and subscription cleanup have separate journal steps and original persisted keys (`:cleanup-release`, `:cleanup`). Release and mutation recovery require matching provider request evidence, not quantity equality alone. A reduction uses `proration_behavior=none`; already-finalized unpaid invoices and their retries retain their original amounts. Final stock or already-ending subscriptions retain positive current quantity and use period-end cancellation. No invoice, credit, payment, price, billing-anchor or trial-date write is issued. This is cleanup of an existing trial only, never a trial offering or proof of management entitlement.

Local focused validation passes **77 process-interruption cases** (41 preserved plus 36 new) and **19 cleanup safety tests**. Each new process case kills a real child process at claim, step intent, provider effect, checkpoint or completion and resumes twice. The provider and journal use durable test files; this is not genuine Stripe evidence or real-SQL crash acceptance. Safety cases include live/foreign objects, recovered/expired provider status, term drift, unproven equal quantity, wrong request key, aged missing evidence and a prewrite authorization denial. Full CI evidence belongs in the PR.

**Integration still required:** persist cleanup mode and reviewed provider terms; authorize active grace with locked SQL time; stop on complimentary/risk/status/expiry transitions; atomically commit ceased inventory/result/audit only after provider confirmation; narrowly project existing trial cleanup without paid access; reconcile webhook/invariant behavior; show accurate preview/result copy; test transactional rollback and desktop/mobile journeys. The component alone does not establish those guarantees. Keep this integration queued rather than rebuilding the component or reopening accepted paid/local-only cessation. Restore/split and broader state/transition/genuine-provider acceptance remain open.
