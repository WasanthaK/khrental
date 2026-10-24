// R3 B04: when Azure has only one replica, use ONE console transport to
// spawn two genuinely separate Node/SQL processes. This avoids racing two
// Azure interactive exec consoles against the same replica. No user data.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('./r3-b04-limiter-physical-acceptance.mjs', import.meta.url));
const safe = text => { console.error('R3_SQL_PHYSICAL_BLOCKED=' + text); process.exitCode = 1; };
const execute = (mode, nonce, epoch) => new Promise(resolve => {
  const args = [path, mode, nonce, ...(epoch ? [String(epoch)] : [])];
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  const capture = (chunk, name) => {
    if (name === 'out') stdout = (stdout + chunk.toString()).slice(-4096);
    else stderr = (stderr + chunk.toString()).slice(-4096);
  };
  child.stdout.on('data', b => capture(b, 'out'));
  child.stderr.on('data', b => capture(b, 'err'));
  let timeout = false;
  const timer = setTimeout(() => { timeout = true; child.kill('SIGKILL'); }, 90000);
  child.on('error', () => {});
  child.on('close', code => {
    clearTimeout(timer);
    resolve({ code, timeout, stdout, stderr });
  });
});

const main = async () => {
  if (process.env.NODE_ENV !== 'production' ||
      process.env.PUBLIC_SIGNUP_ENABLED !== 'false' ||
      process.env.PUBLIC_SIGNUP_PILOT_APPROVED !== 'false' ||
      process.env.VITE_PUBLIC_SIGNUP_UI_ENABLED !== 'false') {
    safe('PRODUCTION_FLAGS_NOT_DISABLED');
    return;
  }
  const nonce = randomBytes(16).toString('hex');
  const pre = await execute('preflight', nonce);
  if (pre.code !== 0 || !pre.stdout.includes('R3_SQL_LIMITER_READONLY_PREFLIGHT=PASS')) {
    safe('SQL_READONLY_PREFLIGHT_DENIED_NO_WRITES');
    return;
  }
  console.log('R3_SQL_LIMITER_READONLY_PREFLIGHT=PASS');
  const start = Math.floor(Date.now() / 1000) + 15;
  // Independent child processes, different mssql pools, one shared Azure SQL
  // HMAC bucket and one 5-per-hour limit. 16 independent SQL transactions.
  const [a, b] = await Promise.all([
    execute('worker', nonce, start),
    execute('worker', nonce, start)
  ]);
  const finish = await execute('finalize', nonce);
  if (finish.stdout.includes('R3_LIMITER_SYNTHETIC_BUCKET_REMOVED=PASS')) {
    console.log('R3_SQL_EXACT_SYNTHETIC_BUCKET_CLEANUP=PASS');
  } else {
    safe('SQL_TEST_ROW_CLEANUP_UNVERIFIED');
    return;
  }
  const count = /R3_LIMITER_OBSERVED_REQUEST_COUNT=(\d+|NONE)/.exec(finish.stdout)?.[1];
  const first = /R3_LIMITER_WORKER_DONE allowed=(\d+) denied=(\d+) requests=8/.exec(a.stdout);
  const second = /R3_LIMITER_WORKER_DONE allowed=(\d+) denied=(\d+) requests=8/.exec(b.stdout);
  if (a.code !== 0 || b.code !== 0 || a.timeout || b.timeout ||
      !first || !second || count !== '5') {
    // Print allowlisted diagnostic categories, not raw console data, SQL
    // connection details, environment variables, secrets or HMAC bucket keys.
    console.error('R3_SQL_WORKER_A=' + (first ? 'COMPLETE' : 'FAILED') +
      ' R3_SQL_WORKER_B=' + (second ? 'COMPLETE' : 'FAILED') +
      ' R3_SQL_COUNT=' + (count || 'UNKNOWN') +
      ' R3_SQL_REJECTION_A=' + a.stderr.includes('R3_SQL_TRANSACTION_RESULTS=REJECTED') +
      ' R3_SQL_REJECTION_B=' + b.stderr.includes('R3_SQL_TRANSACTION_RESULTS=REJECTED'));
    safe('RACE_NOT_ACCEPTED');
    return;
  }
  const allowed = Number(first[1]) + Number(second[1]);
  const denied = Number(first[2]) + Number(second[2]);
  if (allowed !== 5 || denied !== 11) {
    safe('NOT_EXACT_FIVE_ADMITTED_ELEVEN_DENIED');
    return;
  }
  console.log('R3_SQL_TWO_INDEPENDENT_PROCESSES=PASS admitted=5 denied=11');
  console.log('R3_SQL_PHYSICAL_LIMITER_CROSS_REPLICA=NOT_YET_TESTED');
};
main().catch(() => safe('UNEXPECTED_ORCHESTRATOR_FAILURE'));
