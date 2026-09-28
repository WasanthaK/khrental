# Production database migration executor

KH Rentals production schema changes must not run under the serving web application's database identity.

The dedicated executor is an Azure Container Apps **manual job** named `khrental-db-migrator`. It uses the same immutable application image as production but has its own system-assigned managed identity and a fixed migration-only entrypoint.

## Security boundary

- The serving `khrental-app` managed identity remains restricted and cannot apply DDL.
- GitHub-hosted runners do not require direct Azure SQL network access.
- The migration job is manual, has no ingress, and does not serve application traffic.
- Apply requires the GitHub Production environment plus exact `APPLY-PRODUCTION` confirmation.
- The migration runner additionally requires `MSSQL_MIGRATION_DEDICATED_EXECUTOR=true` before managed-identity apply is allowed.
- A migration whose live state is already satisfied is verified and ledgered without replaying its SQL.

## One-time provisioning

Run **Provision production database migration executor** manually with confirmation:

`PROVISION-MIGRATION-EXECUTOR`

The workflow creates the job and prints its managed-identity principal ID. It deliberately does **not** modify Azure SQL permissions.

## One-time Azure SQL grant

An Azure SQL administrator must connect to `khrentalsdb` and create a contained user for the job identity. The identity name is:

`khrental-db-migrator`

Use the following least-privilege database grants:

```sql
CREATE USER [khrental-db-migrator] FROM EXTERNAL PROVIDER;

GRANT CREATE TABLE TO [khrental-db-migrator];
GRANT ALTER ON SCHEMA::dbo TO [khrental-db-migrator];
GRANT SELECT ON SCHEMA::dbo TO [khrental-db-migrator];
GRANT INSERT ON SCHEMA::dbo TO [khrental-db-migrator];
GRANT UPDATE ON SCHEMA::dbo TO [khrental-db-migrator];
GRANT REFERENCES ON SCHEMA::dbo TO [khrental-db-migrator];
```

Do not grant these permissions to the `khrental-app` runtime identity.

If `CREATE USER ... FROM EXTERNAL PROVIDER` cannot resolve the managed identity, stop rather than substituting the web identity or opening the SQL firewall. Confirm the Azure SQL Microsoft Entra administrator and managed-identity directory visibility first.

## Apply

After provisioning and the SQL grant, manually run **Run production database migrations** with:

- mode: `apply`
- through: the reviewed target
- confirmation: `APPLY-PRODUCTION`

The workflow will use direct privileged SQL access only if it is already available. Otherwise it requires the dedicated job and starts it inside the Container Apps environment.

After apply, run plan mode again and require ledger/checksum evidence before treating the migration as complete.
