# Phase 4 closure-readiness review — 2026-10-09

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

**Contract/inventory slice first; no runtime change.** Map the migration executor entry points and `exec_sql` references, distinguish privileged operational tooling from app/UI callers, and write a supported migration-authority decision with tests and clear non-goals. Do not remove `runMigration.js`, `SqlMigration.jsx` or any DB tool on the basis of grep hits alone. Subsequent PRs can separately target verified dead tooling or one API fallback at a time.
