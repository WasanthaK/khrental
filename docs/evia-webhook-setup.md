# Evia webhook integration

Provider callbacks are server endpoints, not React Router loaders. Express mounts `/api/evia/webhook` and `/api/evia/legacy-webhook` and retains the raw request bytes for signature verification. The retired browser-router example must not be restored.

`EVIA_WEBHOOK_HMAC_SECRET` is server-only. The existing configure workflow is manual, main-only and uses the Production environment. Changing application cloud configuration does not prove that Evia accepted a provider configuration change.

The existing callback capability is tenant/agreement scoped, expiring and checked against the matched request before mutation. Its URL transport remains under review because edge logs can contain query strings; prefer signed-body HMAC where provider support is established. Do not log or publish callback URLs. Preserve accepted signing while provider service/audit dependencies are held.

Use the [security review disposition](SECURITY-REVIEW-20261111.md) for validation and outstanding dependencies, and the [service notes](../src/services/README.md) for current application entry points. UI notices use the existing `react-hot-toast` provider; webhook processing never depends on a browser session or toast renderer.
