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
