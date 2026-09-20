import sql from 'mssql';

const requiredEnv = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const createConnectionConfig = () => {
  const server = requiredEnv('MSSQL_SERVER');
  const database = requiredEnv('MSSQL_DATABASE');
  const migrationUser = String(process.env.MSSQL_MIGRATION_USER || '').trim();
  const migrationPassword = String(process.env.MSSQL_MIGRATION_PASSWORD || '').trim();
  const accessToken = String(process.env.MSSQL_ACCESS_TOKEN || '').trim();

  const base = {
    server,
    database,
    port: Number(process.env.MSSQL_PORT || 1433),
    connectionTimeout: 15000,
    requestTimeout: 30000,
    options: {
      encrypt: true,
      trustServerCertificate: false
    },
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 }
  };

  if (migrationUser || migrationPassword) {
    if (!migrationUser || !migrationPassword) {
      throw new Error('Both MSSQL_MIGRATION_USER and MSSQL_MIGRATION_PASSWORD are required when SQL migration credentials are used.');
    }
    return { ...base, user: migrationUser, password: migrationPassword };
  }

  if (!accessToken) {
    throw new Error('No migration authentication is configured.');
  }

  return {
    ...base,
    authentication: {
      type: 'azure-active-directory-access-token',
      options: { token: accessToken }
    }
  };
};

const isNetworkBlock = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();

  return message.includes('firewall')
    || message.includes('client with ip address')
    || message.includes('not allowed to access the server')
    || message.includes('failed to connect to')
    || message.includes('connection timeout')
    || message.includes('connect timed out')
    || code === 'ETIMEOUT';
};

let pool;
try {
  pool = await new sql.ConnectionPool(createConnectionConfig()).connect();
  await pool.request().query('SELECT 1 AS ok;');
  console.log('Production database connectivity probe succeeded.');
} catch (error) {
  console.error(`Production database connectivity probe failed: ${error?.message || error}`);
  process.exitCode = isNetworkBlock(error) ? 2 : 1;
} finally {
  if (pool) {
    await pool.close().catch(() => {});
  }
}
