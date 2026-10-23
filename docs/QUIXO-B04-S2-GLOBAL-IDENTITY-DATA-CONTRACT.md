# B04 S2 — Global identity, zero-membership authorization and registration persistence contract

**Date:** 2026-10-23  
**Status:** SERVER BUSINESS-ROUTE NO-TENANT GUARD IMPLEMENTED AND TESTED IN PR; GLOBAL SIGNUP IMPLEMENTATION NOT YET ENABLED.  
**Canonical dependencies:** [B04 signup architecture](QUIXO-HOMES-B04-SIGNUP-ARCHITECTURE.md), [B04 S1 caller audit](QUIXO-B04-S1-SIGNUP-CALLER-AUDIT.md), [Stripe SaaS contract](QUIXO-HOMES-STRIPE-SAAS-BILLING.md).

## 1. Data ownership and actual schema

The current Azure SQL/MSSQL schema supports `dbo.app_users.tenant_id UNIQUEIDENTIFIER NULL`, a unique `app_users.email`, unique nonnull `app_users.auth_id`, global `dbo.auth_users` credentials, and explicit `tenant_memberships` with a unique `(tenant_id, app_user_id)` pair. That gives us a plausible **single global identity, optional membership** data model without introducing duplicate credentials or linking strangers by email.

It does **not** yet prove readiness to expose global seeker registration. The current registration route creates `rentee` memberships in legacy `kh-rentals`, and the current helper creates app/profile and auth records in separate writes. Future seeker creation requires a **single atomic transaction**, email ownership verification, and careful uniqueness/race handling. A partial `app_users` write must never leave an unclaimed account that could be claimed by arbitrary password signup. Legacy invited users may only claim identity through the secure invitation owner.

**Proposed identity and business records:**

| Entity | Scope | Authority |
| --- | --- | --- |
| `auth_users` | Global (one principal) | Password/hash or verified federated identity linkage; recovery/cookie/session |
| `app_users` | Global (one email/person) | Profile and optional `tenant_id = NULL`; never a substitute for active organization membership |
| `tenant_memberships` | Organization-specific | Active membership, role and organization context; no implicit seeker membership |
| Seeker profile/preferences (new storage later) | Global, personal | Saved searches, contact preferences and enquiries; no access to another user's data |
| `tenants` + tenant settings | Organization-specific | Verified owner self-provisioning, billing-pending before Stripe subscription payment |
| Stripe customer/subscription cross-reference (new later) | One organization | Verified Stripe-owned prices, payment status and server-counted dwelling quantity |
| Public listing projection (new later) | Public-approved listing fields | Never expose internal unit bank account, tenant, invoice, contract, file URLs or private correspondence |

## 2. Backend selection contract and observed compatibility

The current `selectActiveMembership` resolver already allows a user with `tenant_id = NULL`, **zero active memberships**, and no requested tenant to resolve `{ tenantId: null, membership: null, resolution: 'none' }`. A foreign requested tenant ID returns `403 TENANT_NOT_RESOLVED`; a user who belongs to one organization cannot select another, and should return `403 TENANT_ACCESS_DENIED`.

**Compatibility debt:** For an existing `app_users.tenant_id` with zero active memberships, the code still accepts a `legacy-user-tenant` selection. Do not use that fallback for newly registered seekers, and do not assume this historical fallback proves entitlement after membership revocation. Before final public launch, either migrate legacy accounts to verified memberships or restrict this fallback to explicitly classified, audited historical identities with revocation proofs. Removing it wholesale in S2 could break currently working legacy tenants; preserving it is a **recorded risk**, not a claim of full B04 completion.

**S2 runtime boundary introduced:** The generic `POST /api/platform/query`, `POST /api/platform/rpc/:name` and platform storage buckets/list/upload/delete routes now enforce `createTenantContextMiddleware({requireUser: true, requireTenant: true})`. Public credential routes and the account-context route retain their existing independently authenticated behavior. This closes the direct no-tenant route path before exposing seeker sessions. **A nonnull tenant ID is not proof of current membership** by itself, so full B04 S3/S4 requires the legacy fallback review and cross-tenant authorization suite before seeker registrations are enabled.

**Scope caveat:** Other dedicated business endpoints, platform-admin APIs and public files still need a protected-route inventory and explicit tests. S2 should not be interpreted as a universal proof of tenant isolation across every route. Existing C02/C03/C05/I02 release controls remain independent.

