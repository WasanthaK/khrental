# B04 S3c1 — Email-verification browser foundation (default OFF)

**Source scope:** prepare the browser UI and token-handling semantics for a future seeker-only, no-organization signup pilot. Public registration remains OFF, S3a SQL migration is unapplied in production, and the shared durable limiter / owner-controlled SendGrid acceptance remain blocked or pending.

## Implemented in source

- `src/utils/seekerVerificationFragment.js` consumes only an exact `#token=` followed by 43 base64url characters on the intended `/verify-email` path. Before exposing the token to application state or making any API call, it calls `history.replaceState` to strip BOTH fragment and query, leaving only `/verify-email`. If history scrubbing fails, no token is returned. The original email link uses a fragment to avoid sending the opaque token in an HTTP GET URL or Referer.
- `src/pages/VerifySeekerEmail.jsx` is a staged, accessible, standalone email-verification page. Its default state shows a disabled-registration explanation. When deliberately enabled in a future rollout it accepts matching 12–256-character passwords, posts only `{ token, password }` to the **same-origin** `/api/public-signup/redeem` via POST with `credentials: 'omit'`, `cache: 'no-store'`, `referrerPolicy: 'no-referrer'`, and `redirect: 'error'`. The response must describe an authenticated seeker; the UI does not infer a tenant, company or payment entitlement.
- **Explicitly no stored session or automatic browser identity takeover in S3c1**; even after successful verification the page asks the user to sign in. This is conservative while a future no-tenant authenticated dashboard and existing-session preservation are not accepted.
- `src/utils/env.js` adds a separate `VITE_PUBLIC_SIGNUP_UI_ENABLED` opt-in check; default is false. The **new page is not imported or mounted** in `src/routes.jsx` and does not change existing `/register`, sign-in, `/reset-password` or `/accept-invite` behavior.
- Dedicated `tests/seeker-email-verification-ui-contract.test.js` checks strict token format, fragment/history scrub on success and invalid URLs, fail-closed browser-history behavior, same-origin/no-cookie request, tenantless response checks, and absence of a mounted route. Wired into existing authorization CI. Also removes a duplicate S3b2a test invocation to avoid wasting CI.

## Before S3c2 and first external pilot

1. Governed deployment of `dbo.public_signup_challenges` and a **shared, atomic, cross-instance IP+email limiter**; prior attempted limiter-migration write was blocked by connector security and was **not bypassed**.
2. Verify SendGrid sender ownership, production `app.quixo.homes` TLS/app page availability, mail tracking suppression and email provider accepted-vs-delivered status.
3. Bind the existing default-off backend registration HTTP contract only after limits, trusted proxy ingress, CSRF/origin validation and nonce / duplicate/replay defenses are accepted. The user-facing flag **cannot** enable a server endpoint on its own.
4. Build S3c no-membership seeker read-only landing experience, active-session account-preservation rules, tenant isolation and browser acceptance on two organizations. Only then mount `/verify-email`, explicitly approve canary and provision production flag.
5. Separate billing-pending *owner organization* registration, authenticated Stripe Checkout $5/dwelling, Stripe-verified payment, server counted units and next-invoice prorations are **not handled by this seeker screen**.
6. Existing renter accounts are owner-declared demo data and may be cleaned in a separate scoped operation. No cleanup/deletion or changes to historical invoices, signing evidence or Evia audit are authorized by this source change.

**No customer mail, data creation, production SQL, Stripe or runtime public-signup modification is performed by S3c1.**
