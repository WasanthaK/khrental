# B04 S3c2a — tenantless seeker landing foundation

**Status:** code and test contract staged; **no runtime route**, no production registration, no billing authority.

## Canonical problem

Global verified seeker identities are deliberately created without `tenant_memberships`, tenant ID or landlord billing. The existing portal navigation maps an unlinked role to `/unauthorized`. It must not send a new seeker to `/dashboard`, `/rentee`, historical `kh-rentals` context, invoice listings, property mutation APIs or Stripe billing. The existing legacy portal behavior remains in force until the new auth-context and release gates are validated.

## Source-only implementation

- `src/utils/seekerLandingPolicy.js` exports a **pure**, strict `isVerifiedTenantlessSeeker` and `getVerifiedSeekerLandingPath`. A positive decision requires an authenticated user ID, exact global `role=authenticated`, `user_type=seeker`, a **server-verified** `tenantContextVerified=true`, **explicitly known** `membership=null` and `memberships=[]`, and no residual tenant pointers. Missing/undefined membership context, even during loading, is **not** equivalent to verified zero memberships.
- `src/pages/SeekerHome.jsx` stages a separate standalone accessible account page. It displays no listings, leases, tenant navigation, customer records, subscriptions or administrator controls, and fetches no private business APIs. If the account context cannot be verified, it fails closed with a generic unavailable message. It does not create memberships.
- `tests/seeker-tenantless-landing-policy.test.js` proves positive zero-membership case, rejection of stale/unknown/revoked/foreign tenant context, global role spoofing and privileged roles, legacy redirect untouched, zero existing business permissions and JSX compile. Wired into existing `test:authorization` CI.

## Runtime and security fences

**DO NOT yet import or mount `SeekerHome` in `src/routes.jsx`, change global `getDefaultLandingPath` or allow a client-only flag to grant access.** The future S3c2b integration must:
1. Bind the source policy only to a validated server-authenticated `/api/platform/auth/context` result with a trustworthy `contextVerified` state and **all active/revoked memberships reconciled**, not browser local storage, session roles or query parameters.
2. Ensure portal type selection remains **server-backed membership authorization** for protected landlord and renter pages (global identity role is not a tenant grant). Audit legacy fallback separately before changing routing behavior.
3. Prevent redirect loops, mixed sessions and stale tenant selections. Preserve invitation and existing renter login/recovery until the controlled migration.
4. Require the blocked durable cross-instance rate limiting, trusted ingress IP handling, approved SendGrid sender and origin, governed S3a SQL migration plan/apply/strict verification, mounted default-off registration API and HTTPS browser acceptance before enabling public registration.
5. Keep owner organization Stripe Checkout separate: no free trial; billing pending until confirmed payment, $5 USD per server-counted managed dwelling/month, additions prorated into the next normal invoice.

The owner classified preexisting renters as disposable test accounts, but **no user cleanup or cascading deletion** is in this package. Preserve invoices, signed agreements and Evia audit evidence.

**Verification:** CI source tests/build only. This does not prove Azure readiness, a live global seeker account or any registration/Stripe operations.
