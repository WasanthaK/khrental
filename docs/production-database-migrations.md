# Production database migrations

KH Rentals production web containers must not run schema DDL during startup. The application identity is intentionally restricted to runtime data access.

Production schema changes use the GitHub Actions workflow:

`Run production database migrations`

Relevant migration changes pushed to `main` automatically run a read-only `plan` through all managed migrations. Production schema writes remain explicit and separately authorized.

## Authentication

The workflow signs in to Azure with the existing GitHub OIDC Production credentials and obtains an Azure SQL access token.

If a dedicated privileged SQL migration identity is used for schema changes, configure the GitHub Production secrets:

- `MSSQL_MIGRATION_USER`
- `MSSQL_MIGRATION_PASSWORD`

These credentials are migration-only credentials. Do not configure them on the KH Rentals web container.

The production database endpoint is resolved from GitHub Production variables/secrets `MSSQL_SERVER` and `MSSQL_DATABASE` when present, otherwise from the existing Container App environment.

## Direct access and read-only planning

The workflow first probes whether the GitHub-hosted runner can both reach and authenticate to production SQL using the configured migration identity.

If direct authenticated SQL access is available, the plan runs on the GitHub runner. If direct access is unavailable because of networking or database authentication, `plan` waits until the Container App is serving the same Git commit and then executes the read-only planner inside that serving Container App revision with the existing restricted runtime managed identity.

This fallback does not open an Azure SQL firewall rule and does not add the GitHub deployment service principal as a database user merely to inspect migration state. Runtime managed identity is accepted by the migration runner only for `plan`; it is explicitly rejected for `apply`.

## Applying schema changes

`apply` remains manual and requires:

1. `mode = apply`
2. the desired `through` target
3. confirmation text `APPLY-PRODUCTION`
4. a dedicated privileged migration identity with the required DDL permissions
5. a migration executor that has a production SQL network path

If the GitHub-hosted runner does not have authenticated privileged SQL access, the workflow refuses to open a firewall rule or reuse the web identity for DDL. The intended apply architecture is a dedicated privileged migration executor inside the production network.

Migrations are selected in repository order. Choosing a specific `through` target includes every earlier migration in the manifest.

## Migration ledger

Successful applied migrations are recorded in `dbo.schema_migrations` with:

- migration ID
- SHA-256 checksum
- application timestamp
- GitHub actor
- source commit SHA

If an already-applied migration file changes later, the runner fails on the checksum mismatch instead of silently reapplying modified SQL.

A read-only plan can inspect an existing ledger but never creates it.

## Current managed migrations

1. `20260920_01_add_tenancy_billing_adjustments`
2. `20260920_02_create_platform_admins`
3. `20260920_03_backfill_legacy_app_user_memberships`

Each migration is verified after execution before it is written to the ledger.

## Deployment separation

The normal `Build and deploy KH Rentals container` workflow never executes database migrations during web-container startup. A failed migration therefore cannot prevent the currently healthy web revision from starting or serving traffic.

The automatic migration plan may wait for the matching application commit to become the serving revision, but the plan itself performs no schema mutation.
