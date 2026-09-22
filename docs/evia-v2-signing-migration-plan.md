# Evia Sign API V2 signing migration plan

Status: **design only — do not switch production signing yet**

This document records the verified migration path from the current working Evia V1 `type=3` auto-stamping request to Evia API V2. It deliberately separates documented facts from gaps that still need proof in a test request.

## Current KH Rentals production flow

The current browser service in `src/services/eviaSignServiceLegacy.js`:

1. obtains an Evia access token;
2. uploads the agreement using the existing V1 document-upload endpoint;
3. submits one `type=3` request containing:
   - title/message;
   - document token;
   - both signatories;
   - OTP configuration;
   - three auto-stamps per signatory: signature, email and date;
   - marker identifiers, offsets and stamp sizes;
4. receives an Evia `requestId`.

This flow has now produced a real signing request successfully and must remain unchanged until the V2 replacement is proven end-to-end.

## Verified V2 flow

Evia's V2 migration guide breaks the signing operation into five steps:

1. Upload document.
2. Create a skeleton request using `type=0`.
3. Add each signatory.
4. Add stamps for each signatory.
5. Send the request explicitly.

### 1. Document upload

The minimal-migration guide explicitly says the existing V1 document upload may remain unchanged. That is the lowest-risk first migration because KH Rentals already has a proven upload implementation using multipart form field `File` and receives a document token.

A separate current V2 upload page also documents a V2 upload endpoint and returns `documentToken`. Because the two documentation paths differ, KH Rentals should keep the proven upload step during the first V2 signing migration and migrate upload separately after an isolated test.

### 2. Create skeleton request

Documented operation:

`POST /_apis/sign/api/v2/requests?type=0`

Required request data:

- `Title`
- `Message`
- `Documents` — uploaded document tokens
- `AuditDetails`

Useful optional fields for KH Rentals:

- `CallbackUrl`
- `CallbackTypes`
- `CompletedDocumentsAttached`
- `Connections`

Expected response contains `requestId`.

KH Rentals should use the production callback URL:

`https://khrental-app.proudpebble-f58b5187.southeastasia.azurecontainerapps.io/api/evia/webhook`

The globally registered HMAC webhook remains the primary status channel. Per-request callback fields should not be added until we verify whether Evia applies the registered webhook security configuration to request-level callbacks.

### 3. Add signatories

Documented operation:

`POST /_apis/sign/api/v2/requests/{requestId}/signatories`

Documented fields include:

- `Email`
- `Name`
- `Order`
- `PrivateMessage`
- `SignatoryType`
- `Color`
- `OTP`

Expected response contains `requestId` and `signatoryId`.

For the first migration KH Rentals should preserve the currently proven ordering and values rather than changing business behavior at the same time:

- owner/landlord order 1;
- tenant order 2;
- `SignatoryType = 1`;
- OTP disabled unless product requirements change.

### 4. Add stamps

Documented operation:

`POST /_apis/sign/api/v2/requests/{requestId}/signatories/{signatoryId}/stamps`

Documented request body:

```json
{
  "Identifier": "signature1",
  "Type": "signature"
}
```

Supported documented types include `signature`, `initial`, `name`, `email`, `date` and `text`.

KH Rentals currently creates three stamps per signer:

- signature;
- email;
- date.

### BLOCKER A — placement semantics must be proven

The V2 stamp page states that `Identifier` is used later during stamp placement, but the public page does not document the old V1 `Offset`, `StampSize`, `Color` and `Order` placement data that KH Rentals currently sends inside `AutoStamps`.

The V2 migration guide calls this step both “Add stamp positions” and “Add AutoStamp,” but does not provide the missing placement schema.

Do **not** replace the working V1 auto-stamp request until one of these is obtained:

1. current Evia documentation for placement/auto-stamp coordinates; or
2. a confirmed V2 test showing that the marker `Identifier` alone locates the text marker in the generated KH Rentals PDF.

