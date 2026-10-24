// R3 B04: bounded physical Azure SQL quota acceptance. CLI-only, never HTTP.
// Synthetic HMAC bucket only; refuses production public signup, real identity
// or organization input; requires SQL permission to clean its exact test row.
import { closeMssqlPool, getMssqlPool, sql } from '../src/api/mssql/pool.js';
import { createSqlPublicSignupLimiter } from '../src/api/auth/publicSignupSqlLimiter.js';
import { hashPublicSignupThrottleKey } from '../src/api/auth/publicSignupThrottleKey.js';

const LIMIT = 5;
const REQUESTS = 8;
const WINDOW_SECONDS = 3600;
const fail = text => { throw new Error('R3_LIMITER_ACCEPTANCE_BLOCKED: ' + text); };

const main = async () => {
  const [mode, nonce, epochString] = process.argv.slice(2);
  if (!['worker', 'finalize', 'preflight'].includes(mode) ||
      typeof nonce !== 'string' || !/^[a-f0-9]{32}$/.test(nonce)) {
    fail('invalid mode or synthetic nonce');
  }
  if (process.env.NODE_ENV !== 'production' ||
      process.env.PUBLIC_SIGNUP_ENABLED !== 'false' ||
      process.env.PUBLIC_SIGNUP_PILOT_APPROVED !== 'false' ||
      process.env.VITE_PUBLIC_SIGNUP_UI_ENABLED !== 'false') {
    fail('signup disabled and production source constraints not proven');
  }
  const secret = process.env.PUBLIC_SIGNUP_THROTTLE_SECRET;
  const key = hashPublicSignupThrottleKey({
    secret, scope: 'redeem-ip', identifier: 'r3-quota-acceptance-' + nonce
  });
  // We refuse even a synthetic write unless the normal app principal can
  // delete precisely this single test row afterward.
  const pool = await getMssqlPool();
  const rights = await pool.request().query(
    "SELECT HAS_PERMS_BY_NAME(N'dbo.public_signup_rate_limits', 'OBJECT', 'DELETE') AS can_delete, " +
    "HAS_PERMS_BY_NAME(N'dbo.public_signup_rate_limits', 'OBJECT', 'SELECT') AS can_select"
  );
  if (Number(rights.recordset?.[0]?.can_delete) !== 1 ||
      Number(rights.recordset?.[0]?.can_select) !== 1) {
    fail('test row cleanup/read permission absent; no writes attempted');
  }
  if (mode === 'preflight') {
    console.log('R3_SQL_LIMITER_READONLY_PREFLIGHT=PASS');
    return;
  }
  if (mode === 'worker') {
    const epoch = Number(epochString);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(epoch) || epoch < now - 10 || epoch > now + 120) {
      fail('invalid shared concurrency start time; no writes attempted');
    }
    const ms = Math.max(0, epoch * 1000 - Date.now());
    if (ms) await new Promise(resolve => setTimeout(resolve, ms));
    const limiter = createSqlPublicSignupLimiter();
    const outcomes = await Promise.allSettled(Array.from({ length: REQUESTS }, () =>
      limiter.consume({
        key, scope: 'redeem-ip', max: LIMIT, windowSeconds: WINDOW_SECONDS
      })
    ));
    if (outcomes.some(result => result.status !== 'fulfilled')) {
      console.error('R3_SQL_TRANSACTION_RESULTS=REJECTED count=' +
        outcomes.filter(result => result.status !== 'fulfilled').length);
      fail('one or more independently executed SQL transactions failed');
    }
    const allowed = outcomes.filter(result => result.value === true).length;
    const denied = outcomes.filter(result => result.value === false).length;
    if (allowed + denied !== REQUESTS) fail('unrecognized quota response');
    console.log('R3_LIMITER_WORKER_DONE allowed=' + allowed + ' denied=' + denied +
      ' requests=' + REQUESTS);
    return;
  }
  // Called once after BOTH independent worker sessions exit (including failure).
  // Delete the precise synthetic bucket before reporting success or failure.
  let used = null;
  let erased = false;
  try {
    const result = await pool.request().input('bucketHash', sql.Char(64), key).query(
      'SELECT request_count AS used FROM dbo.public_signup_rate_limits ' +
      'WHERE bucket_hash = @bucketHash'
    );
    if (result.recordset?.length === 1) {
      used = Number(result.recordset[0].used);
    }
  } finally {
    const removed = await pool.request().input('bucketHash', sql.Char(64), key).query(
      'DELETE FROM dbo.public_signup_rate_limits WHERE bucket_hash = @bucketHash'
    );
    const leftover = await pool.request().input('bucketHash', sql.Char(64), key).query(
      'SELECT COUNT(*) AS remaining FROM dbo.public_signup_rate_limits ' +
      'WHERE bucket_hash = @bucketHash'
    );
    erased = Number(leftover.recordset?.[0]?.remaining) === 0 &&
      (removed.rowsAffected?.[0] === 1 || removed.rowsAffected?.[0] === 0);
    console.log('R3_LIMITER_OBSERVED_REQUEST_COUNT=' +
      (Number.isSafeInteger(used) ? used : 'NONE'));
    console.log('R3_LIMITER_SYNTHETIC_BUCKET_REMOVED=' + (erased ? 'PASS' : 'FAIL'));
  }
  if (!erased || used !== LIMIT) {
    fail('persisted acceptance count not exact ' + LIMIT + ' or cleanup failed');
  }
  console.log('R3_LIMITER_PERSISTED_ATOMIC_LIMIT=PASS consumed=' + used);
};

main().catch(err => {
  console.error('R3_LIMITER_ACCEPTANCE_FAILED ' + (err?.message || 'unexpected'));
  process.exitCode = 1;
}).finally(async () => {
  try { await closeMssqlPool(); } catch { process.exitCode = 1; }
});
