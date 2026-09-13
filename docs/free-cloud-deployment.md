# Free-cloud deployment

KH Rentals can run within the free allowances of Azure Container Apps, Azure SQL Database, GitHub Actions/Packages, and Cloudflare R2. Free allowances are usage-limited; configure Azure cost alerts before production use.

## Runtime architecture

- One Azure Container App running the repository Docker image on port `5174`
- One Azure SQL Database for application data, auth users, and bearer sessions
- One private Cloudflare R2 bucket; the app maps logical buckets such as `images` and `documents` to prefixes
- GitHub Actions builds, verifies, publishes to GHCR, and updates the Container App

The container is stateless when `STORAGE_DRIVER=r2`. Run a single replica until that setting and the MSSQL auth migration are verified.

## 1. Database

Create an Azure SQL free-offer database and select the option that pauses or blocks usage when its free allowance is exhausted.

For a new, empty Azure SQL database, apply the fresh-install schema first:

```bash
npm run execute-sql -- ./migrations/20260913_00_create_fresh_mssql_schema.sql
```

The fresh-install migration creates the SQL Server versions of the application tables and a default `KH Rentals` tenant. Do not run the older PostgreSQL/Supabase migrations against Azure SQL.

Then apply the authentication schema:

```bash
npm run execute-sql -- ./migrations/20260913_01_create_auth_store.sql
```

The API also creates these two auth tables on first use if the deployment identity has DDL permission. Applying the migration explicitly is preferred so the runtime login can use normal data permissions afterward.

If `.local-auth-store.json` contains real users, run this once before removing the file:

```bash
npm run migrate:auth:legacy -- /path/to/.local-auth-store.json
```

Legacy SHA-256 password hashes are upgraded to salted scrypt after each user's next successful sign-in.

## 2. R2

Create one private R2 bucket and an API token limited to object read/write for that bucket. Configure these Container App secrets/environment variables:

```text
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_BUCKET=<physical-r2-bucket>
R2_ACCESS_KEY_ID=<r2-access-key-id>
R2_SECRET_ACCESS_KEY=<r2-secret-access-key>
STORAGE_BUCKETS=images,files,documents,invoices,media,maintenance
```

Do not expose any R2 credential as a `VITE_` variable. Stored objects remain private in R2 and are delivered through the application `/storage` route.

For local development, omit the R2 settings and use `STORAGE_DRIVER=local`.

## 3. Automated Azure bootstrap

The repository includes an idempotent bootstrap script that creates the
Consumption Container Apps environment and application shell, enables its
system-assigned identity, and creates a narrowly scoped user-assigned managed
identity for GitHub OIDC deployment. It does not modify or recreate the existing
Azure SQL database.

Run it from Azure Cloud Shell while signed in to the `Kubeira Rentals`
subscription:

```bash
curl -fsSL https://raw.githubusercontent.com/WasanthaK/khrental/codex/free-cloud-production/scripts/bootstrap-azure.sh | bash
```

The script prints three GitHub environment secrets. The resource group and app
name are fixed in the workflow for this deployment. It also prints the SQL
statements needed to grant the new Container App managed identity access to
`khrentalsdb`.

The bootstrap initially uses Microsoft's public hello-world image and local
ephemeral storage. This lets the shell be created before the KH Rentals GHCR
package exists. Do not upload production documents until R2 is configured.

## 4. Container App configuration

Create a consumption-plan Container Apps environment and one Container App with external ingress targeting port `5174`. Configure at least:

```text
NODE_ENV=production
PORT=5174
MSSQL_SERVER=<server>.database.windows.net
MSSQL_DATABASE=<database>
MSSQL_AUTHENTICATION=managed-identity
MSSQL_ENCRYPT=true
MSSQL_TRUST_SERVER_CERTIFICATE=false
AUTH_SESSION_TTL_DAYS=30
CORS_ORIGINS=https://khrentals.kubeira.com
VITE_API_ENDPOINT=
VITE_ENABLE_DEV_BYPASS=false
```

Enable the Container App's system-assigned managed identity. As the Azure SQL
Microsoft Entra administrator, create a contained database user for that identity
and grant only the application roles it requires:

```sql
CREATE USER [<container-app-name>] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [<container-app-name>];
ALTER ROLE db_datawriter ADD MEMBER [<container-app-name>];
```

The application uses Tedious `azure-active-directory-default` authentication, so
no database username or password is stored in Container Apps.

Keep SendGrid and Evia credentials server-side (`TWILIO_SENDGRID_API_KEY`, `EVIA_SIGN_CLIENT_ID`, and `EVIA_SIGN_CLIENT_SECRET`).

Set minimum replicas to `0` for the lowest idle cost. The first request after idle may be slower. Set maximum replicas to `1` until the R2 and auth migrations are validated; it can then safely scale out.

## 5. GitHub configuration

Create GitHub environment `Production`. Add these environment secrets:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

The workflow is scoped to resource group `khrental-prod-rg` and Container App
`khrental-app`.

Configure Azure workload identity federation for this repository and the `Production` environment. The Azure identity only needs permission to update the target Container App.

The workflow publishes `ghcr.io/wasanthak/khrental`. Make that GHCR package public, or separately configure the Container App with a durable read-only GHCR credential. A temporary GitHub Actions token must not be stored as the Container App registry credential.

## 6. Domain and verification

After the first healthy deployment, add `khrentals.kubeira.com` as the Container App custom domain, create the requested DNS records, and bind the managed certificate.

Verify:

1. `/api/health` reports a configured encrypted MSSQL connection.
2. Sign-up/sign-in creates rows in `auth_users` and `auth_sessions`.
3. API requests without a bearer session are rejected.
4. Upload, list, open, and delete work for one file in R2.
5. A second tenant cannot address the first tenant's storage prefix.
6. Container restart does not lose the session or uploaded object.
