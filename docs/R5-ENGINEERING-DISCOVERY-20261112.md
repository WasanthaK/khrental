# R5 engineering discovery — 12 November 2026

Source baseline: `1f114d1fcd71ea93a8d399cb21a1b5c9881e5268`. This is the read-first report requested by the owner-supplied **R5 Engineering Handoff for Astra: Recovery, Restore/Split, Cessation**. No application code, migration, production data, provider object or flag was changed during discovery. No runtime or provider acceptance is claimed by source inspection.

## Result and implementation boundary

Extend the existing billing-command journal, inventory calculator and transactional authority. Do not introduce a parallel billing model. Workstream 1 precedes restore/split and broader cessation. Finished property/unit forms and accepted signing remain untouched. The handoff's D1–D8 defaults are authorized defaults for otherwise unanswered choices, but the concrete contradictions below require the clarification explicitly requested by its final stop condition.

### Conflicts requiring a decision before implementation

| Handoff requirement | Observed implementation / conflict | Recommended resolution |
| --- | --- | --- |
| Local billable inventory always equals Stripe quantity; no ceased property remains billed; one subscription item per live record | There is one aggregate subscription item per organization. Paid removals intentionally retain the current billed quantity and schedule the reduced quantity for renewal. Last-stock removal retains that quantity and cancels at period end. These are accepted behavior the handoff also says to preserve. | Check current paid quantity, operational inventory, next-renewal schedule and cancellation separately. Accept a difference only when explained by a verified operation and schedule. Do not create per-property Stripe items or immediate credits. |
| Complimentary properties have no chargeable Stripe item | Complimentary is an organization-level access overlay. `setComplimentary` deliberately makes no Stripe writes and can coexist with an already-paid subscription. The cessation matrix also requires zero Stripe writes for complimentary cessation. | Preserve existing subscription obligations; complimentary split/cessation creates no new provider charge or item. The checker must not interpret an existing paid subscription as an automatic invariant failure or cancel it. |
| New tables and nullable columns only; restore ceased records | `management_inventory_controls` has `CHECK(state='ceased')` and a unique resource constraint. Existing database triggers reject property/unit updates and new obligations whenever that row exists. An added restore table alone would not remove those trigger denials. | Retain each cessation/audit record, add nullable restoration metadata or linked transitions, and make the existing guards aware of the active cessation episode. This requires reviewed trigger-definition changes in addition to new tables/nullable columns. Do not delete controls or drop protection. Obtain this narrow migration exception first. |
| Every billing path must use one injectable clock and never system time directly | Transactional enforcement deliberately obtains `SYSUTCDATETIME()` while locking the billing account; an existing regression specifically rejects use of the application clock for authorization. | Inject application-time reads for service/provider tests while retaining locked database time for production write authorization. Tests inject/mock the database clock boundary separately. A browser or request must never choose authorization time. |

Additional specification details to retain: no trial is offered, and provider projection rejects trial-bearing subscriptions. A trial-state cessation cleanup test must not introduce trial enrollment or grant access. D2's split-at-renewal default is a new operation-specific policy, not a change to ordinary additions, which remain prorated onto the next invoice. A split must record the effective renewal quantity and must not pass a naive immediate-equality checker. D5 retains active parent rental/history without moving it; implementation must also prevent new child listings/rentals from double-letting the same occupied stock. This is an operation safety condition, not a new rental feature.

## Existing equivalents and data model

| Handoff concept | Repository equivalent and evidence |
| --- | --- |
| Operation journal | `dbo.management_billing_commands`, created by `migrations/20261103_01_management_billing.sql`: UUID, tenant, kind, input hash/JSON, pending/completed/failed status, result, creation/completion time. Extend additively rather than replace. Existing status CHECK cannot accommodate proposed new strings without changing its constraint; use nullable runner-state fields while retaining legacy status compatibility. |
| Runner | `service.js:runCommand` and `store.js:beginCommand/completeCommand`. Intent commits before provider writes; final local effects, result and audit share a transaction. New commands validate current administrator authority. |
| Concurrency | `store.js:locked` uses SERIALIZABLE SQL plus transaction-owned `sp_getapplock`; `beginCommand` refuses another pending command for the entire tenant. Keep this stronger account serialization: different properties still affect the same subscription quantity. Worker claims need durable leases/fencing and nonblocking selection, not process memory. |
| Webhook inbox | `management_billing_events` has primary key `stripe_event_id`. `service.js:webhook` retrieves the provider event, binds account/customer/subscription, locks tenant, deduplicates, projects and writes event/audit atomically. |
| Audit | `management_billing_audit` stores actor, tenant, action, resource, hashes and reason. Journal payload is not a substitute for this audit. |
| Account/subscription | One `management_billing_accounts` row per tenant, with unique customer/subscription bindings, one item, price, schedule, current and pending quantity, paid-through/grace and complimentary expiry. D1 is aggregate quantity per organization, counting independent residential dwellings. |
| Inventory | `contract.js:dwellingInventory` is the central residential identity/count authority. Whole property counts once if it has no units; otherwise eligible units count. Occupancy/public visibility is deliberately separate. `store.js:inventory` supplies operational, cessation and optionally staged rows. |
| Preparation | `management_inventory_staging`: private immutable payload/identity/hash, pending/promoted/withdrawn; existing property/unit batch API and confirmed promotion. Pending records do not enter operational tables. |
| Cessation | `management_inventory_controls`, obligation checking, durable audit, public/inventory exclusion and SQL guards; migration `20261110_02_management_cessation.sql`. |
| Complimentary | `comp_type`/`comp_expires_at` on the billing account, not individual property grants. Grace is also account-level. D4 therefore inherits the same account expiry without copying or extending it. |

