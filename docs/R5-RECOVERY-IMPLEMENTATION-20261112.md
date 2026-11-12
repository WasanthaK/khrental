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

Still open: disabled worker and read-only dry-run, account-aware invariants, remaining operation migrations, process-interruption harness, full clock/replay coverage, split/restore, remaining cessation states and supported Evia retrieval/audit acceptance. The original R5 ledger remains open.
