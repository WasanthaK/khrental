const DEFAULT_PORT = 1433;
const MANAGED_IDENTITY_AUTH = 'managed-identity';

const parseBoolean = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return String(value).toLowerCase() === 'true';
};

const parseNumber = (value, defaultValue) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const getAuthenticationType = () => (
  String(process.env.MSSQL_AUTHENTICATION || 'sql-password').toLowerCase()
);

export const getMssqlConfig = () => {
  const authenticationType = getAuthenticationType();
  const config = {
    server: process.env.MSSQL_SERVER || '',
    port: parseNumber(process.env.MSSQL_PORT, DEFAULT_PORT),
    database: process.env.MSSQL_DATABASE || '',
    options: {
      encrypt: parseBoolean(process.env.MSSQL_ENCRYPT, true),
      trustServerCertificate: parseBoolean(process.env.MSSQL_TRUST_SERVER_CERTIFICATE, false)
    },
    pool: {
      max: parseNumber(process.env.MSSQL_POOL_MAX, 10),
      min: parseNumber(process.env.MSSQL_POOL_MIN, 0),
      idleTimeoutMillis: parseNumber(process.env.MSSQL_POOL_IDLE_TIMEOUT_MS, 30000)
    }
  };

  if (authenticationType === MANAGED_IDENTITY_AUTH) {
    return {
      ...config,
      authentication: {
        type: 'azure-active-directory-default',
        options: {}
      }
    };
  }

  return {
    ...config,
    user: process.env.MSSQL_USER || '',
    password: process.env.MSSQL_PASSWORD || ''
  };
};

export const isMssqlConfigured = () => {
  const config = getMssqlConfig();

  return Boolean(
    config.server
      && config.database
      && (
        config.authentication?.type === 'azure-active-directory-default'
        || (config.user && config.password)
      )
  );
};

export const getMssqlConfigStatus = () => {
  const config = getMssqlConfig();

  return {
    configured: isMssqlConfigured(),
    authentication: getAuthenticationType(),
    server: config.server || null,
    database: config.database || null,
    port: config.port,
    encrypt: config.options.encrypt,
    trustServerCertificate: config.options.trustServerCertificate
  };
};
