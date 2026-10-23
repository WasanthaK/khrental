# B04 S3a — Pending email verification ledger and token contract

**Scope:** Source and an additive, **unapplied** SQL migration for a future global rental-seeker registration service. This does not create an endpoint, change existing `/auth/sign-up`, send email, alter a user/membership, introduce a free trial or activate public signup.

## Dependency and authority

- Prior B04 S2b aggregate-only production audit found **zero legacy-only membership pointers**, allowing the obsolete tenant fallback to be retired in PR #373.
- The existing canonical invitation/password-reset flows retain sole ownership of existing identities. Matching an email must **never** claim an unlinked `app_users` identity.
- Global seeker registration must create **no tenant membership**, no paid property management entitlement, and no authorization through `app_users.tenant_id`. The owner organization flow is a separate `billing_pending` transaction.
- The current `/auth/sign-up` behavior remains legacy renter registration; do not promote it as global-seeker signup.

## What S3a stages

- `migrations/20261023_01_create_public_signup_challenges.sql`: idempotent, `XACT_ABORT` SQL Server table with email-normalized and display-name fields, 64-character SHA-256 token hash (unique), issue/sent/expiry/consumption/revocation timestamps, send and verification-attempt counters. No tenant, user or password columns. A stored record is **not** a user, account or session.
- `src/api/auth/publicSignupChallenge.js`: 256-bit cryptographic URL-safe random token, deterministic SHA-256 hash and constant-time digest comparison. **Only the digest may enter the ledger**. A future email-delivery adapter handles the raw opaque token in memory.
- `tests/public-signup-challenge-contract.test.js`: regression tests for entropy/shape, invalid tokens, schema isolation and absence of direct user/membership creation. Wired into the existing `test:authorization` suite.

## Explicitly pending S3b/S3c (NOT implemented by S3a)

1. Governed dedicated SQL migration: disposable SQL Server syntax/idempotence + rollback evidence, then separate privileged production apply only when authorized. SQL files in source are not automatically applied.
2. Default-off, rate-limited signup challenge endpoint with generic responses (no account enumeration), normalized email checks, CSRF/abuse limits, no plaintext password before verification, secure SendGrid mail and resend invalidation/TTL cleanup.
3. Redeem endpoint: hash verification with transaction row lock, expiry/consumed/revoked/attempt checks, unique-email race prevention across **both** global `auth_users` and `app_users`, password collected at redemption and hashed using the existing approved scrypt verifier.
4. Atomically create the global `app_users` row (`tenant_id=NULL`, seeker identity only), linked `auth_users` record, and mark challenge consumed, or roll back all effects. No membership and no platform/tenant-admin grant.
5. Seeker-only, no-membership authenticated UI and extensive negative authorization tests, invitation/recovery coexistence, two-organization browser acceptance, and Azure Ready/build fingerprint before public exposure.
6. B03/B05 independent organization billing controls: server-derived dwelling count, $5/dwelling monthly, next-invoice proration, organization-bound Checkout, signed/idempotent Stripe webhooks and approved admin comps. Do not route landlord rent/deposits through Stripe SaaS.

**Security conditions before any live endpoint:** Rate limits must be enforced *outside* the pending table's attempt counter as well; tokens must not appear in logs; no claim of an existing account by email; replay/concurrency failure closes without orphans. A successful Checkout redirect is not proof of paid entitlement.

## Acceptance status

- S3a pure token/schema contract tests: locally exercised, **3/3 passing** in the isolated file checkout; whole-repository CI is separate.
- No disposable SQL Server execution proof yet, no migrations applied, no new endpoint, no signup feature flag enabled, no email or customer/Stripe writes.
- B04 S3 is **IN PROGRESS**, not accepted. Only after PR checks, applicable SQL proof and later protected integration can feature activation be reconsidered.
