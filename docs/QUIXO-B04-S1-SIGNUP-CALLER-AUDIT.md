# B04 / S1 — Account-claim and signup caller audit

**Date:** 2026-10-23  
**Status:** CALLER INVENTORY COMPLETED / ONE PUBLIC SIGNUP GUARD HARDENED; B04 REGIONAL SIGNUP STILL BLOCKED  
**Scope:** Current server and React account entrypoints. This is an architecture/security checkpoint, not an assertion that identity-only signup, Stripe, or owner self-provisioning are ready.

## Grounded request/caller graph

| Entry/caller | Backend/next step | Current trust boundary and decision |
| --- | --- | --- |
| `/register` in `src/routes.jsx`, `src/pages/Register.jsx` | `useAuth.register` → `platformClient.auth.signUp` → `POST /api/platform/auth/sign-up` | **Public; legacy renter registration.** Backend still assigns a fresh email to the `kh-rentals` tenant, creates an active `rentee` membership and a session. Not a safe rental-seeker signup |
| `/login` | `POST /api/platform/auth/sign-in` | Public credential flow. Existing account and tenant-profile redirection must be preserved in follow-up |
| `POST /api/platform/auth/sign-up` mounted in `server.js` | **`createInvitationRouter()` mounted before `createPlatformRouter()`** | Preflight rejects any preexisting `app_users` email with 409; this PR adds a second server-side check in the actual credential creation helper before linking an existing app-user identity |
| `ensureAuthRecord()` in `src/api/platform/router.js` | Lookup `auth_users`; then lookup `app_users`; create/attach credentials and possibly default tenant membership | Previously linked an unclaimed app user from matching email if preflight was bypassed/raced. **Defense added:** default policy rejects preexisting app users for public signup. This does not solve fresh email auto-tenancy |
| `platformClient.auth.admin.inviteUserByEmail` | `POST /api/platform/auth/invite` | Invoked by legacy client service paths. `createInvitationRouter()` owns the same route first and creates a tenant-scoped, authorized invitation. The old `createPlatformRouter()` endpoint also exists and creates a random-password auth record; it is explicitly marked compatibility-only, not exposed as a new public signup owner. Remove only after tracing all historical callers and verifying safe replacements |
| `/accept-invite` and `/api/platform/auth/invitations/validate,re​deem` | Server-issued single-use invitation token, auth verification and tenant ownership | Canonical existing-tenant claiming authority; never replace with public signup email match. Preserve accepted/revoked/expired behavior and existing-session protections |
| `/reset-password` and password reset router | Authenticated-identity recovery token separate from signup/invitations | Preserve identity ownership, no inherited active tenant |
| Tenant context resolver | `selectActiveMembership()` in `src/api/tenant/context.js` | Resolves active membership, but can still return `legacy-user-tenant` when no membership and `app_users.tenant_id` is set. Needs explicit review before identity-only global seeker access is implemented |
| `getPostLoginPath` and `PublicRoute` | Browser login/portal-specific landing routing | Current default routes are tenant-workspace oriented. New zero-membership seeker state needs its own safe landing route instead of redirect loops |

Server mount order in `server.js`: `app.use('/api/platform/auth', createPasswordResetRouter(...))` → `app.use('/api/platform/auth', createInvitationRouter())` → `app.use('/api/platform', createPlatformRouter())`. This means the invitation-router preflight is the primary public signup guard; *do not rely solely on mount order for credential ownership*.

## Narrow hardening in this slice

- New pure server-side `src/api/auth/publicSignupPolicy.js` rejects a *preexisting* app user for public registration. Linked credentials return `ACCOUNT_ALREADY_EXISTS`; unlinked tenant identities return `INVITATION_REQUIRED`.
- `ensureAuthRecord` now applies this rule by default after its database lookup and before `updateAppUser` or `createAuthRecord`. Thus an alternate code path through the platform handler does not simply bypass the earlier invitation router's preflight.
- The old admin invitation compatibility call is explicitly separate; its privileged exception is **not** a future public signup API. Existing admin invitation authority/legacy behavior is not changed by this bounded fix.
- `tests/public-signup-claim-policy.test.js` validates the pure policy and the real call-site/mount-order contracts. Standard authorization CI remains a required release gate.

**Limitations:** This does **not** provide serializable protection against every cross-request identity-creation race or fix partial-create cleanup; proper transactional identity+profile creation and email verification belong in B04 S2–S4. The production `/register` UI still creates legacy `rentee` membership under `kh-rentals` for fresh emails, so **do not advertise it as public seeker signup**.

## Current high-risk assumptions requiring the next bounded work item

1. **No-membership user** must not inherit global `role`, `user_type`, or `tenant_id` as landlord/internal authority. Audit `getUserForIdentity`, `listMembershipsForUser`, tenant-context fallbacks and every protected `/api/mssql`/platform route with a seeker session. Reject cross-tenant IDs even when an authenticated global user supplies one in headers, query, or body.
2. `/api/platform/auth/invite` legacy compatibility path in the platform router uses `requireAdmin` based on `req.user.role` and can generate a random-password credential. It is normally shadowed by the prior secure invitation router but must **not** remain an accidental direct authority. Verify functional invite callers, then remove or explicitly deny unreachable paths with regression coverage.
3. Fresh `/auth/sign-up` defaults any new email to `kh-rentals` renter membership. No public rental marketplace signup until a scoped, rate-limited, verified global-only identity service replaces that default and stops linking unclaimed app users.
4. Owner self-registration must create isolated, billing-pending organizations without any Stripe trial access; Checkout activation follows verified webhook and billed dwelling quantity, not browser success.
5. Preserve current secure invitation, tenant switch, recovery, and nonproduction compatibility operations while introducing the new flows.

## Sequence after this audit

- **S1 (this PR):** Add shared helper defense-in-depth, regression checks, and exact caller map. No migrations or real user changes.
- **S2:** Decide global-user persistence and unique email/verification transaction; audit every legacy no-membership branch with targeted tests.
- **S3/S4:** Identity-only registration for seekers and no-tenant authorization + explicit seeker route, behind default-off/limited pilot flag.
- **S5:** Safe owner organization provisioning and `billing-pending` association, distinct from platform global admins and Stripe quantity controls.
- **S6+:** Stripe Checkout/customer subscription in test mode only after B02 Managed Payments eligibility, then public listing and region acceptance.

**Release fences:** Existing C02/C03/C05 and Invoice Designer I02 remain independent. No customer emails, tenant records, Stripe products, prices, subscriptions, charges, migrations, permissions, Evia artifacts or issued invoices were changed by this bounded development slice.
