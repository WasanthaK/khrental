# Recover an existing Evia signing audit

Use this action when a completed historic agreement already has a locally
retained signed PDF, its signing audit is missing from KH Rentals, and the
audit exists in Evia. This does not initiate signing or resend invitations.

An active tenant administrator opens View Signing Audit, then chooses
Recover existing audit from Evia on the document error. A successful recovery reloads the
protected viewer so the audit can be inspected and downloaded.

Recovery uses the deployment's existing server-side Evia integration key;
it does not require a browser signing session. The key stays on the server.
The server reads the agreement under the active tenant and uses its stored
Evia request reference. Caller-supplied provider IDs and storage paths are
not accepted. Recovery downloads only the request's single audit_trail.pdf,
requires PDF bytes, conditionally creates the scoped object, and checks exact
readback. Existing valid audits are reused. Storage errors, ambiguous or
missing provider audits, invalid PDFs and conflicting retained bytes fail
without overwriting the signed agreement or audit. Structured server logs
record the actor, tenant, agreement and whether recovery created an object;
credentials and PDF contents are not logged.

This route is restricted to historic stable signed-document paths. Fenced
staged archives continue to require their existing publication protocol.
It does not update agreement status, signature rows, SQL manifests or
invoice archive flags. No schema migration is required.

Release validation must separately prove recovery of the existing provider
audit for the controlled agreement, authorized PDF retrieval and denial for
unauthorized users. Passing fixture tests is not live provider acceptance.

## Live provider routing investigation — 3 November 2026

**Status: BLOCKED; audit download is not fixed.** User explicitly requested this investigation for replacement agreement D13ECCF2-A82A-41DB-9EB7-3AB968440BB0. The signed PDF remains intact; no resend, re-sign, payment or activation was performed.

### Reproduced evidence

- The application currently exchanges its server integration key at POST https://evia.enadocapp.com/api/v2/oauth/exchange, then lists GET /_apis/sign/api/v2/requests/{requestId}/documents and downloads the exact returned audit URL. Previous live recovery returned a non-JSON HTTP 404.
- Public, credential-free runner diagnostic [41613499317](https://github.com/WasanthaK/khrental/actions/runs/41613499317) on 3 November at 09:44 UTC independently returned **404 text/html** for the configured exchange URL. The same operation under the documented Sign API base (/_apis/sign/api/v2/oauth/exchange) returned **404** as well. No credentials, tenant data or request identifiers were sent in these probes. This is route evidence, not authenticated permission acceptance.
- The runner retrieved the current official [completed-document guide](https://docs.sign.enadocapp.com/evia-sign-api/v2/webhook-management/retrieve-completed-documents-from-a-webhook): it specifies POST /api/v2/oauth/exchange with X-Api-Key and the same document-list/download routes used in this application. It does not give an alternative absolute exchange URL. Do not replace this with guessed routes or send the API key directly to document download endpoints.
- Official [Power Automate guide](https://docs.sign.enadocapp.com/evia-sign-api/v2/webhook-management/store-completed-documents-in-sharepoint-using-microsoft-power-automate), retrieved in [41613637305](https://github.com/WasanthaK/khrental/actions/runs/41613637305), describes a different completedPackage.url/token ZIP flow. The current receiver has no completed-package adapter. Its presence in documentation is not evidence that this agreement's webhook supplied a usable package, and no package URL/token was obtained. Package URL, request binding, expiry and authenticated webhook evidence must be established before implementing that path.
- Local scoped regression: **45/45 PASS** across evia-audit-recovery, evia-completed-documents and evia-audit-http. These use controlled provider fixtures and do **not** establish live Evia availability. No application-runtime change or production deployment was made during this investigation.

### Concrete unblock / provider handoff

Confirm or restore the deployed absolute API-key exchange URL for evia.enadocapp.com and demonstrate an authorized completed-document list plus audit download for the existing request. Alternatively supply the supported completed-package retrieval/reissue contract for an already completed request (including URL scope, token format/expiry and safe retry). Then implement the verified adapter correction and prove audit-only immutable retention/readback, repeat-download idempotency and unauthorized denial. Do not request new signatures merely to obtain another webhook. The provider backend is not available in the connected KH Rentals repository; its routes cannot be repaired here.

### Current-documentation recheck and authenticated route comparison

At the user's request, read the **live** full documentation index and current authorization, webhook and document guides in [41614023043](https://github.com/WasanthaK/khrental/actions/runs/41614023043), rather than relying on the older repository copy or search excerpts. The authorization guide defines the Sign base as https://evia.enadocapp.com/_apis/sign. The retrieval guide gives a relative /api/v2/oauth/exchange, so omission of that base was a plausible integration bug, not enough evidence to declare a provider outage.

[41614207312](https://github.com/WasanthaK/khrental/actions/runs/41614207312) then tested **both interpretations with the existing Production integration API key**, keeping credentials and response contents out of logs:
- Origin-relative /api/v2/oauth/exchange: HTTP 404, text/html.
- Sign-base /_apis/sign/api/v2/oauth/exchange: HTTP 404, no content type.
- Neither returned a token, so no authenticated list/download was attempted. No request was sent/recreated and no storage was written.

**Corrected conclusion:** the old-URL hypothesis was investigated, but no working replacement URL is established. Do not report a general Evia outage or assert that a URL-only patch fixes this. Current docs also recommend consuming completedPackage.url and its event-scoped token for ZIP retrieval; this app does not implement that adapter. Supporting that newer path requires a verified request-bound payload/URL contract and token-expiry/recovery handling, especially for already-completed agreements. Audit acceptance remains open.