The unit schema is explicitly two-level today: non-null `property_units.propertyid` references `properties`; agreements and other domain records also carry separate property/unit identities. Generic parent/type nullable metadata can be added for forward compatibility, but changing current authority to room/bed nesting is not a small additive change. Under handoff 2.5, report this cost and retain deliberate nested-split rejection; do not rebuild the rental schema or introduce hostel support.

## Stripe side-effect call sites

All paths below are under `src/api/managementBilling/`; reads used to prove effects are described separately. No live key is used.

| Caller | Provider operation | Local write / recovery boundary |
| --- | --- | --- |
| `service.js:checkout` | POST `/v1/customers` | Saves customer binding inside command transaction; remote success followed by rollback can lose the local reference. |
| `service.js:checkout` | POST `/v1/checkout/sessions` | Saves reviewed inventory and completed session result; paid subscription binding/promotion later follows verified readback. |
| `service.js:portal` | POST `/v1/billing_portal/sessions` | Saves hosted-session result; validates disabled subscription mutation controls first. Expired hosted URLs require type-specific recovery. |
| `service.js:cancelLocked` | POST `/v1/subscription_schedules/{id}/release` | Clears pending quantity, then sets cancellation. Separate named durable steps are needed for response loss between writes. |
| `service.js:cancelLocked` | POST `/v1/subscriptions/{id}` | Sets/resumes period-end cancellation, reads provider state before committing result. Used by explicit cancellation and zero-stock/cessation. |
| `service.js:quantityPreview` | POST `/v1/invoices/create_preview` | Stores preview, inventory hash, expiry and proration date as completed command. This POST is a preview, not a payment. |
| `service.js:applyQuantityLocked` | POST `/v1/subscription_schedules` | Creates schedule from bound subscription; schedule ID currently relies on later provider readback after rollback. |
| `service.js:applyQuantityLocked` | POST `/v1/subscription_schedules/{id}` | Writes current/next phases, reads them back, then commits inventory/pending quantity and optional staged promotion. |
| `service.js:applyQuantityLocked` | POST `/v1/subscriptions/{id}` | Increases quantity with `create_prorations`, fixed reviewed proration date, then reads back and promotes exact staged snapshot. |
| `router.js:publish-sandbox` | POST `/v1/prices` | Publication has a pricing-scoped SQL lock and stable key but is outside the tenant command journal. Saves published version and audit after provider verification. Requires its own journal migration decision; do not omit from the write inventory. |

`stripe.js:request` refuses every non-GET without an idempotency key. Existing keys are `quixo:{tenantId}:{commandId}` with stable `:customer`, `:checkout`, `:release`, `:zero-stock`, `:schedule`, `:phases`, and `:increase` suffixes; price publication uses `quixo:pricing:{versionId}`. Preserve legacy keys on retry: renaming the key of an unfinished operation could duplicate its side effect. New operations may use persisted operation/step keys. There is no timestamp/random retry key.

`reconcileLocked` reads Checkout sessions, subscription, invoice and all invoice lines, projects payment/grace, and may promote paid-confirmed staged inventory. `refresh` and webhooks invoke it. `reconcileCancellation` adds bound readback-only completion for interrupted period-end and zero-stock cancellation, including older commands. `beginCommand` blocks pending ordinary retries after 23 hours. Equality of quantity alone does not prove an old proration or schedule write; unresolved historical operations must go to review rather than be replayed with a fresh key.

## Cessation, restoration and split discovery

Existing cessation is end-to-end in `service.js:cessationPreview/ceaseStock`, `store.js:cessationPreviewLocked/ceaseStockLocked`, the subscription UI/API and database guards. It checks tenancy, invoices/payments/deposits/settlements, maintenance and holds under locks. The local ceased record and billing/audit commit together. Provider timeout can leave an external effect with rolled-back local state, owned by the pending command.

| Current entitlement/state | Cessation now | Restore now | Existing standalone split now |
| --- | --- | --- | --- |
| Paid active | Allowed if obligations closed; renewal-only reduction / final period-end cancellation | Missing | Explicit rejection |
| Paid ending | Allowed if obligations closed; retain scheduled cancellation | Missing | Explicit rejection |
| Complimentary | Rejected by active/ending gate | Missing | Explicit rejection |
| Past due in grace | Rejected by active/ending gate | Missing | Explicit rejection |
| Trial, incomplete, unpaid/expired, cancelled | Rejected; some provider shapes can fail projection before entitlement check | Missing | Explicit rejection |

