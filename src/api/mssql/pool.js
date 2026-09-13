import sql from 'mssql';
import { getMssqlConfig, isMssqlConfigured } from './config.js';

let poolPromise = null;

export const getMssqlPool = async () => {
  if (!isMssqlConfigured()) {
    throw new Error('MSSQL is not configured. Set MSSQL_SERVER and MSSQL_DATABASE, then configure managed identity or SQL credentials.');
  }

  if (!poolPromise) {
    const config = getMssqlConfig();
    const pool = new sql.ConnectionPool(config);

    poolPromise = pool.connect().catch((error) => {
      poolPromise = null;
      throw error;
    });
  }

  return poolPromise;
};

export const closeMssqlPool = async () => {
  if (!poolPromise) {
    return;
  }

  const pool = await poolPromise;
  poolPromise = null;
  await pool.close();
};

export { sql };
