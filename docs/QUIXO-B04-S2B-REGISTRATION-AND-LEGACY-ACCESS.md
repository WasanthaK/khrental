# Quixo.Homes B04 S2b — Legacy membership revocation and atomic signup contract

**Reviewed:** 2026-10-23  
**State:** Revocation boundary implemented; registration contract decided for design, **not yet implemented**.  
**Release constraints:** No existing account, SQL data, Stripe record or production listing/signup UI is changed by this documentation. No regional seeker signup activation.

## 1. Source audit: where old membership state can restore access

Actual `src/api/tenant/context.js` reads a global app user from auth ID (with user ID/email fallbacks), filters `tenant_memberships` to currently active membership **and** active tenant, and selects a tenant. Before S2b, if no active membership was found but `app_users.tenant_id` was populated, `selectActiveMembership` returned `legacy-user-tenant`.

**Exploit class:** a membership might be revoked, suspended, or its organization disabled while `app_users.tenant_id` remains unchanged. An ordinary active-membership query returns an empty list, and the old fallback turns that stale tenant identifier into fresh business context. S2a's `requireTenant` guard alone cannot distinguish this: a nonnull legacy tenant ID is not a current membership.

**S2b correction:** add a separate scoped lookup of **any historical membership record**, regardless of status/tenant state, only when a resolved user has a legacy tenant ID but zero active memberships. A historical membership row takes precedence over the legacy field: no fallback, no tenant assignment, and explicit stale-tenant requests receive 403. The pure resolver's default is denial unless the runtime supplies verified compatibility evidence. No existing membership rows are mutated.

**Compat condition still open:** users with `app_users.tenant_id` but **no recorded membership rows at all** may retain the legacy fallback temporarily. This protects historical accounts not backfilled into `tenant_memberships` but remains a security debt: hard-deleted memberships and missing table configurations cannot be classified without a read-only reconciliation. Never label `legacy-user-tenant` current membership. Any compatibility entitlement is temporary and must be eliminated after a zero-PII DB audit/backfill plan and acceptance. Fail closed on database query errors; do not silently treat a failed membership history lookup as absence of evidence.

**Identity linking concern still open:** `getUserForIdentity` falls back from auth ID to user ID and email. The stronger global seeker credential path must prove `auth_users.auth_id` is bound to `app_users.auth_id`, and should not attach an unclaimed/other app-user row merely by matching email. Gate under the next transactional signup slice to avoid disrupting existing logins without a staged inventory.

## 2. Other protected-path inventory (source-oriented)

- Generic `/api/platform/query`, `/api/platform/rpc/:name` and platform storage routes gained `requireTenant` under S2a, with auth/context remaining tenant-independent.
- Dedicated `/api/mssql` domain routes and most tenancy lifecycle routers have separate `createTenantContextMiddleware({ requireUser, requireTenant })` plus per-resource constraints. Platform-admin and invite compatibility routes also have role guards; they must each enforce verified current membership or a **separately authenticated global platform-admin** exception, not a stale `app_users.role` field.
- The current `/api/platform/auth/sign-up` still creates a `rentee` in existing `kh-rentals` for brand-new emails and must never be marketed as seeker signup.
- The secure invitation redemption already uses a SQL transaction, one-time token, claim check and membership binding; its invariant is reusable as a design pattern, but it is **not** a substitute for verified new global registrations.
- Current account creation (`ensureAuthRecord`) writes app user, membership and auth record separately. A failure after app-user insertion can leave unclaimed identities; race and rollback behavior need a new transaction.

## 3. Chosen architecture for new seeker registration — not activated

**Recommendation:** use an independent, durable **pending email verification ledger**; create global `app_users` + `auth_users` only in a single SQL transaction **after** the user proves ownership of a fresh email token. Pending invitations are not equivalent to pending self-signup.

### Pending registration ledger proposal

