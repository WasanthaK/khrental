# B04 S3b2a — verification-email and challenge lifecycle (unmounted)

**State:** development slice; public signup OFF. Does not require or apply a new SQL migration. The original S3a pending-challenge migration `20261023_01_create_public_signup_challenges.sql` remains unapplied in production.

## Implemented

1. `publicSignupVerificationEmail.js`: server-controlled, single-use 30-minute email verification link on `https://app.quixo.homes/verify-email#token=...` in production. The opaque token is **only in the URL fragment**, not HTTP path or query. Reject credentials, unwanted path/query/fragment, wrong hostname, non-TLS/port in production. Uses SendGrid `clicktracking=off` on the HTML link (still validate provider settings; this by itself is no guarantee for all tracking). This is presentation only and **does not send email**.
2. `publicSignupThrottleKey.js`: HMAC-SHA256 domain-separated throttle identifiers for email/IP. Requires a server-side high-entropy secret; no raw email/IP persisted in keys. **Not an active limiter**.
3. `publicSignupChallengeService.js`: **unmounted** server-only challenge issuer. In a serializable transaction it refuses existing `app_users` or `auth_users`, prevents rapid same-email resend, revokes older unconsumed tokens, inserts the random 256-bit token's SHA-256 digest and 30-minute expiry. Returns raw token **only to future trusted email adapter**. On provider acceptance, marks `sent_at` and increments count once; on failed/ambiguous acceptance, revokes token. Provider *acceptance* is not verified delivery.
4. New authorization unit/security tests and tests in the **existing disposable SQL Server harness** for hash-only storage, cooldown/reissue/revocation, successful/failed provider acknowledgment, and preexisting invited identity denial. All writes in SQL tests target disposable Docker SQL Server, **not Azure**.

## Still required before enabling the API (S3b2b)

- Separately governed, shared/atomic persistent limiter for IP and email across Azure instances. The attempted creation of the rate-limit migration was blocked by connector policy, so **no such migration was written**, and no unsupported substitute is claimed. The HMAC utility alone does not enforce rate limits.
- Controlled email origin and SendGrid tracking settings, durable provider acceptance/retry/outbox evidence, resend/abuse and deletion limits, generic anonymous responses and fail-closed delivery uncertainty.
- Distinct default-off `/api/public-signup` request/redeem routes, explicit CSRF/session policy, validated trust proxy chain, temporary token scrub in S3c UI, and strict no-store/referrer protections. The legacy `/auth/sign-up` is unchanged.
- Additional validation for email ownership and sender acceptance, and a protected token redemption endpoint calling merged `redeemPublicSignupChallenge` only after the above gates. A signed-in seeker gets **no business tenant permission** merely through a global identity.
- Governed SQL migration plan/apply/strict verifier of S3a before any deployment can enable public flow. No tenant records or Stripe resources have been touched.

## Canonical billing/identity boundary

B04 S3b2a does **not** provision organizations, Stripe subscriptions, trial entitlements or tenant memberships. Registered seekers must remain tenantless until accepting a valid invitation or separately provisioning a billing-pending owner organization. Stripe B03 per-dwelling count remains server authoritative; $5/dwelling per month, mid-cycle additions prorate at next renewal.

**Do not represent this PR as completing S3b2 or public signup.**
