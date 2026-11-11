# Service integration notes

`eviaSignService.js` is the public signing facade. It overrides current operations and retains active compatibility exports from `eviaSignServiceLegacy.js`; the Legacy filename alone does not make the module safe to delete. Routed agreement pages use the facade. Product documents are generated through Evia, with tenant-scoped application authorization and protected document delivery.

Evia client secrets, bearer tokens and API keys belong on the server as `EVIA_SIGN_CLIENT_SECRET`, server-managed tokens and `EVIA_SIGN_API_KEY`. A public client ID can be supplied as `EVIA_SIGN_CLIENT_ID`/the supported public configuration. Builds reject secret/token `VITE_` settings. The retired browser token helper cannot provide a fallback credential.

Webhook processing runs in Express at `/api/evia/webhook` and `/api/evia/legacy-webhook`, before parsing loses the original request bytes. Browser routes cannot receive or authenticate provider webhooks. Raw-body HMAC verification is preferred; the existing signed callback capability is separately bound to a tenant/agreement and expiry, then checked against the request binding before writes. Its query-string transport still needs provider/edge-log review; it is not equivalent to a provider bearer token or a signed body. Do not expose callback URLs in logs or screenshots.

Current status reads, callback processing, completion fences and protected document access have contract tests. Tests using synthetic provider transport are not evidence of genuine provider delivery or inbox receipt. Accepted real signing stays closed; service exchange and audit-package retention remain held dependencies. Do not use the former sample code that fabricated successful status checks, handled callbacks in React or embedded browser credentials.

Notifications use the root `react-hot-toast` provider. Use `toast.success`, `toast.error`, or `toast(message)`; do not add another toast renderer.

See [security review](../../docs/SECURITY-REVIEW-20261111.md), [authentication lifecycle](../../docs/AUTHENTICATION-LIFECYCLE.md) and [execution plan](../../docs/EXECUTION-PLAN.md) for current authorities and evidence.
