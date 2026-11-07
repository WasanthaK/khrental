# Recover an existing Evia signing audit

## Evia service ownership correction — 8 November 2026

Evia is Quixo's service integration. Organization users, including landlords, do not need an Evia account to recover completed documents. Earlier sender-login recovery guidance is superseded. The bounded correction routes signed-document and audit recovery through the authenticated Quixo server using its service credentials, ignores caller-supplied provider tokens and removes the customer Evia sign-in action. Application session, organization membership and agreement authorization remain mandatory. Source validation is in progress; deployment and live acceptance are not yet established.

Read-only service authentication probes reached the provider: both documented API-key exchange candidates returned HTTP 404 (run 42405787092); the existing API-app client-credentials probe using deployment credential aliases returned HTTP 501 without a token (run 42405894400). These are transport observations, not proof of invalid credentials or a provider outage. The temporary diagnostic workflow is retired with no environment, secrets or cloud permissions. No production SQL mutation, document resend, re-sign or activation was performed.

The supported service token exchange or genuine completed-package delivery still needs confirmation from Evia. Do not substitute a landlord login or guess grants/routes. Current audit retention remains FAILED/OPEN (CT03), and R5 remains incomplete with live charging disabled. Existing sending/signature-management browser OAuth is outside this bounded recovery correction and has not been accepted as a service-owned flow.


## Fresh completion retry correction — 7 November 2026

The authorized prelaunch test recorded completed signatures and opens its signed-document viewer, but its audit returns HTTP 404. Read-only diagnostic 42399878728 found completion metadata containing the signed PDF without an audit or completed-package descriptor. The configured integration credentials were present; successful provider retrieval was not established.

The receiver correction keeps genuine signing completion and signed bytes intact while returning a retryable response for missing audit retention. Verified metadata-only completion replays check or recover the audit before duplicate/terminal acknowledgement. Retained audits skip provider calls; failed, cancelled and fenced publications preserve their existing boundaries. Regression coverage includes provider failure, metadata-only recovery, repeat delivery and immutable signed bytes/timestamps, using synthetic provider transport and disposable SQL. PR #533 merged at `d6d94f90caf3d69f19b9f18391707ec705e4e80c`. Reviewed head `9010d87708c0dc60efcc06977a149d432b5bda2c` passed 908/908 authorization/build (42402298413), disposable SQL/browser/lifecycle (42402298382) and Evia (42402298376) checks. Release 42402625224 passed at ready revision 0000473; independent public build-info matched. Post-release authenticated audit readback still returns HTTP 404, so current audit recovery and CT03 remain OPEN. This fixes retry handling; it does not establish a working provider exchange, recover the existing missing audit or close fresh automatic two-file acceptance. No resend or re-sign is required.

## Current recovery behavior and acceptance — 3 November 2026

**Current agreement audit retrieval CLOSED — live PASS.** View Signing Audit and Download returned the matching two-page completion audit in the authorized administrator session, and reopening after a full page reload passed. #491 and #492 are merged/deployed; #492 passed 863 application tests and deployment [41668489175](https://github.com/WasanthaK/khrental/actions/runs/41668489175), with ready revision 0000452, matching build and MSSQL readiness.

The browser now sends an authorized local-only recovery request first. The server reuses a valid canonical audit or recovers a supported `EviaSign_AuditTrail_<UUID>.pdf` alias scoped to the persisted agreement/request. This path needs no Evia connection and cannot contact the provider. Only the exact local-missing response proceeds to existing OAuth recovery; application authorization or storage errors stop immediately. PDF validation, conditional creation and byte readback remain enforced; signed documents and agreement state are preserved.

Provider-named audits are normalized in both inline and completed-package handling. Future automatic retention of both signed and audit PDFs is still to be checked during the next legitimate contract acceptance, separately from the now-completed current download. Do not re-sign the existing agreement, repeat browser login loops, or import an audit belonging to another request.

