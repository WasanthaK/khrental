# B04 S3b1 — Transactional global seeker identity redemption (unmounted)

**Status:** source implementation and disposable SQL integration proof; **public registration OFF**, migration not applied to production.

## Dependency

- B04 S3a [PR #376](https://github.com/WasanthaK/khrental/pull/376) merged, staging `dbo.public_signup_challenges` and cryptographic 256-bit email tokens. The table is **not** present in production by virtue of merging a SQL file.
- S2b [PR #373](https://github.com/WasanthaK/khrental/pull/373) retired legacy `app_users.tenant_id` as business authority; verified tenant membership is required for private APIs.
- The public `/auth/sign-up` route is **legacy renter signup** and remains untouched. The new redemption service is not wired into `server.js`.

## Bounded S3b1 implementation

`src/api/auth/publicSignupRedemption.js` accepts only a server-delivered one-time verification token and a bounded password. Its caller will be a future default-off dedicated global registration endpoint—not an authenticated tenant user-creation RPC.

1. Validate strict base64url token format; hash to SHA-256. Reject invalid shape before hitting SQL. Validate password length (12–256), derive scrypt salt and hash using the established auth credential module before acquiring locks.
2. Begin **SERIALIZABLE** SQL transaction against `dbo.public_signup_challenges`, select the digest row with `UPDLOCK, HOLDLOCK`; refuse absent, consumed, revoked, expired, attempt-exhausted and malformed entries.
3. Lock/inspect **both** `app_users` and `auth_users` by normalized email; **never claim an existing unlinked renter/invited app user** or overwrite an auth credential.
4. Insert one global `app_users` record with `tenant_id = NULL`, `role = authenticated`, `user_type = seeker`. Insert one matching `auth_users` record using the same new `auth_id` and linked `app_user_id`; password only persists as salted scrypt hash, with non-secret global email-verified metadata.
5. Conditional consume of the one-time challenge and commit **atomically**. Any error rolls back new account records and consumption. Unique SQL constraints prevent concurrent duplicate identities; do not expose SQL internals to anonymous callers.
6. The service returns only linkage IDs and tenantless role projection for the future caller. **It does not issue an auth session**, assign any membership, provision an organization, send emails, grant paid entitlements or create Stripe records.

## Acceptance and negative tests

- New pure tests under `tests/public-signup-redemption-contract.test.js`: invalid/short token rejection, password bound checks before SQL, correct transaction/locking pattern and no public route.
- Existing disposable SQL Server acceptance harness calls the real service against an isolated Docker database (never production): single seeker identity with linked real password verifier, zero tenant memberships, zero tenant creation, replay denied, expired/revoked denied, preexisting unclaimed renter protected, injected SQL failure rolls back both account records, safe retry and concurrent same-token redemption commits at most once.
- Existing `npm run test:authorization` and `npm run test:billing:sqlserver` workflows provide standard CI. Require exact PR-head tests/build plus independent SQL proof before merge.

## S3b2 and S3c remain pending

**Do not enable public signup with S3b1 alone.** Additional work needed:
- Default-off dedicated endpoint for **challenge issue and resend**, server-normalized email, request/attempt throttling and anti-automation/rate limiting with shared distributed enforcement, constant generic responses, duplicate-account and invitation handling, and an explicit email delivery/outbox ledger.
- Verified SendGrid mail acceptance and operator-controlled sender/domain, safe URL base and no secrets/tokens/PII in access logs; harden referrer/caching/link handling. Do not interpret provider acceptance as email delivery.
- Default-off dedicated **redeem** endpoint, verification-rate limits, safe global session only after commit, anti-CSRF/session rules and exhaustive negative HTTP/SQL tests.
- S3c browser UX for no-membership seekers; separate owner billing-pending organizations; public listing projection privacy; two-org Ready deployment acceptance.
- Production S3a migration has to follow existing governed migration plan/apply/strict verification and explicit release gate before any live runtime functionality; SQL file merge alone is no evidence of deployed schema.

**Stripe B05 remains independent:** server-authoritative dwelling count, $5/dwelling/month, next-invoice prorations and audited admin comp; no direct public pricing table purchase bypass and no paid access from a Checkout redirect.
