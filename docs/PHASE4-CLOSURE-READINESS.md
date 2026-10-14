# Phase 4 closure-readiness review — 2026-10-14

## Decision

**NOT READY TO CLOSE.** The bounded dead-code removals merged in PRs #208–#214, but active compatibility consumers remain. A green PR-head build or an operator-reported production deployment does not independently establish exact Azure serving SHA, MSSQL readiness, or end-to-end behavior. Do not claim Phase 4 completed or start an indiscriminate repository-wide deletion.

This is an evidence inventory, not a full runtime call-graph proof. Paths below were inspected on `main` with targeted GitHub code search and source reads. Complete consumer/route and operator workflows must be traced before any live-code removal.

## Completed code merges and production evidence ledger

| PR | Removed slice | Merge SHA | PR-head CI evidence | Production |
| --- | --- | --- | --- | --- |
| #208 | dead `databaseUtils` SQL RPC compatibility | `10673672531621b6273bac3938e96ab9e82d0c66` | Workflow #590 operator-reported green (production run) | operator reported green; Ready revision/SHA/MSSQL proof not independently captured |
| #209 | unused `databaseService.js` facade | `14f57e3fb0d7681d65a6badd5a6760ba6475f143` | #591 / `37882986704` succeeded | operator reported green; independent proof pending |
| #210 | dead `dataUtils.fetchData` | `4f84a1fe0275b81dd219b7ce1b0037d19b5e0aaa` | #593 / `37884803418` succeeded | operator reported green; independent proof pending |
| #211 | obsolete PostgreSQL timestamp RPC script | `fd3fd0cafc7d223a932aab6c1eeb79cf7b87591a` | #596 / `37886032242` succeeded | operator reported green; independent proof pending |
| #212 | obsolete PostgreSQL setup RPC script | `10e9aa57eef1b64d6bbce44178bee2d519d0de9d` | #598 / `37887222838` succeeded | operator reported green; independent proof pending |
| #213 | obsolete PostgreSQL notifications-table recreation script | `0c97a31347aa2b7ddb76705c7b18f36830316c91` | #600 / `37891045911` succeeded | operator reported green; independent proof pending |
| #214 | unused config `platformClient` forwarding shim | `662f274445194ef7d37568bf4b90ee2904b2581b` | #602 / `37894412141` succeeded | operator reported green; independent proof pending |

PR-head verify workflows are not themselves production deployments. Capture the main-push run's Ready revision, effective serving SHA/public fingerprint, startup/runtime configuration, MSSQL health, and any acceptance notes. Where production has advanced beyond an older SHA, prefer retained historical deployment artifacts rather than expecting older commits to remain live.

## Reconciled October 14 production evidence and remaining decisions

The earlier ledger was a historical snapshot. The following **newer**
independently checked main deployments have Azure Ready revisions, exact
public served SHA and live MSSQL health (not just operator-reported green):

| PR | Control advanced | Main merge SHA | Ready revision | Deployment run |
| --- | --- | --- | --- | --- |
| #275 | App-user lookup authority | `2938d0b` | `0000278` | `38527419662` |
| #276 | Privileged migration runbook separation | `71822a5` | `0000279` | `38529134988` |
| #277 | Notification persistence truth | `cc256a5` | `0000280` | `38530294899` |
| #278 | Maintenance authorized detail projections | `f3ca25a` | `0000281` | `38600664385` |
| #279 | Maintenance images + notification tenant isolation batch | `92bebbd` | `0000282` | `38603644212` |

Those successful deployments do not by themselves demonstrate authenticated
cross-tenant UI coverage for all maintenance/notification workflows or prove
that a privileged production DB migration executor is operational.

### Remaining Phase 4 exit decisions, bundled into larger packages

1. **Security and lifecycle contract acceptance:** Reconcile the verified
   app-user/invitation, invoice, agreement signature, utility review and
   maintenance boundaries with a concrete real-SQL and routed-browser
   acceptance checklist. Fail-closed responses must not be misreported as
   successful business operations.
2. **Legacy compatibility inventory:** Classify remaining live, legacy-needed,
   dead and unresolved references by exported operation and caller. Only
   retire proven dead operations. Existing `platformClient` remains a
   supported compatibility transport in specifically identified flows.
3. **Migration authority:** Static separation of serving DDL and governed
   plan/apply is verified, but privileged executor provisioning and
   `schema_migrations` ledger reconciliation remain operational work.
   No automatic or browser-initiated production DDL.
