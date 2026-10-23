# B04 S3b2c — isolated verified-email SendGrid adapter

**Status:** source only, unmounted; not production registration or email activation.

## Motivation
Quixo.Homes will send single-use verification tokens through SendGrid only after gated B04 rollout. Generic SendGrid email transmission must not inadvertently rewrite or track sensitive single-use verification links. The existing shared `sendViaSendGrid` helper already safely handles sender/recipient and 202 provider acceptance, so this slice adds a secure opt-in to it rather than creating a second HTTP implementation.

## Changes
- Shared mail transport now accepts **`disableTracking: true`** (opt-in only) and sends the official SendGrid `tracking_settings` flags to turn **click tracking and open tracking off**. Existing invoice/invitation/reset mail stays unchanged when no flag is supplied.
- `createPublicSignupSendGridAdapters` builds the **previously authored** origin-validated, 30-minute fragment-token email. It requires an explicit Quixo.Homes sender address and SendGrid API key (no legacy sender fallback); only the expected verification template is permitted. Invalid sender, URL, mail content or recipient fails closed before calling the provider.
- HTTP 202 is recorded as *provider acceptance*, never as delivered/read/verified. Other 2xx responses and rejected/ambiguous responses fail closed, allowing the pending challenge to be revoked by the existing server-only challenge finalizer.
- Reuse the verified `publicSignupVerificationEmail` builder and `sendViaSendGrid` transport; no separate SendGrid fetch implementation, no customer email, no new public route and no production secrets.

## Tests
- Real mail payload assembled in memory using a mocked SendGrid `fetchImpl`: exact sender, recipient, token fragment in both text and HTML, no click/open tracking, provider 202 response, no echo of raw token in response.
- Negative provider status, unsupported sender domain, malformed email, header injection, wrong/unencrypted origin and tampered email templates fail closed.
- Standard `sendViaSendGrid` transport behavior is unchanged absent the opt-in flag.
- These tests are added to `npm run test:authorization`, not a new workflow.

## Operational gates that remain open
1. Verify sender/domain ownership and account reputation/permissions in the actual SendGrid account; do not make up `noreply@quixo.homes` as an approved actual sender. Tests use this address only as an **illustrative fixture**.
2. Accept that the provider 202 acknowledgment is not proof of delivery. Authorize only the accepted-send marker; email ownership is proven when the token is later redeemed.
3. Ensure verified production host `app.quixo.homes` and secure S3c page are deployed before enabling any verification link; test real link previews and provider's global tracking settings.
4. The **shared durable cross-instance IP/email limiter** and its previously safety-blocked SQL migration are still missing; **do not bypass or use an in-memory replacement**. S3a migration also needs governed apply before runtime.
5. Existing `server.js` does not mount `createPublicSignupRouter`; this adapter is not wired to production and sends no messages until a later separately authorized release.

**No deletions:** The owner confirmed existing renter identities are disposable demo clients, but this PR does not delete them, their invoices or Evia artifacts. Those are separately scoped data/retention decisions.
