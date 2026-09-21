import { runQuery, runSingleQuery } from '../src/api/mssql/query.js';
import { closeMssqlPool } from '../src/api/mssql/pool.js';

const PLATFORM_OWNER_EMAIL = 'wweerakoone@gmail.com';

const main = async () => {
  const tableState = await runSingleQuery(`
    SELECT CASE WHEN OBJECT_ID(N'dbo.platform_admins', N'U') IS NULL THEN 0 ELSE 1 END AS exists_value;
  `);

  if (!tableState?.exists_value) {
    console.error('PLATFORM_ADMIN_TABLE_MISSING');
    process.exitCode = 3;
    return;
  }

  const appUser = await runSingleQuery(`
    SELECT TOP 1 id
    FROM dbo.app_users
    WHERE LOWER(LTRIM(RTRIM(email))) = LOWER(@email);
  `, { email: PLATFORM_OWNER_EMAIL });

  if (!appUser?.id) {
    console.error('PLATFORM_ADMIN_USER_NOT_FOUND');
    process.exitCode = 2;
    return;
  }

  const existing = await runSingleQuery(`
    SELECT TOP 1 id, status
    FROM dbo.platform_admins
    WHERE app_user_id = @appUserId;
  `, { appUserId: appUser.id });

  if (existing?.id) {
    await runQuery(`
      UPDATE dbo.platform_admins
      SET status = N'active', updatedat = SYSUTCDATETIME()
      WHERE id = @id;
    `, { id: existing.id });
    console.log('Platform administrator registry entry reactivated.');
  } else {
    await runQuery(`
      INSERT INTO dbo.platform_admins (app_user_id, status)
      VALUES (@appUserId, N'active');
    `, { appUserId: appUser.id });
    console.log('Platform administrator registry entry created.');
  }

  const verified = await runSingleQuery(`
    SELECT TOP 1 id
    FROM dbo.platform_admins
    WHERE app_user_id = @appUserId
      AND LOWER(COALESCE(status, N'active')) = N'active';
  `, { appUserId: appUser.id });

  if (!verified?.id) {
    throw new Error('Platform administrator verification failed after repair.');
  }

  console.log('PLATFORM_ADMIN_BOOTSTRAP_OK');
};

main()
  .catch((error) => {
    console.error(`PLATFORM_ADMIN_BOOTSTRAP_FAILED: ${error?.message || error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMssqlPool().catch(() => {});
  });
