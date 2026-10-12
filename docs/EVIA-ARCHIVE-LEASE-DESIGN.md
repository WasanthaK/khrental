# Evia signed-document archive lease — design and staging precondition

Status: **DESIGN ONLY — NOT ENABLED IN PRODUCTION**. This document defines the
next Phase 4 migration from a long-held agreement-scoped SQL application lock
(PR #241) toward short SQL transactions plus a durable, fenced archive lease.
PR #242 already limits local archive concurrency; neither prior guarantee is
to be removed by the staging-preparation slice.

## Baseline and risk

- Evia callback verification remains HMAC or authorized scoped callback-token,
  followed by tenant and Evia request matching.
- Delivery-ID claims protect repeated and simultaneous deliveries. Different
  IDs of the same agreement can reach archive work, which is why the existing
  agreement-scoped lock remains necessary.
- Current signed and audit PDFs are stored at stable
  `tenants/{tenant}/agreements/{agreement}/signed/{sanitized filename}` paths.
  Without immutable per-attempt paths, a worker whose lease expired could
  overwrite a newer archive even if its database completion is rejected.
- PR #241 holds a transaction-owned SQL application lock across both external
  Evia download and storage upload and final agreement completion. It is
  safe for owner serialization but pins a pooled database connection.
  PR #242 caps local admission to limit starvation.

## Contract implemented in this preparation slice

`createEviaArchiveAttemptId()` generates a new opaque UUID. Both
`storeEviaWebhookCompletedDocuments` (verified inline documents) and
`retrieveAndStoreEviaCompletedDocuments` (Evia API retrieval) accept an
**optional** `archiveAttemptId`. When supplied, paths are built as:

`tenants/{tenant}/agreements/{agreement}/signed/staged/{attemptId}/{sanitized filename}`

The signed agreement and audit trail of one attempt share its prefix.
Attempts have independent prefixes and cannot overwrite another attempt's
objects with the same document filename. Invalid path/attempt identifiers
fail closed. When the option is omitted, previous production paths and
returned URLs stay exactly the same. **The live webhook deliberately does
not supply this argument and still uses the existing archive SQL lock.**
A staged PDF must never be promoted as authoritative merely because upload
succeeded.

## Required future durable lease protocol

1. Verify Evia signature/callback token and resolve tenant, request and
   agreement before beginning archive coordination. Retain delivery-ID
   ownership and terminal-state protections.
2. In a **short SQL transaction**, acquire an exclusive application lock
   scoped by `tenant_id + agreement_id`, read current agreement and a durable
   one-row lease claim, then either return the existing signed URL, return
   retryable in-flight, or issue a fresh random `archiveAttemptId`/fencing
   token and lease expiry. The durable claim must serialize distinct Evia
   delivery IDs. Decide whether to implement the claim in the existing
   `webhook_events` table with a reserved event type or a separately
   governed table; do not silently add runtime DDL.
3. Commit and **release the connection before** external download/upload.
   Stage *all* signed documents and audit trail under that attempt's immutable
   path. Any retry, token renewal and timeout handling must be explicit.
4. In another short, tenant-scoped SQL transaction, lock the same resource;
   prove the lease token still owns the agreement and is unexpired, re-check
   agreement terminal state, Evia request and stored-document URL, and write
   the winning signed-document pointer and completion audit once. An old
   token must fail without updating status, URLs or signer progress.
5. Complete or release the lease and the winning webhook event atomically
   with the final state update where feasible. A successful upload by a
   losing worker is only an *orphan staged object*, never a winning URL.
   Do not expose staged paths through public agreement reads before fencing.
6. A crash or retry must safely reclaim an expired lease. A live worker must
   renew before expiry if external processing can overrun the lease; do not
   extend a lease after another owner has acquired it. Aborted attempts
   require eventual orphan cleanup only after a safe retention grace period.

## Non-negotiable acceptance gates for the future runtime switch

- Disposable two-tenant SQL Server proof that two different deliveries can
  race; only one lease token can win, and no live SQL connection is occupied
  while mocked external storage is blocked.
- Simulate worker A upload delay, lease expiry and worker B takeover. Both
  stage identically named PDFs to **different** paths; B alone can publish its
  URL and a late A cannot overwrite either B's stored object or the DB pointer.
- Prove cross-tenant and wrong-request isolation, denial of expired tokens,
  repeat finalized callbacks and stable completion timestamps.
- Simulate failures before staging, after staging but before commit, and after
  commit but before acknowledgment; prove retry and signed-PDF recovery
  without doubling side effects.
- Validate inline webhook attachments **and** Evia API retrieval; keep audit
  trail paired with the winning signed PDF.
- Leave manual signing, existing Evia HMAC, terminal-order rules, billing,
  receipt and renter membership behavior unchanged.
- Exact-head build/authorization, dedicated Evia and disposable SQL+browser
  CI must all pass, followed by merge-SHA Azure revision Ready, exact public
  build SHA and live MSSQL health. A staged-path unit test alone does not
  satisfy or replace these proof requirements.

## Cleanup and operational caution

An immutable staged path is intentionally not automatically deleted by a
losing worker while another attempt is active. Any staged-object garbage
collector must consider durable lease state and a sufficiently long grace
period before deleting unreferenced storage. Monitor lease contention, retry
rates, archive duration, pool use, staged-object counts and storage cost.
Until fencing, orphan policy and race acceptance are proven, keep the
currently deployed SQL lock and capacity limit as the authority.

## Prepared durable lease core (not yet wired into webhook)

The independent `src/api/evia/archiveLease.js` module now implements
short-transaction `acquireEviaArchiveLease`, `renewEviaArchiveLease`, and
`finalizeEviaArchiveLease` operations using a reserved
`webhook_events.event_type = 'evia.archive.lease.v1'` row. The unique logical
identity is tenant + agreement + Evia request; `sp_getapplock` serializes
writers under a transaction. The server clock and `updatedat` determine
15-minute lease validity, preventing host-clock skew. A new UUID attempt
fences old owners, and the final SQL transaction verifies tenant, Evia
request, current token, expiry, immutable attempted PDF URL, and live terminal
state before publishing signed-document pointers and completing the
reserved event. Stale attempts never receive publication authority. A
failed publish transaction rolls back both the agreement and lease row.

This is an **unreferenced runtime module**; the actual webhook still calls
`withEviaArchiveCapacity` and `withEviaAgreementArchiveLock`. Real
disposable SQL acceptance exercises the module but cannot be treated as
live integration acceptance. Although the reserved event row requires no
new DDL, it is a separate namespace from Evia-delivery events: avoid
matching it as a provider delivery or exposing it in provider event views.

### Remaining prerequisites before any live switch

- Preserve signatory-completion metadata and audited processed **delivery**
  record semantics together with a winning archive promotion; the lease
  module presently finalizes the agreement and lease row but deliberately
  does **not** replace the webhook's delivery-event workflow.
- Decide how to pair the winning audit trail URL with a signed-PDF URL and
  how to safely retrieve a missing retained PDF after a partially successful
  callback without losing prior completed-signature data.
- Add periodic ownership-checked renewal around slow Evia download/storage,
  and bound external operations with appropriate timeouts; an expired
  worker must never regain the lease.
- Confirm correct behavior under process death between claim, upload,
  database commit and HTTP acknowledgement, including orphan staged objects
  and duplicate provider retry.
- End-to-end disposable SQL Server + fake storage integration must prove that
  the external call runs with **no connection pinned by the lease** and that
  only one attempt's immutable PDF is published during an expiry/race.
- Do not activate the new lease in live webhook until all these gates are
  green and a separately reviewed migration slice explicitly replaces the
  old archive lock.

## Prepared dormant staging coordinator (not yet a webhook handler)

`src/api/evia/archiveCoordinator.js` now composes the existing SQL lease
operations into a **dormant** fenced PDF staging attempt. It obtains a short
tenant/request-bound lease, passes the exact lease `attemptId` into the
optional immutable storage path, renews ownership while external staging is
active, drains any in-flight heartbeat, renews once again before publication,
and only returns success following a fenced `finalizeEviaArchiveLease`.

For documents, the `stageEviaDocumentsForFencedLease` adapter uses the
existing validated inline signed-document storage first and falls back to
the verified Evia API retrieval contract. A missing signed PDF is an error,
not an authoritative completion. A busy lease returns retryable status, and
a completed lease short-circuits without another upload. Renewal loss
requests cancellation through an `AbortSignal`, but storage drivers may not
honor cancellation; immutable attempt IDs and fenced finalization therefore
remain the decisive protections.

The module is **not imported into the live Evia webhook**. No background
jobs or live provider callbacks invoke it. The existing cross-replica
agreement SQL lock and per-replica archive capacity guard remain the
production authority. This module does not yet mark the source delivery
event processed, transfer verified signer metadata, publish the completed
audit trail through its own canonical field, or implement orphan cleanup.
All remain required before any live switch.

The dedicated Evia test covers the heartbeat, stolen-owner fencing, empty
signed-PDF failure, inline/API fallback, tenant/attempt identity preservation
and lack of webhook integration. Real disposable two-tenant SQL Server tests
exercise two workers with one blocked fake storage operation: one claim wins,
another observes busy, SQL remains queryable, the winner alone publishes a
staged PDF and audit pair, and replay and foreign-tenant calls are
non-mutating. These are pre-production integration proofs, not authorization
to flip runtime transport.

## Dormant verified delivery accounting and lost-HTTP-ack recovery

The fenced SQL publication operation can now optionally accept a
`verifiedDeliveryEventId` created by the **already-authenticated** provider
callback path. In the same transaction that publishes the winning immutable
signed document URL and completes the reserved archive lease, it:
- Verifies the delivery row belongs to the exact tenant and Evia request,
  is not a reserved lease row, and actually represents completion.
- Marks the source delivery processed (with processed timestamp).
- Marks *stored agreement signatories* completed, preserving existing signed
  dates and email-delivery fields rather than trusting webhook-input signer
  fields; malformed stored JSON fails closed.
- Preserves the existing signed agreement date and signature completion date
  through COALESCE and refuses conflicting terminal-state updates.

`acknowledgePublishedEviaArchiveDelivery` is a separate *read-only for the
agreement* recovery path for verified completion events delivered again
after a successful SQL commit but a lost HTTP response. It requires the
agreement already be signed/completed with locally retained signed URL,
and the archive lease itself be processed. It atomically acknowledges a
new scoped completion delivery or returns `already_processed` for a repeated
one without touching agreement timestamps or documents. Missing/foreign
tenant, wrong request, non-completion, and reserved-lease event IDs are
rejected; no false completion acknowledgment is allowed for a pending PDF.

The dormant coordinator passes an optional verified delivery event ID
through finalization and calls this recovery operation only when archive
lease acquisition returns complete. **Nothing in the live webhook imports
these new APIs.** These entry points do not establish independent Evia HMAC
or callback-token authentication; they may be used in a future runtime
path only after the existing verified handler has created its scoped
delivery event and proved the correct Evia request and agreement.

The real isolated Docker SQL Server acceptance includes both delivery
and lease events, signer metadata, negative foreign tenant/request and
non-completion cases, atomic publication, acknowledged retry after a
lost response, immutable agreement timestamps on replay, and refusal
to acknowledge an archive that was never published.

Still pending before a live switch: integrate the real authenticated
webhook transition, validate active archive recovery if callback processing
fails before SQL publication, audit-trail exposure policy, safe orphan
staged-object cleanup, and tested process-death/lease-expiry behavior.

## Default-off authenticated webhook canary routing

The live verified webhook processor now contains an **explicit, default-off**
canary branch for the prepared fenced archive coordinator. This is a release
safety gate, NOT blanket activation:

- `EVIA_FENCED_ARCHIVE_MODE=canary` must be set server-side; any missing
  or other value uses the legacy transaction-owned archive lock.
- The `EVIA_FENCED_ARCHIVE_CANARY_TENANTS` and
  `EVIA_FENCED_ARCHIVE_CANARY_AGREEMENTS` server-side comma-separated
  UUID allowlists must both match the resolved agreement exactly.
- Authentication must have completed in the existing Evia router **and**
  the callback-token verification must bind an explicit tenant and agreement.
  HMAC-only unscoped request matching does not enter the canary, even if
  its payload contains matching IDs.
- Only terminal completion events with a provider `deliveryId`, no
  recipient-specific email/name fields, and no previously retained signed
  local document are candidates. Cancelled, rejected, failed, stale partial,
  missing delivery ID and existing signed-document callbacks stay legacy.
- After a tenant/request-bound provider event claim, the canary uses
  local archive capacity admission, durable fenced SQL lease acquisition,
  immutable per-attempt staging and ownership renewal. It requires BOTH
  the local signed PDF and local audit-trail URL before publication. The
  verified delivery event, completed signers, signed PDF pointer and
  reserved lease event are committed together. Busy/failure always yields
  retryable HTTP 503 and immediately ages this delivery's **unprocessed**
  event claim to allow the provider to retry. A completed result returns
  HTTP 200 only after the committed publication/recovery is proven.

**Operations requirement:** Do NOT set these canary environment variables
in Azure or any other production environment in this slice. The gate stays
OFF. Actual activation requires a separately reviewed operator approval,
end-to-end signed callback-token proof, storage crash/expiry race acceptance,
audit-trail access policy and an orphan staged-object retention/cleanup
contract. No new schema migration is required, but the prepared archived
staging objects may be orphaned by failed attempts if the gate is enabled
before a cleanup policy exists.

Regression proofs include default-off/allowlist/token binding unit tests
and disposable two-tenant SQL Server callback-claim-to-immutable-storage
integration, a busy claim response followed by retry, signed and audit-trail
publication, idempotent replay, stable timestamps and wrong-tenant denial.
The existing production webhook remains the default runtime path.

## Expired-owner storage race proof and conservative orphan inventory

A dedicated disposable two-tenant SQL Server test reproduces the actual
failure sequence: a verified delivery worker A claims a fenced lease, then
its mocked external upload stalls with **no SQL connection held**. SQL Server
advances the lease record beyond expiry (in disposable tests only). Worker B
takes over with a different UUID, stages the signed PDF and audit trail into
different immutable keys and atomically publishes its signed PDF/lease and
verified delivery event. A is released after B's commit, may finish writing
its own stale objects, but its final SQL renewal **must fail fenced**.
The authoritative agreement PDF, signed/completion timestamps, audit URL,
and winning bytes remain unchanged. A subsequent authenticated scoped
delivery acknowledgment safely processes the original event without
re-signing or re-uploading. Tenant isolation remains enforced.

The minimal `stagedOrphanReview.js` is a **read-only review helper**, not
a deletion implementation. For a storage-listed candidate it requires a
strict per-tenant, per-agreement, per-attempt immutable path, a valid matching
agreement and lease snapshot, absence from authoritative signed document
and winning audit references, absence of an active matching lease, and a
minimum **30-day observation grace period** before marking
`manual_review_candidate`. Returned `mayDelete` is **always false**;
invalid/missing input is protected. It performs no SQL mutation, object
listing, unlink or storage deletion. A historically overwritten lease row
cannot prove an older object is safe to delete; matching a review candidate
is only a queue for further operator investigation.

**Still blocked before canary activation:** a durable append-only history
for abandoned attempts, validated audit-trail access/disclosure behavior,
safe crash recovery for incomplete upload pairs and post-commit response
loss on the actual authenticated HTTP route, and full scoped storage purge
authorization (if cleanup is ever enabled). Do not set canary environment
variables or run deletes as a result of the review helper.