The existing markers should be retained for that test, including the landlord/tenant signature markers and the current email/date identifiers.

### 5. Send the request

Documented operation:

`POST /_apis/sign/api/v2/requests/{requestId}/send`

No request body is documented. Expected response contains `requestId` and optionally `embeddedSigningUrl`.

## Completion webhook and signed PDF

The current globally registered webhook subscribes to:

- `request.sent`
- `request.completed`

KH Rentals already verifies the webhook HMAC and maps a valid completion to:

- agreement `status = signed`;
- signature status complete;
- completion timestamp;
- all stored signatories completed.

It deliberately does **not** activate the tenancy. Activation remains owned by `/api/tenancies/{agreementId}/activate` after onboarding readiness checks.

### BLOCKER B — completed document representation must be proven

The V2 request-creation documentation says `CompletedDocumentsAttached=true` causes signed PDFs to be attached to the final callback. The public webhook documentation, however, only describes `RequestId` and final `Status` for `request.completed` and does not define the attachment field, encoding or download contract.

Before relying on this option, capture one real V2 completion payload or obtain the exact Evia schema for:

- attachment field name;
- content encoding or download URL;
- MIME/type metadata;
- multiple-document handling;
- authentication requirements for any download URL;
- retry/idempotency behavior.

KH Rentals must continue preserving the original generated agreement separately from the final signed artifact.

## Status and reconciliation

The current legacy status helper should not be used as the design basis for V2. It relies on an old endpoint and a build-time access-token fallback.

The target architecture should use one of the following, in order of preference:

1. authenticated HMAC webhook as the normal source of truth;
2. documented V2 request/status endpoint for explicit reconciliation;
3. no browser-embedded static Evia token.

A reconciliation endpoint is still useful for events that occurred before webhook registration or for administrator recovery, but it must use the same server-side OAuth/token path as normal Evia operations.

## Migration sequencing

### Slice 1 — OAuth cleanup

Prepared separately in draft PR #57:

- direct V2 token exchange on the KH Rentals server;
- remove global V1-to-V2 `fetch` shim;
- remove duplicate callback component;
- keep signing and webhook behavior unchanged.

Do not merge until the currently running physical production signing/webhook test is complete.

### Slice 2 — V2 signing client, not yet wired

After Blocker A is resolved:

- add server-side V2 request client;
- keep the proven document upload initially;
- create type=0 request;
- add each signer;
- add the same three logical stamps per signer;
- send request;
- unit-test every URL and payload;
- leave legacy production path selectable until an end-to-end test passes.

### Slice 3 — completion artifact

After Blocker B is resolved:

- ingest/download the completed PDF server-side;
- store it under the exact tenant/agreement R2 path;
- keep original and signed documents separate;
- make completion processing idempotent;
- prove Evia retries do not duplicate data or files.

### Slice 4 — remove legacy implementation

Only after the V2 path passes a complete production-safe test:

- remove V1 request creation/status/download code;
- remove browser static-token fallback;
- remove dead compatibility constants and debug code;
- keep a single callback component and a single OAuth implementation.

## Production acceptance criteria

A V2 migration is complete only when one test agreement demonstrates all of the following without manual database edits:

1. OAuth succeeds.
2. Agreement PDF uploads successfully.
3. Two signatories are created with the expected order.
4. Signature/email/date fields appear in the correct locations for both signers.
5. Both signing emails are sent.
6. Evia webhook deliveries return 2xx.
7. KH Rentals shows per-recipient email state independently from signature state.
8. Completion changes the agreement to signed, not active.
9. Both signatories show completed.
10. Original PDF remains available.
11. Final signed PDF is persisted separately in KH Rentals storage.
12. Onboarding requirements still gate the later transition to active.

## Do not change during the current production test

Until the user's current physical test finishes, do not deploy changes to:

- production Evia authorization URL;
- signing request payload;
- auto-stamp identifiers/placement;
- webhook HMAC verification;
- agreement completion mapping;
- activation rules.
