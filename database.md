# KH Rentals Data Architecture

KH Rentals production data is stored in **Azure SQL Database**. This document describes the current persistence model and points to the executable SQL Server migrations that are the source of truth.

## Production stores

### Azure SQL Database

Azure SQL stores application and authentication data, including:

- `tenants`
- `app_users` — global person identity; email is globally unique
- `tenant_memberships` — organization membership, role, status and permission bundle
- `platform_admins` — platform-level administrators
- `auth_users`, `auth_sessions`, invitation and password-reset records
- properties and property units
- agreements and agreement templates
- invoices, payments and billing adjustments
- maintenance and utility records
- tenant settings and other operational application tables

The browser must not connect to the database directly. All database access goes through the KH Rentals API.

## Identity and organization model

`app_users` represents a global person identity. Organization access is represented by `tenant_memberships`.

A single person can therefore have different relationships with different organizations without duplicating their global identity. For example, the same email may be an administrator in one organization and a renter or staff member in another.

For compatibility with older data, `app_users.tenant_id`, `app_users.role`, and `app_users.user_type` still exist. New organization-aware workflows should treat active `tenant_memberships` as authoritative.

Canonical onboarding routes include:

- renter: `POST /api/mssql/rentees`
- team member: `POST /api/mssql/team-members`
- tenant administrator: platform-admin tenant-administrator endpoint

These routes use create-or-attach semantics so an existing global identity is reused instead of inserted again.

## Authentication

KH Rentals uses the local MSSQL-backed authentication service exposed through `/api/platform/auth/*`. Authentication credentials and sessions are stored in Azure SQL.

The `auth_id` field on `app_users` links the application identity to its authentication identity. It is not a reference to an external authentication provider.

## File storage

Production files are stored in **Cloudflare R2** when `STORAGE_DRIVER=r2`.

The application exposes logical buckets such as `images`, `files`, `documents`, `invoices`, `media`, and `maintenance`. Tenant isolation is enforced by the KH Rentals storage API and tenant-scoped object paths. Provider credentials remain server-side.

Local development may use the local storage driver.

## SQL Server migrations

Current production migrations live in the repository-level `migrations/` directory and are executed with:

```bash
npm run execute-sql -- ./migrations/<migration>.sql
```

For a fresh Azure SQL database, begin with:

```bash
npm run migrate:fresh:mssql
```

Do not run the older PostgreSQL migration history under `src/db/migrations/` against Azure SQL. Those files are retained only where they still document historical schema evolution and are not the production migration source of truth.

## Health verification

The production deployment verifies:

- `/api/health` for application configuration
- `/api/mssql/health` for a live Azure SQL query

The MSSQL health endpoint must succeed before a deployment is considered healthy.