The following original procedure and investigation entries are historical where they describe integration-key-first recovery or an unresolved current audit. The [current canonical plan](EXECUTION-PLAN.md#current-canonical-status-and-plan-review--3-november-2026) controls the remaining work and preserves the older R1 waiver without retrospectively declaring its historic agreement verified.

## Historical procedure and investigation

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

## Completed-package implementation — 3 November 2026

The receiver now consumes `completedPackage.url` and its event-scoped token from a verified completion webhook after matching the persisted request to its agreement. It uses the exact provider-supplied URL on the trusted Evia Sign origin, disables redirects, enforces expiry/time/size limits, and validates the ZIP directory, entry names, expansion sizes, CRCs and PDF headers before storage. A signed PDF and exactly one audit are required. Package retrieval does not use the failing API-key exchange endpoint. The old API fallback remains for callbacks without a package.

Evidence handling runs before duplicate/terminal acknowledgements: an already-signed agreement can receive its missing audit from a verified package or inline audit attachment. This reuses conditional audit-only creation and exact readback; signed bytes, signatory rows, signing timestamps and agreement state remain unchanged. An existing valid audit skips download entirely, including an expired replay token. Package failures return a retryable response before claiming the delivery, allowing provider retry without another signature request. Tokens/URLs/package contents are not stored in webhook logs. Fenced staging retains its existing protocol.

Validation before CI: 102 Evia tests pass (10 new package/replay cases), clean lockfile install succeeds, production build succeeds. Broader local authorization suite: 839 pass, one existing browser test blocked by unavailable Chrome. CI and production/live acceptance remain pending at this checkpoint.

Existing missing audits cannot be reconstructed from signed PDFs. The already-completed agreement still needs a verified Evia re-delivery with an unexpired package descriptor or an inline audit. Do not claim that implementing future capture has recovered that historical file. No new signing is required by this implementation.

## Evia package audit fix deployed; existing download still failing — 3 November 2026

[PR #489](https://github.com/WasanthaK/khrental/pull/489) merged as `035d42536aac01c05b9618482e694ba3b5b31390`; reviewed head `0ac9289970f2b4c65528a4e2e66654b9d24e738a`. All three PR workflows passed; main verification **840/840 PASS**, focused local Evia tests **102/102 PASS**, clean install and production build PASS. [Deployment #41617426391](https://github.com/WasanthaK/khrental/actions/runs/41617426391) **SUCCESS**: ready revision `0000449`, matching public build SHA and live MSSQL readiness.

Implemented verified completed-package retrieval using the exact event URL/token, bounded ZIP/PDF/CRC validation, canonical audit filename, and audit-only evidence handling before terminal/duplicate acknowledgement. Verified package or inline-audit re-delivery can retain a missing audit without overwriting signed bytes, timestamps, signatories or agreement state. Existing valid audits skip repeated provider downloads. No schema, provider configuration, signing, payment or activation change.

**Fresh live owner retest: FAIL / OPEN.** After signing in as +514 to JEERY'S PLACE, the agreement list still shows both signatories Signed and the agreement Completed / signed-onboarding-required. View Signing Audit for `D13ECCF2-A82A-41DB-9EB7-3AB968440BB0` returns "Signing audit PDF not found (HTTP 404). It may not have been retained in storage." One built-in recovery attempt then returns "Evia returned a non-JSON HTTP 404 response." No PDF was downloaded, and end-to-end audit acceptance is not complete.

The current receiver supports a verified provider completion-package or audit re-delivery, but no usable re-delivery for this existing request has been observed. The missing historical audit is not recovered by deployment alone. Do not fabricate a webhook, repeat signing, or claim successful download. PDF layout and the wider rental lifecycle remain open. This release and retest supersede older pending-deployment / no-runtime-change statements below without replacing their historical evidence.

## Independent authenticated curl reproduction — 3 November 2026

At the user's request, [curl diagnostic #41623929241](https://github.com/WasanthaK/khrental/actions/runs/41623929241), job `125876389710`, repeated the existing integration-key exchange using curl on GitHub Actions. The existing Production key was passed through stdin headers to the exact Evia host, without verbose logging, redirects, printed credentials or raw response contents. Both requests used POST, JSON content type, X-Api-Key and body `{}`.

| Exact endpoint | curl exit | HTTP | Content type | Response bytes |
| --- | --- | --- | --- | --- |
| https://evia.enadocapp.com/api/v2/oauth/exchange | 0 | 404 | text/html | 153 |
| https://evia.enadocapp.com/_apis/sign/api/v2/oauth/exchange | 0 | 404 | absent | 0 |

Results at **16:30:31–16:30:32 Asia/Colombo**. Neither response supplied an access token, so authenticated document listing and audit download could not proceed. A separate local unauthenticated curl request also returned 404/text-html; the Production-key result above is the relevant authenticated reproduction. The successful diagnostic workflow means the probe ran, **not** that audit retrieval passed. The diagnostic branch was returned to manual-only triggering afterward; no runtime deployment or signed-document mutation occurred. Current live audit download remains FAIL / OPEN.

## OAuth audit recovery alternative — 3 November 2026

Independent unauthenticated curl to the documented completed-document list returned HTTP 401 / application/json, while both integration-key exchange URL interpretations returned HTTP 404. This establishes a reachable authentication boundary, not successful OAuth document retrieval.

Human-triggered audit recovery now passes the existing Evia OAuth access token to the already-authorized audit-only backend route. The browser previously sent an empty body and forced the failing integration exchange. Expired tokens use the existing V2 refresh broker; a provider document 401 refreshes and retries once. Application-session rejection, tenant denial, missing documents and outages do not trigger OAuth refresh or fall back to the unavailable exchange. A missing/rejected Evia connection exposes Connect to Evia Sign using the existing authorization flow in a separate tab with no opener; the user then retries recovery. No signature request is created or resent.

Provider audit retrieval and retention remain bound to the stored agreement/request and existing administrator/tenant checks. Conditional creation, PDF validation and exact readback remain unchanged. Signed bytes, status and signatories are not rewritten. Database CI also exposed an earlier completed-package replay regression: already-published fenced URLs were incorrectly sent to the historic audit writer and returned 503. Completion evidence now leaves those request-bound staged publications with their existing archive/replay guards. A regression covers duplicate delivery and expired package descriptors without a provider fetch or historic write. The separate server integration path is unchanged.

Focused OAuth client, broker and immutable recovery tests: 23/23 PASS. Initial application CI passed 848/848; the fenced replay correction and client/recovery regression set pass 32/32 locally. Final-head database CI, deployment and actual provider OAuth audit download remain pending at this checkpoint. Do not mark the historical audit recovered until the PDF can be downloaded and read back.

## OAuth recovery release status — 3 November 2026

PR #490 is merged and deployment #41626677557 succeeded. All five final-head CI workflows passed, including 849 application tests and the disposable database archive/replay checks. The public build matches the merged release.

Human-triggered recovery now reuses the existing OAuth connection used for signing. This corrects the earlier assumption that token acquisition was generally unavailable. Live audit-download acceptance remains OPEN; deployment and automated tests do not prove that the missing audit was recovered. Do not repeat browser login attempts. Continue from existing API evidence without requesting credentials in chat.


## Official completed-package contract rechecked — 3 November 2026

The [official guide](https://docs.sign.enadocapp.com/evia-sign-api/v2/webhook-management/store-completed-documents-in-sharepoint-using-microsoft-power-automate) documents a GET to the completion event's exact package URL, using `X-Webhook-Download-Token: Bearer <event token>` and `Accept: application/zip`. The event token expires and is separate from the OAuth connection used for signing. The deployed receiver follows this contract.

The documentation review does not prove recovery of the existing audit PDF. Live audit-download acceptance remains OPEN until the actual file is retrieved and verified. No new runtime change was made from this review.
