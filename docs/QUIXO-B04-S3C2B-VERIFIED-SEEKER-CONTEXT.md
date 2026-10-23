# B04 S3c2b — Verified seeker context API (default OFF)

**Security boundary:** A client-side profile showing `memberships=[]` is not proof that membership lookup succeeded. The legacy context resolver may legitimately return an empty array when membership tables are absent, and it only projects **active** membership rows. It cannot certify a new global seeker by itself.

## Source changes

- New pure, test-injectable `resolveVerifiedSeekerContext` verifies that a **real bearer-authenticated** `authSession.record` and the resolved SQL `app_users` record refer to the same global auth/user IDs and email. It requires exact `role=authenticated` / `user_type=seeker`, **`global_email_verified === true` from the session's authoritative auth record**, no tenant pointers, no requested/active tenant, `resolution=none`, explicitly known zero active memberships, and no development bypass.
- It then **queries `dbo.tenant_memberships` directly for any historical row** with the authenticated `appUserId`. Zero rows gives a read-only `{ verified:true, eligible:true, userType:'seeker', tenantId:null }` response. A linked historical, inactive or revoked row does not falsely certify a new seeker. The query must succeed: missing schema, DB outage or timeout fails closed.
- The existing platform router exposes `GET /api/platform/auth/seeker-context` only behind server-side `PUBLIC_SEEKER_CONTEXT_ENABLED=true`. **Default is 404**. When enabled, only a validated `req.authSession` bearer is accepted (else 401); SQL verification failures return generic 503; approved responses are no-store/no-referrer. The endpoint has no mutation, session grant, tenant grant or Stripe logic.
- Tests prove positive bearer link, missing/forged roles, user IDs/email, dev bypass, requested tenant, stale memberships, missing table/SQL failure and endpoint default-off wiring, included in the existing authorization CI.

## Intentional omissions

This is **not** yet the browser redirect or a mounted seeker page. The original `getDefaultLandingPath`, `ProtectedRoute`, `/register`, `/rentee`, `/dashboard` and the current authentication hook are unchanged. No public signup endpoint, account creation, tenant membership, payment entitlement or production SQL migration is activated.

## Remaining canonical gates

1. Reconcile the future seeker landing adapter to this read-only server proof; avoid treating a blank array or an authenticated profile alone as membership evidence. Handle denied/503/401 as unavailable rather than falling into any tenant portal or redirect loop.
2. When allowed, pass only a verified requester-bound context into the S3c2a policy; maintain protected server tenant authorization independently.
3. Prior blocked shared cross-instance IP/email atomic limiter, trusted IP ingress, and S3a migration governance remain release blockers. Do **not** bypass connector safeguards.
4. Verify Quixo sender/domain and `app.quixo.homes`, CSRF/origin, controlled signup/redeem/session flow, tenantless browser acceptance and two-organization negative tests before enabling registration.
5. Existing renter identities are owner-declared demo clients; this source change deletes none and retains invoices, signed documents and Evia audit evidence. Stripe subscriptions and billing are independent of seeker registration.

**No real users, production SQL, mail or Stripe resources are changed by this source-only package.**
