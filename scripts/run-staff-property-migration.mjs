import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const hydrateEnvironmentFromPidOne = () => {
  try {
    const rawEnvironment = fs.readFileSync('/proc/1/environ');
    for (const entry of rawEnvironment.toString('utf8').split('\0')) {
      const separator = entry.indexOf('=');
      if (separator > 0) {
        process.env[entry.slice(0, separator)] = entry.slice(separator + 1);
      }
    }
  } catch (error) {
    console.warn(`Unable to hydrate environment from PID 1: ${error.message}`);
  }
};

const main = async () => {
  hydrateEnvironmentFromPidOne();

  const migrationPath = process.argv[2] || '/tmp/staff-property-assignments.sql';
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }

  const poolModulePath = process.env.KH_MSSQL_POOL_MODULE || '/app/src/api/mssql/pool.js';
  const { closeMssqlPool, getMssqlPool } = await import(pathToFileURL(poolModulePath).href);
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const pool = await getMssqlPool();

  try {
    await pool.request().batch(migrationSql);

    const verification = await pool.request().query(`
      SELECT
        CASE WHEN OBJECT_ID(N'dbo.staff_property_assignments', N'U') IS NULL THEN 0 ELSE 1 END AS table_exists,
        CASE WHEN OBJECT_ID(N'dbo.staff_property_assignments', N'U') IS NULL THEN 0
             ELSE (SELECT COUNT(*) FROM dbo.staff_property_assignments) END AS assignment_count;
    `);

    const row = verification.recordset?.[0];
    if (!row || Number(row.table_exists) !== 1) {
      throw new Error('staff_property_assignments was not created or could not be verified.');
    }

    console.log(`KH_MIGRATION_OK assignments=${Number(row.assignment_count) || 0}`);
  } finally {
    await closeMssqlPool();
  }
};

main().catch((error) => {
  console.error('KH_MIGRATION_FAILED', error);
  process.exitCode = 1;
});