`store.js:inventory` refuses the first prepared unit under an existing whole dwelling (`BILLING_STOCK_PARENT`). New building+unit batches and additions to existing multi-unit properties work. No restore or split operation endpoint/runner is implemented. Existing zero-stock cancellation is implemented and tested; the new framework must preserve it rather than introduce quantity zero.

Recommended D-default mapping: D1 retain aggregate dwelling quantity; D2 split difference at renewal with no immediate charge; D3 restore from restoration time without backdating, preserving already-paid capacity; D4 same organization grace/complimentary expiry; D5 retain parent rental/history and deny overlapping new occupation; D6 explicit reactivation-required outcome without automatic purchase for cancelled subscriptions; D7 injectable application clock with database-authority exception above; D8 metadata/hash audit with no new deletion job, while retaining existing protected signed/audit PDFs. D8 must not delete document bodies already required by accepted archive behavior.

## Flags, jobs and tests

`MANAGEMENT_BILLING_SANDBOX_ENABLED` plus a test-key prefix and the exact approved sandbox account gate every Stripe request in `stripe.js`. Live objects are rejected. `MANAGEMENT_BILLING_SCHEMA_READY` gates routes; `MANAGEMENT_INVENTORY_SCHEMA_READY` and `MANAGEMENT_CESSATION_SCHEMA_READY` gate those features. Enforcement requires both `MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED` and explicit tenant IDs. Responses report `liveChargingEnabled:false`; there is no generic launch switch that this work should enable. All existing rollout controls remain unchanged.

There is no management-subscription reconciler scheduler wired in `server.js`. The existing automatic monthly billing scheduler generates rental invoices and must not be repurposed. A new recovery scheduler must default off, support a truly read-only dry-run (no claims, timestamps, provider POSTs or audit writes), bounded exponential retry, durable fencing, capped attempts and an observable review/alert outcome. A safe rollback disables the worker but retains journal/step/claim evidence and guarded inventory; it does not drop new tables with live work.

Existing validation: `tests/management-billing.test.js` supplies fake store/Stripe transport; `scripts/test-management-billing-sql.mjs` supplies real disposable SQL with fake provider transport, response-loss/rollback/concurrent-lock cases; billing browser fixtures exercise actual routes/UI using controlled transport. They are not genuine recurring-event evidence. Clock defaults currently occur in contract, provider projection/history and service/store; SQL time is used for transactional authorization and persisted dates. No new tests were run in this read-only discovery stage. Prior release proof remains in the canonical ledger; it does not certify proposed work.

## Evia discovery and boundary

Existing implementation: `src/api/evia/completedDocuments.js` exchanges a service API key at `/oauth/exchange`, lists `/requests/{id}/documents`, follows validated opaque download URLs, and permits one token-refresh retry. `completedPackage.js` (where referenced by the existing package integration), `webhook.js`, `completionEvidence.js`, `auditRecovery.js`, `archiveCoordinator.js`, `archiveLease.js` and `auditTrailAccess.js` own package completion, protected retention, publication and access. Existing archive coordination uses `webhook_events` identities and attempt/publication evidence; reuse it rather than conflate a technical retrieval audit with the provider's signed audit PDF.

Local `src/docs/evia-sign-api-docs.md` documents completion callbacks with optional inline documents; `docs/EVIA-PUBLIC-DOCUMENTATION-REFERENCE.md` records earlier provider documentation and the missing supported reissue/redelivery contract. These are dated references, not fresh sandbox proof. Service/package retrieval is not reproduced successfully in this discovery. Its exact 404/501 cause remains unestablished: do not claim authentication versus endpoint versus parsing without current provider evidence. Fresh documentation/sandbox confirmation is mandatory before endpoint changes. Accepted signing must remain accepted even when matching audit evidence is pending. Metadata/hash logs must exclude document bodies, credentials and personal payloads.

## Proposed first implementation after conflict resolution

1. Extend commands with nullable recovery metadata and a linked durable step journal; migrate cancellation first while preserving legacy keys/status/result contracts and current paid behavior.
2. Add account-aware invariant inspection with documented scheduled/cancellation/complimentary states; no writes.
3. Add disabled worker, fencing, bounded attempts, dry-run and process-interruption harness. Record per-operation forward/compensation rules and fail to review when provider evidence is insufficient.
4. Add executable cessation matrix, then split and restore operation types. Keep all original paid tests unchanged and add transition sequences.
5. Add application-clock/replay harness under the database-time exception. Clearly distinguish synthetic scenarios from captured genuine sandbox events.
6. Independently confirm Evia's supported service/package contract, then implement only proven retrieval/audit changes.

No workstream acceptance box is closed by this report. New migrations/reconciler will not run against production. Rental QA, legal/commercial publication, R2, replica scaling, Brunei and launch/live charging remain outside this handoff.
