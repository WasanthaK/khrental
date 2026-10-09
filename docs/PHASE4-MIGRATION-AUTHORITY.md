# Phase 4 migration entrypoint and authority review — 2026-10-09

## Decision: retain the existing governed production executor

KH Rentals already defines a production migration control plane. Do **not** create another one, and do **not** redirect migration DDL through the serving web container or an interactive browser.

The production authority is described in `docs/PRODUCTION-MIGRATION-EXECUTOR.md`, `docs/production-database-migrations.md`, and `.github/workflows/run-production-db-migrations.yml`:

- Read-only `plan` runs automatically for relevant changes or manually. It can use the serving app's restricted identity for planning only when direct SQL access is unavailable.
- `apply` is manual, requires the GitHub Production environment, `APPLY-PRODUCTION` confirmation, a privileged identity, and a SQL network path.
- Where direct privileged connectivity is unavailable, `khrental-db-migrator` is a dedicated Azure Container Apps manual job with a distinct managed identity; the workflow checks its resting read-only entrypoint before starting apply.
- The managed migration runner maintains a checksum-bound `dbo.schema_migrations` ledger. Application startup must not execute DDL.

**This is the documented, implemented workflow contract, not proof that the job is currently provisioned, privileged, or able to apply in production.** Those must be checked in Azure and the ledger before any actual schema write.

## Legacy entrypoints still present — do not treat as equivalent

| Entry point | Current behavior from source | Disposition |
| --- | --- | --- |
| `scripts/run-production-migrations.mjs` plus `.github/workflows/run-production-db-migrations.yml` | Governed production plan/apply, separate executor when necessary, ledger and strict confirmations | **Canonical for production**; preserve |
| `src/db/executeSql.js` / package command `execute-sql` and named `migrate:*:mssql` scripts | Direct MSSQL connection; executes specified SQL file without the production workflow's ledger/approval wrapper | Retain for now; classify as operational/manual tooling and establish caller/usage controls |
| `src/db/runMigration.js` / package command `migrate` | Reads every `.sql` in a directory and calls `platformClient.rpc('exec_sql')`; no managed migration ledger in this file | **Legacy candidate**, not production authority. Audit runbooks and callers before disabling/removing |
| `src/components/admin/SqlMigration.jsx` | Browser component containing PostgreSQL function DDL; attempts `exec_sql` RPC and an `_ExecSQL` fallback | **Potential browser DDL hazard**. Determine whether routed/rendered or reachable; do not expose arbitrary SQL execution to browser users |
| Other `src/scripts/*.js` referencing `exec_sql` | Historical setup/repair and one-off tooling, some with package commands | Classify individually; no mass removal |

## Safety controls for the next bounded change

1. Trace `SqlMigration.jsx` route imports/rendering, including dynamic imports, navigation and deployment artifacts. If truly unreachable, propose a narrow removal with a regression guard. If reachable, first disable browser SQL execution in a bounded security fix with authorization and regression tests.
2. Trace `npm run migrate` and `src/db/runMigration.js` references in workflows, deployment scripts and operator runbooks. Preserve any needed migration functionality by mapping it to the governed production workflow before retiring the compatibility executor.
3. Never execute SQL, change grants, open SQL firewalls, or invoke `apply` as part of this audit.
4. Verify the dedicated job's real provisioning and database grant status separately using read-only evidence. Do not infer operational readiness from code and documentation.
5. Keep Phase 4 open until live invoice/agreement/auth/utility compatibility and production acceptance gates in `docs/PHASE4-CLOSURE-READINESS.md` are discharged.

## Recommended next development slice

**Inspect-only** route/caller census for `SqlMigration.jsx` and `runMigration.js`; document exact production and operator dependencies. Then choose a single security-preserving deletion or containment PR with regression tests. Phase 5 remains downstream of closure criteria.