4. **Release decision:** Mark every unresolved high-risk item fixed or
   explicitly blocked. Any noncritical accepted deferral needs an owner,
   an operational control and a Phase 5 follow-on. Phase 5 is not permission
   to waive tenant boundaries, payment authority or signature retention.
5. **CI/deployment efficiency:** Consolidate related changes into larger
   contracts, retain exact-head tests, and skip Azure deployment for changes
   only affecting docs, tests or workflow definitions.

Status remains **NOT READY TO CLOSE** pending the remaining high-risk contract
acceptance and sign-off. This document is not an approval to start Phase 5.

## Live compatibility inventory: do not remove without contract parity

| Priority | Path / domain | Observed evidence | Prerequisite |
| --- | --- | --- | --- |
| P0 | `src/db/runMigration.js`; `src/components/admin/SqlMigration.jsx` | `runMigration.js` still calls `platformClient.rpc('exec_sql')`; the admin UI also attempts `exec_sql`. In contrast, `src/db/executeSql.js` uses a direct MSSQL pool. `package.json` exposes both `migrate` and `execute-sql` commands. | Establish supported privileged migration authority, exact operators/callers, execution guardrails, ledger and rollback semantics; never move DDL into app startup or an unprivileged browser. |
| P1 | `src/services/invoiceService.js` and invoice UI | Both MSSQL API branches and compatibility data reads/writes exist, including invoice creation/update and property/user lookups. | Trace each live action, preserve tenant authorization, billing totals/status, receipts, tests and API contract; migrate per endpoint, not per filename. |
| P1 | `src/services/agreementService.js` and agreement templates | MSSQL endpoints coexist with compatibility reads/writes for agreement, property, units and templates. | Verify signing, template CRUD, state transitions, retained documents and tenant isolation before replacing fallbacks. |
| P1 | `src/services/appUserRepository.js` and auth paths | MSSQL app-user APIs coexist with compatibility paths; `platformClientCore.js` exposes active auth and table-access functions. | Preserve invitation/password reset/session/role boundaries and tenant identity integrity; require dedicated security regression proofs. |
| P1 | `src/services/utilityBillingService.js` and maintenance/notification paths | Many compatibility table/RPC operations remain; `notificationService.js`, `maintenanceLifecycleService.js` and property UI still use platform-client operations. | Prove tenancy-scoped lifecycle, billing and maintenance parity; avoid broad rewrites. |
| P2 | Legacy scripts and tooling | Remaining `exec_sql` references include `create_exec_sql_function.js`, `standardizeTimestampColumns.js`, `setupAgreementSignature.js`, property-association and timestamp utilities. Some are named by package scripts. | Inventory package commands, workflows, manual runbooks and operator dependencies before considering individual script retirement. |

### Important architecture distinction

`platformClient` itself is not intrinsically dead: `src/services/platformClient.js` and `src/services/platformClientCore.js` are active compatibility surfaces. The previous removals targeted unused wrappers and scripts, not wholesale retirement of this client.

## Closure gates

1. Build a verified import/call-site/route matrix for all remaining active compatibility operations, including dynamic imports and operational scripts; classify **live / legacy-but-needed / dead**.
2. For each live operation intended for removal, demonstrate explicit MSSQL API contract parity, tenant authorization, rollback or migration plan, regression tests and browser/workflow acceptance.
3. Resolve or explicitly park privileged migration executor discrepancies, especially `migrate` versus `execute-sql`, without changing production DDL paths casually.
4. Preserve external agreement signing, tenant/rentee identities, rent invoices and utilities, maintenance, notifications and document storage throughout.
5. Collect exact-SHA production deployment evidence for the merged slices or document a bounded retrospective evidence waiver; do not recast operator-reported green as independently verified proof.
6. Only declare Phase 4 complete after the scoped inventory is discharged and core regression gates pass. Phase 5 remains the focused product regression/release-hardening phase, not a replacement for unresolved high-risk compatibility work.

## Next bounded item

**Consolidated acceptance and closure decision.** Verify maintenance/notification tenant isolation using the disposable two-tenant SQL fixture; reconcile the remaining P1 live contracts and final owned-deferral register. Keep all production DDL execution separate from the serving container. Proceed to Phase 5 only after the documented closure criteria have been discharged or risk-approved.
