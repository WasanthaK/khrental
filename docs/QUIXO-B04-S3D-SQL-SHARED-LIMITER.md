# B04 S3d — Shared public-signup limiter on the existing Azure SQL database

**Owner decision, 2026-10-24:** Use the existing Azure SQL infrastructure rather than purchasing Azure Managed Redis. No additional Azure service, recurring Redis cost, or Redis secret is required.

## Implementation — source only

- `migrations/20261024_01_create_public_signup_rate_limits.sql` introduces one additive, tenantless `dbo.public_signup_rate_limits` table, guarded by the already-staged B04 S3a challenge schema. It contains **only** HMAC-SHA256 digest, fixed-window UTC start, bounded request count and UTC timestamp. No email, client IP, user ID, tenant, credential, lease, invoice, payment, Evia or signed document data. It is idempotent and does not backfill/modify/delete existing tenant or account records.
- `src/api/auth/publicSignupSqlLimiter.js` implements the previously expected `{ durable:true, consume({key,scope,max,windowSeconds}) }` interface. `sql.Transaction` with `SERIALIZABLE` isolation and a `WITH (UPDLOCK,HOLDLOCK)` lookup on the unique digest key serializes the first insert and later increments across **all Azure Container Apps replicas sharing the existing SQL database**. It uses the database UTC clock for one-hour fixed windows, never increases counts past quota and denies during DB outage, missing DDL, deadlock, malformed input or uncertain transaction outcome. No fallback to in-memory per-replica counters.
- The existing `hashPublicSignupThrottleKey` HMAC already domain-separates `challenge-ip`, `challenge-email` and `redeem-ip` with a high-entropy secret; only the digest enters SQL.
- **Real SQL acceptance** added to the existing disposable Docker SQL Server 2022 harness: migration first and second apply, schema/PII checks, 24 simultaneous attempts from two separate client adapter instances sharing the DB with **exactly four** successful admissions, persisted count and no reset on denial, separate email/IP/redeem scopes, expiration/refill and fail-closed database outage.
- Authorization source tests enforce transaction locking, safe schema, valid HMAC only and no server mount. Existing billing and tenant regression workflows are reused.

## Deployment gates — not implicitly authorized by code merge

1. Current source PR changes **no live DB**. Before SQL apply, capture schema state in production and verify the required S3a `dbo.public_signup_challenges` migration is present. Apply the additive SQL migration only through the established, approved production migration verification process with preflight and postflight; never run DDL on app startup. Record release/audit evidence.
2. Provision the same `PUBLIC_SIGNUP_THROTTLE_SECRET` securely to every replica. Validate trusted Azure ingress client IP parsing, refusal of attacker-supplied forwarded headers, origin/CSRF policy and the two-organization denial suite. The SQL limiter does not resolve proxy/header trust itself.
3. Wire the SQL limiter, approved sender, challenge/redeem services and session adapters into a strictly **default-off** public signup router through a separately gated release. Existing `server.js` does not yet mount this router.
4. Perform a true multi-replica production-like acceptance against shared SQL, including duplicate/parallel/replay, one-hour refill, database outage and latency/lock contention. Source simulation and disposable SQL are not proof of Azure operational readiness.
5. Define a housekeeping task for buckets older than the chosen retention period with bounded, auditable SQL cleanup; **no unapproved deletion** is in this PR. Monitor SQL growth, waits and application request latency.
6. After all infrastructure/security/user-journey checks, explicitly approve first canary. Public signup flag remains OFF by default.

## Cost and canonical implications

This reuses an **existing billed Azure SQL** resource and avoids a new Azure Managed Redis subscription. Additional SQL storage, DTUs/vCores, reads/writes and transaction contention may affect the existing database bill/performance. Start with the bounded rates already in `publicSignupRegistrationRouter`: 12/hour/source IP for challenge, 4/hour/email, 12/hour/source IP for redeem, subject to abuse review.

The older Azure Redis adapter and inventory sources remain inert, but are no longer the selected implementation. Document that in canonical blocker #388 and do not proceed with Redis provisioning.

**No Redis purchased, no production SQL DDL applied, no public email sent, no demo renters deleted, and no Stripe payment changed.**