## 3. Future atomic global signup transaction: required behavior, not yet live

1. Normalize and validate email server-side; rate-limit anonymous signup, use anti-automation controls, generic response patterns and CSRF/cookie-safe credential establishment. Ignore client-provided user type/role, tenant ID, subscription ID and admin flags.
2. For a genuinely new email only, persist a **pending unverified** identity claim linked to an expiring single-use email verification token. Do not create a paid organization, a `rentee` membership, or a trusted session with business authority.
3. Within a database transaction with uniqueness constraints and concurrency/race rejection, create the global `app_users` and `auth_users` relationship or stage a durable pending registration in a separate ledger. Do not allow `findAppUserByEmail` alone to authorize claiming an old app-user identity. Token hashes, expiry, redemptions and outbound email evidence are retained without disclosing raw tokens.
4. Verified email ownership allows a global seeker profile/session with `tenantId: null`, zero memberships and a safe seeker-only dashboard. Any landlord internal API must reject it. For current existing email identities, use normal sign-in or canonical invitation redemption rather than password reset/credential overwrite from generic registration.
5. A verified seeker who later receives a tenant invitation keeps the same global identity. Accepted invitation changes only the authorized membership/tenancy relationship; it does not replace their password or cross-org permissions.
6. Organization self-provisioning requires a distinct authenticated endpoint and a serialized transaction creating `tenants`, settings and owner membership in `billing-pending`. It gives **no free trial** and no full paid operations; Stripe Checkout validation after B02 account readiness is a separate gate.

## 4. Test acceptance before public signup can be enabled

- Newly registered global user with no tenant, even when client identity hints claim `admin`, gets a safe `/auth/context` response, but generic query, RPC and storage operations return 403 rather than empty/tenantless SQL results.
- Foreign `x-tenant-id`/body tenant override cannot grant an organization to a nonmember. Active member can select only organizations they belong to; revoked/nonactive memberships fail closed.
- Existing `rentee` and inviter can log in, accept secure invitations and use tenant endpoints as before. The new route guard does not change public email/password/reset/invite redemption paths.
- Simultaneous registration for one email creates at most one verified identity, cannot claim an unlinked historical `app_users` row, and cannot grant a role or tenant supplied by the browser.
- Stripe billing-pending owner receives zero paid entitlement before a verified subscription and first successful payment; trial not permitted; historical data remains preserved.
- Anonymous public listing and seeker-only operations expose only approved listing/enquiry fields, with explicit privacy boundaries.
- Complete two-tenant SQL/browser regression, authentication acceptance, and Ready Azure revision build-SHA proof before enabling public seeker/signup launch.

## 5. Next discrete work packages

**S2a (this PR):** Add require-user + require-tenant gate to generic business routes and regression tests of no-membership resolution; document identity persistence and deferred legacy fallback migration. No SQL migrations or new public registration changes.

**S2b (next):** Trace all dedicated routes for missing tenant/membership checks, identify legacy fallback accounts safely without modifying them, and decide whether a durable `pending_signup` verification ledger or atomically created unverified identity is preferable. Include failure/replay model and migration rollback.

**S3/S4:** Add server-verified global seeker registration behind a **default-off** pilot gate, safe zero-membership session UI and route protection, and regression coverage proving no cross-tenant privileges. No marketplace signup release before these.

**B02 and Stripe B05:** Stripe Managed Payments eligibility and operator account onboarding remain open; no live prices, subscriptions, charges or trial grants.

**Change boundaries:** This document approves a bounded security correction only; no money movement, Stripe object creation, SQL writes, tenant membership migration, user email sends, historical PDF modifications, or public signup feature activation.


**S2b legacy revocation safety and signup design (2026-10-23):** See [legacy membership fallback and verified-registration architecture](QUIXO-B04-S2B-REGISTRATION-AND-LEGACY-ACCESS.md). The tenant resolver checks historical membership evidence before grandfathering any `app_users.tenant_id` fallback: revoked/inactive membership cannot be revived by stale legacy data. A separate durable pending-email ledger followed by an atomic verified identity transaction is **proposed**, not enabled. Follow-on production read-only aggregate membership audit, schema/migration design and protected-route review are OPEN.
