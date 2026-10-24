# B04 S3e — Azure Container Apps ingress and browser-policy guards

**Source-only; NOT MOUNTED.** This independent step removes an outstanding abuse-protection design dependency while the B04 production SQL challenge/limiter migrations and the privileged migration workflow remain release-gated.

## Security basis

Microsoft's current Container Apps ingress documentation states that Azure Container Apps appends its observed request IP as the **rightmost** `X-Forwarded-For` address. Earlier values can be supplied by the requester and are **not trusted**.
https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview

MDN's guidance similarly requires verifying the reverse-proxy chain and avoiding the untrusted leftmost entry in security-sensitive IP decisions:
https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For

## Added to source

- `src/api/auth/publicSignupIngressGuard.js`: `createAzureSignupClientAddress({isTrustedIngressPeer})` is **deny-by-default** if no independent trusted-ingress peer predicate has been configured. It validates `req.socket.remoteAddress` against that predicate before trusting any XFF data, rejects duplicate or missing XFF headers, handles bounded multi-hop chains by using the **rightmost** value only, and rejects invalid, port-suffixed and malformed addresses. It canonicalizes IPv6 and IPv4-mapped IPv6 to stable throttle buckets; it never uses `req.ip`, permissive `trust proxy=true`, `X-Real-IP` or a caller-provided client-IP field.
- `checkPublicSignupBrowserRequest` is a **separate pre-parser policy candidate** for only `POST /api/public-signup/{challenge,redeem}` from `https://app.quixo.homes`, exact host, JSON, no query string, same-origin Fetch Metadata when present, a Content-Length no greater than 8 KiB, no ambiguous `Transfer-Encoding`. It fails closed on unknown origin, wrong method or wrong body format.
- `tests/public-signup-azure-ingress-guard.test.js`: spoofed leftmost XFF, forged network peer, duplicate XFF, varying IPv6 spellings, IPv4-mapped literals, port suffix, malformed headers, cross-origin submissions, oversized payload and missing length. Run through existing `test:authorization`.

## What remains necessary before any activation

1. **Verify actual Azure ingress peer trust.** The supplied `isTrustedIngressPeer` must be a production-approved network check backed by observed ingress path/peer ranges or a proven connection restriction. Passing `()=>true` or a browser-provided header is forbidden. Azure Container Apps ingress/backend behavior must be validated on a real disposable replica.
2. Mount the candidate middleware at the **correct order before the global 10 MiB `express.json` parser**, with a route-specific `express.json({limit:'8kb',strict:true})` (including chunked-body and compression guards). The separate header/content-length precheck **alone does not limit an already-parsed HTTP body**.
3. Wire it into the currently **unmounted, default-off** signup router alongside the existing SQL atomic limiter, SendGrid adapter and one-time challenge/redeem services, with canary and two-org negative tests. Do not enable signup while trusted peer ranges, body/parser ordering, browser Origin policy, CSRF and rate limiter SQL persistence remain unverified.
4. The **protected nine-migration production executor** is unchanged. Approved registration of S3a and S3d SQL schemas, production apply/strict ledger verification, and source-vs-serving revision checks are mandatory before actual login/signup.
5. [Issue #388](https://github.com/WasanthaK/khrental/issues/388) remains open; the earlier production migration plan for its original nine migrations was recovered and passed read-only, but B04 tables are **not ledgered**. Diagnostic [PR #391](https://github.com/WasanthaK/khrental/pull/391) remains a green-CI draft whose promotion was blocked; do not bypass.

**No production mutations:** no Azure configuration, credentials, account creation, email, demo renter deletion, Evia activity, SQL apply, or Stripe usage. Quixo owner subscription billing remains a separate $5/managed-dwelling flow.
