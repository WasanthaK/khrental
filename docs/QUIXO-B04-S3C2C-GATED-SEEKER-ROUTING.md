# B04 S3c2c — gated browser landing and read-only seeker redirect

**Status:** source-stage client integration only. Both server and browser pilot flags default **OFF**. There is no enabled public seeker registration, no database migration, live customer email or Stripe charge.

## Architecture and exact gates

- `src/services/seekerContextClient.js` performs a **same-origin GET** to `/api/platform/auth/seeker-context` with the current platform-session bearer token **only**. It sends **no** cookie, `x-tenant-id`, development bypass, tenant selector, query string or caller-provided role. The active session's user ID must match the expected authenticated user both **before and after** the request, and the token must remain identical. Any missing, expired, changed, denied, malformed or unavailable response fails closed.
- `src/components/auth/VerifiedSeekerBoundary.jsx` is the only browser gateway for the standalone `/seeker` page. It first checks locally that the authenticated profile is an exact tenantless seeker with a real app-user profile ID and explicit zero memberships. **This is only a preliminary browser check, not proof**; it must additionally receive server `verified:true, eligible:true, userType:'seeker', tenantId:null` to display `SeekerHome`. It keys the asynchronous result to the current login identity, ignores unmounted/in-flight responses, redirects unauthenticated users to sign-in and all uncertified accounts to `/unauthorized`.
- `src/routes.jsx` now includes `/seeker` **behind the client default-OFF flag** `VITE_PUBLIC_SEEKER_LANDING_ENABLED` and the boundary's fresh server proof. For authenticated unlinked seeker profiles on public sign-in routes, `PublicRoute` invokes the same boundary with redirect-only mode; all other portal redirects use the original `getDefaultLandingPath` and `getPostLoginPath` behavior.
- `Login.jsx` checks the same server proof, **only when the client flag is on**, before honoring any historical protected tenant deep link. A verified seeker is sent only to `/seeker`, not a landlord/renter workspace. No new browser session or tenant membership is created.
- `/seeker` is isolated from `RootLayout`'s tenant/storage initialization and onboarding guide, while remaining authenticated. Password recovery/invitation credential rules and session handling are unchanged. No additional properties, leases, invoices, Stripe or tenant-management capabilities are attached to the seeker page.
- The read-only server endpoint `GET /api/platform/auth/seeker-context` from PR #385 remains independently server-flagged by `PUBLIC_SEEKER_CONTEXT_ENABLED=true`, default **404**. It verifies the bearer/session and historical membership table before returning eligibility.

## Regression acceptance

`tests/verified-seeker-browser-routing.test.js`, plus updated existing contract tests, exercise same-origin bearer-only requests, session swap/logout race, stale or missing token, denied/404/500, bad JSON projection, legacy admin/renter redirects unchanged, flag and route wiring, login deep-link suppression, isolated standalone page and JSX compilation. Reuse the existing `npm run test:authorization` and normal build CI.

## Production release holds

- **Do not set either seeker flag yet.** The B04 S3a registration challenges migration remains unapplied in production. The earlier shared cross-instance atomic IP/email rate limiter migration is still blocked by the connector restriction and has **not** been bypassed. Default-off API challenge/redeem endpoints and email delivery adapters are not wired into production.
- Before enabling pilot, prove SendGrid sender and app origin, CSRF/trusted ingress protections, rate-limit persistence, session preservation, two-org/tenant denial and recovery/invitation coexistence on physical Azure runtime.
- Existing renters are confirmed owner-declared demo accounts; no renter, rent invoice, signed document or Evia evidence cleanup occurs in this package.
- Stripe B05 paid organization provisioning, server-counted $5/dwelling monthly, verified initial payment and next-invoice prorations remain independently gated. A seeker signup creates **no** paid subscription.

**No production SQL, real external emails, tenant memberships, payment objects or environment flags are changed by this PR.**
