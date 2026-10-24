// Canonical R3 B04 one-shot, read-only permission evidence under the serving
// application principal. Never prints identity, config, SQL text or credentials.
// Do not add DELETE to the app principal solely to make a synthetic test pass.
import { closeMssqlPool, getMssqlPool } from '../src/api/mssql/pool.js';

const run = async () => {
  if (process.env.NODE_ENV !== 'production' ||
      process.env.PUBLIC_SIGNUP_ENABLED !== 'false' ||
      process.env.PUBLIC_SIGNUP_PILOT_APPROVED !== 'false') {
    throw Error('R3_READONLY_BLOCKED: expected production signup OFF');
  }
  const pool = await getMssqlPool();
  const result = await pool.request().query(`
    SELECT
      HAS_PERMS_BY_NAME(N'dbo.public_signup_rate_limits', N'OBJECT', N'SELECT') AS can_select,
      HAS_PERMS_BY_NAME(N'dbo.public_signup_rate_limits', N'OBJECT', N'INSERT') AS can_insert,
      HAS_PERMS_BY_NAME(N'dbo.public_signup_rate_limits', N'OBJECT', N'UPDATE') AS can_update,
      HAS_PERMS_BY_NAME(N'dbo.public_signup_rate_limits', N'OBJECT', N'DELETE') AS can_delete,
      CASE WHEN OBJECT_ID(N'dbo.public_signup_rate_limits', N'U') IS NOT NULL THEN 1 ELSE 0 END AS table_exists;
  `);
  const row = result.recordset?.[0];
  if (!row || row.table_exists !== 1) throw Error('R3_READONLY_BLOCKED: signup rate limit table missing or invisible');
  const bit = v => v === 1 ? 'yes' : v === 0 ? 'no' : 'unknown';
  console.log('R3_SQL_PERMISSION_READONLY table=present select=' +
    bit(row.can_select) + ' insert=' + bit(row.can_insert) +
    ' update=' + bit(row.can_update) + ' delete=' + bit(row.can_delete));
  if ([row.can_select,row.can_insert,row.can_update].every(x => x === 1)) {
    console.log('R3_SQL_RUNTIME_MINIMUM_PERMISSIONS=PASS');
  } else {
    console.log('R3_SQL_RUNTIME_MINIMUM_PERMISSIONS=BLOCKED');
    process.exitCode = 2;
  }
  console.log('R3_SQL_READONLY_DIAGNOSTIC_NO_DATA_MUTATION=PASS');
};
run().catch(() => {
  console.error('R3_SQL_PERMISSION_READONLY=BLOCKED_UNKNOWN');
  process.exitCode = 1;
}).finally(async () => {
  try { await closeMssqlPool(); } catch { process.exitCode = 1; }
});