`dbo.public_signup_challenges` (new migration required later; **not applied**) includes:
- `id` uniqueidentifier PK; canonical normalized email and display name with size bounds; cryptographically random 256-bit token **SHA-256 hash only** with unique index; sent-at, expiry, consumed-at, revoked-at and attempt counters; tenant_id is **not** present
- a credential strategy that does not retain plaintext passwords between request and verification: either store no credential until token redemption and collect the password securely then, or use a validated temporary secure credential hash under separately reviewed retention and KDF protections. **Prefer redemption-time password entry** to avoid storing any password in a pending ledger
- one-time anti-replay consumption, resend invalidation, TTL cleanup and non-identifying rate limits keyed to network/browser and email; generic public responses to avoid account enumeration

### Account creation at verification

1. Validate the opaque token's hash, scope, expiry, attempt policy and unused status. Begin a SQL transaction and acquire a write lock on its ledger row. Allow only one redemption.
2. Normalize email and reject existing `auth_users` or `app_users` accounts; previously invited identities remain claimed **only** by the canonical tenant invitation workflow, never by a generic seeker token.
3. Derive password hash with the existing scrypt algorithm and create exactly one `app_users` row with `tenant_id=NULL`, `role='authenticated'`, `user_type='seeker'`, no memberships or paid capabilities, plus one matching `auth_users` row with the same auth ID and linked app user ID, and mark challenge consumed, **all in one committed transaction**.
4. Database uniqueness prevents concurrent duplicated email/auth ID; any error rolls back all records. No 'retry as alternate signup' or attachment of a preexisting app user by email.
5. Issue a narrowly scoped global authenticated session only after commit. A seeker-specific landing page must work with `tenantId=null`; every private business route rejects it. No auto-join `kh-rentals`.
6. The public `quixo.homes` browse/search journey can be anonymous. Verified registration is required only for actions needing identity (saved searches, applications, messages). An organization owner registers/joins through a **separate protected provisioning transaction**, not by a client-supplied role.

### Failure and reversal rules

- Token not delivered: ledger remains unconsumed and safely resendable after throttling; do not claim delivery just because queue returned.
- Incorrect/expired/replayed token: reject without creating a profile; all errors use a bounded single-use response contract.
- Database outage or unique key conflict: rollback, preserve token if not consumed, no orphan app user, no conflicting auth credential, and no membership writes.
- Email provider ambiguous delivery: dedupe by challenge ID, no repeated mail storms, reconcile delivery evidence.
- User later accepts landlord invitation: keep same identity, append a verified scoped membership; do not overwrite credentials or create a second global user.
- Tenant/organization provisioning fails before payment: preserve billing-pending organization and isolate it from paid operations; **no trial**.

## 4. Evidence required before removing all legacy fallback

Read-only, aggregate-only Azure SQL inspection (no names/emails/secrets):
- Count app users with non-null `tenant_id` and **zero membership records** (genuine pre-membership candidates).
- Count app users with non-null legacy tenant ID and **inactive/revoked memberships but zero active** memberships (revocation risk).
- Count app users with at least one active membership whose tenant differs from `app_users.tenant_id` (stale pointers).
- Count orphan auth IDs and app-user identities that have matching email but mismatched auth IDs (linking risks), without revealing per-account identifiers.
- Verify backfill instructions, mapping to active memberships and owner-authorized access before deleting legacy compatibility; rerun two-tenant SQL tests and physical login/tenant-switch acceptance.

**Do not run a production SQL migration, infer a baseline of zero users, or disable legacy tenant access without evidence.**

## 5. Gate position

- **S2a CLOSED:** generic platform tenantless API guards, 659/659 CI and Azure Ready 0000331.
- **S2b security patch:** revoked/inactive membership cannot reactivate a stale legacy tenant pointer; unit tests and CI + Azure Ready verification required before marking delivered.
- **S2b design:** durable pending verification ledger and post-verification atomic transaction approved as proposed engineering architecture, **implementation not started**.
- **S3/S4 OPEN:** new global email verification and seeker-only UX; owner self-provisioning and Stripe onboarding downstream.
- **B02 OPEN:** Managed Payments account eligibility and country tax coverage; no Stripe Product/Price/Checkout created.
- **Original Phase 4/5 release gates remain unchanged:** C02, C03, C05 and invoice I02.

The objective is to advance toward global accounts **without granting any existing tenant, historic document, admin role, or Stripe paid entitlement by email registration**.
