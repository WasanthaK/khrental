# Production database migrations

KH Rentals production web containers must not run schema DDL during startup. The application identity is intentionally restricted to runtime data access.

Production schema changes use the manual GitHub Actions workflow:

`Run production database migrations`

## Authentication

The workflow signs in to Azure with the existing GitHub OIDC Production credentials and obtains an Azure SQL access token. The OIDC service principal must exist as a user in the KH Rentals production database and must have the DDL permissions required by approved migrations.

If Azure OIDC database permissions are not available, the workflow can instead use dedicated GitHub Production secrets:

- `MSSQL_MIGRATION_USER`
- `MSSQL_MIGRATION_PASSWORD`

These credentials are migration-only credentials. Do not configure them on the KH Rentals web container.

The production database endpoint is resolved from GitHub Production variables/secrets `MSSQL_SERVER` and `MSSQL_DATABASE` when present, otherwise from the existing Container App environment.

## Network access

For a GitHub-hosted runner, the workflow temporarily opens one Azure SQL firewall rule for that runner's public IP. The rule is removed in an `always()` cleanup step, including after migration failures.

If the SQL server uses private networking only, move the migration job to a runner inside the production network instead of broadening database network exposure.

## Running a migration

1. Open **Actions** in the repository.
2. Select **Run production database migrations**.
3. First run with `mode = plan` and the desired `through` target.
4. Review the pending/applied list and checksums in the workflow summary.
5. Run again with `mode = apply`.
6. Type `APPLY-PRODUCTION` exactly in the confirmation field.
7. Approve the GitHub `Production` environment gate if one is configured.

Migrations are selected in repository order. Choosing a specific `through` target includes every earlier migration in the manifest.

## Migration ledger

Successful migrations are recorded in `dbo.schema_migrations` with:

- migration ID
- SHA-256 checksum
- application timestamp
- GitHub actor
- source commit SHA

If an already-applied migration file changes later, the runner fails on the checksum mismatch instead of silently reapplying modified SQL.

## Current managed migrations

1. `20260920_01_add_tenancy_billing_adjustments`
2. `20260920_02_create_platform_admins`
3. `20260920_03_backfill_legacy_app_user_memberships`

Each migration is verified after execution before it is written to the ledger.

## Deployment separation

The normal `Build and deploy KH Rentals container` workflow never executes database migrations. A failed database migration therefore cannot prevent the currently healthy web revision from starting or serving traffic.
