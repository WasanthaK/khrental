// B04: atomic shared rate limiting using the EXISTING Azure SQL connection.
// Unmounted and OFF until both additive schemas have passed governed apply.
// Every replica writes one server-HMAC digest bucket; no email or IP is stored.
import { getMssqlPool, sql } from '../mssql/pool.js';

const HASH = /^[a-f0-9]{64}$/;
const SCOPES = new Set(['challenge-ip', 'challenge-email', 'redeem-ip']);

const unavailable = () => Object.assign(
  new Error('Public signup abuse protection is unavailable.'),
  { status: 503, code: 'PUBLIC_SIGNUP_LIMITER_NOT_READY' }
);

export const createSqlPublicSignupLimiter = ({ getPool = getMssqlPool } = {}) => {
  if (typeof getPool !== 'function') throw unavailable();
  return Object.freeze({
    durable: true,
    provider: 'azure-sql-serializable',
    async consume({ key, scope, max, windowSeconds } = {}) {
      if (typeof key !== 'string' || !HASH.test(key) || !SCOPES.has(scope) ||
          !Number.isSafeInteger(max) || max < 1 || max > 1000 ||
          !Number.isSafeInteger(windowSeconds) ||
          windowSeconds < 1 || windowSeconds > 86400) {
        throw unavailable();
      }

      let transaction;
      let active = false;
      try {
        const pool = await getPool();
        transaction = new sql.Transaction(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        active = true;

        // UPDLOCK + HOLDLOCK on the unique bucket PK acquires either a row or
        // key-range lock, including the first insert when no row exists.
        // Transaction SERIALIZABLE makes the first-request race safe across
        // Container App replicas sharing the same SQL database.
        const response = await new sql.Request(transaction)
          .input('bucketHash', sql.Char(64), key)
          .input('max', sql.Int, max)
          .input('windowSeconds', sql.Int, windowSeconds)
          .query(`
            DECLARE @now DATETIME2(3) = SYSUTCDATETIME();
            DECLARE @windowStart DATETIME2(3) = NULL;
            DECLARE @used INT = NULL;
            DECLARE @allowed INT = 0;

            SELECT @windowStart = window_start, @used = request_count
            FROM dbo.public_signup_rate_limits WITH (UPDLOCK, HOLDLOCK)
            WHERE bucket_hash = @bucketHash;

            IF @windowStart IS NULL
            BEGIN
              INSERT INTO dbo.public_signup_rate_limits
                (bucket_hash, window_start, request_count, updated_at)
              VALUES (@bucketHash, @now, 1, @now);
              SET @allowed = 1;
            END
            ELSE IF @windowStart <= DATEADD(second, -@windowSeconds, @now)
            BEGIN
              UPDATE dbo.public_signup_rate_limits
              SET window_start = @now, request_count = 1, updated_at = @now
              WHERE bucket_hash = @bucketHash;
              SET @allowed = 1;
            END
            ELSE IF @used < @max
            BEGIN
              UPDATE dbo.public_signup_rate_limits
              SET request_count = @used + 1, updated_at = @now
              WHERE bucket_hash = @bucketHash;
              SET @allowed = 1;
            END;

            SELECT @allowed AS allowed;
          `);
        const allowed = response.recordset?.[0]?.allowed;
        if (allowed !== 0 && allowed !== 1) throw unavailable();
        await transaction.commit();
        active = false;
        return allowed === 1;
      } catch {
        if (active) {
          try { await transaction.rollback(); } catch { /* deny on uncertainty */ }
        }
        // DB outage, invalid DDL, timeouts and deadlocks all deny, never allow.
        throw unavailable();
      }
    }
  });
};
