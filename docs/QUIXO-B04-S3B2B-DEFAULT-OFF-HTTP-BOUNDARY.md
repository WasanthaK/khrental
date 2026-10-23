# B04 S3b2b — Default-off HTTP registration contract

**Scope:** source-only, **unmounted** router factory plus tests. Not production signup activation.

## Controlled boundary
- The `createPublicSignupRouter` factory is not imported into `server.js`; existing legacy renter registration/invitation routes are unchanged.
- Disabled by default (404). Even an explicit `enabled: true` fails with 503 until every dependency is wired: a trusted IP-resolution adapter, a declared durable atomic rate limiter, HMAC throttle secret, challenge issuer/finalizer, controlled send-email adapter, approved email-template builder, one-time redemption, authenticated identity re-read and session issuance.
- The mock limiter in source tests proves only behavior, **not** actual durable enforcement. The blocked SQL shared-rate-limit migration remains missing, so **do not mount this API or turn the flag on**.
- Challenge requests first consume rate quota for the trusted source IP and then normalized email; client tenant ID/role/Stripe values are ignored. Public reply is generic and does not reveal account existence. Provider errors are not logged or forwarded. Provider status `success` is recorded only as acceptance, never verified delivery. Failed/unknown acceptance revokes the link through the existing provider-finalization service.
- Redeem requests are separately IP-limited. The caller must use the already-merged SQL serializable redemption service, re-load the linked auth record and only issue a session for a tenantless global seeker. It must never create a landlord tenant or billable entitlement.
- **New security correction:** `redeemPublicSignupChallenge` now requires `sent_at` in the challenge record. Tokens not marked provider-accepted cannot be used to establish identity. Disposable SQL tests exercise this negative case and adjust synthetic fixtures to set an acceptance timestamp.
- Cache disabled and referrer restricted. Opaque tokens must stay out of server request paths/queries. No public UI is in this PR.

## Owner test-data decision
The project owner confirmed on 2026-10-23 that **existing renters are test clients and may be removed**. This removes business need to preserve legacy test-renter accounts *for product launch*. It does **not** remove globally unique-email anti-hijack safeguards: an email might still belong to a historical account until its controlled deletion is complete.

**Future cleanup is a separate destructive-data operation**: inspect scope and dependencies, distinguish renter test identities from real property managers/platform admins, identify related invoices, payments, signed PDFs and Evia evidence, preserve legally relevant records and audit history, perform only an approved scoped/disposable-data cleanup, and validate invitation/tenant authorization afterward. This source-only PR deletes no users, properties, financial documents, tenants, Stripe records or files.

## Open dependencies
1. Governed, durable cross-instance limiter with IP/email buckets, atomic consume and expiration (earlier connector write blocked; no bypass).
2. Trusted reverse proxy client IP resolution, request-origin and CSRF policy, safe sender/domain and event/outbox monitoring.
3. Integrate router only as a **default-off** endpoint after rate-limit and acceptance gates, authenticate S3c frontend's fragment-token handoff and safe session handling.
4. Apply S3a migration separately through authorized production plan/apply/strict verifier before any enabled runtime; qualify SendGrid sending and two-organization HTTP/browser tests.
5. Independently build B05 Stripe org-bound Checkout and per-dwelling entitlement/proration.

**Done in this package:** staging safe boundary, testable routing shape and accepted-email prerequisite. **Not done:** live registration, actual limiter, provider mail, production DDL or deletion of test users.
