# Production database migration executor

## Last verified pending plan — 11 November 2026 documentation update

[Production plan 42858116430](https://github.com/WasanthaK/khrental/actions/runs/42858116430), attempt 2, passed on 10 November against Ready **0000483**, exact serving source `b3dd9d0304f9f46d5ee2780436466a25ef4090c3`. It reported `20261110_01_management_inventory_staging` and `20261110_02_management_cessation` as **PENDING** and ended with “Plan completed without modifying the database.” The first attempt refused a preceding runtime during deployment; the retry remained plan-only.

The managed manifest currently contains **20** migrations. Disposable SQL CI verifies staging/cessation schema, rerun behavior and exact enabled cessation trigger definitions. That proof does not mean either new production migration was applied. Keep `MANAGEMENT_INVENTORY_SCHEMA_READY`, `MANAGEMENT_CESSATION_SCHEMA_READY` and full enforcement rollout OFF until their applicable prerequisites and controlled acceptance are satisfied. A docs commit or plan-mode retry is not permission to apply or enable them.

For a future authorized apply: use the reviewed target and dedicated authority below, verify ledger/checksums afterward, and validate runtime readiness separately. Retain stock/command/audit history. Do not change the runtime identity's grants, manufacture a successful plan, or roll back additive schema merely to undo a source release. See the [task ledger](R5-LIFECYCLE-ACCEPTANCE-20261105.md) for remaining rollout work.

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
