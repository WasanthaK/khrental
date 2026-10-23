// B04 S3d: OPTIONAL Redis-backed shared atomic signup limiter.
// Source candidate only; does not provision Redis, connect an external network,
// bypass the previously blocked SQL migration, or enable registration.
//
// Inject a separately provisioned, authenticated, TLS-verified Redis client
// using its standard eval(script, {keys, arguments}) interface.
// Every call must hit the SAME shared store across all app replicas.
const HASH = /^[a-f0-9]{64}$/;
const SCOPES = new Set(['challenge-ip', 'challenge-email', 'redeem-ip']);
const PREFIX = 'quixo:public-signup:rate:v1:';

// Redis Lua EVAL executes atomically. One script invocation counts an attempt
// and sets a TTL before granting it. At quota exhaustion the caller is denied,
// without extending the TTL or resetting the window. No raw email/IP or bearer
// token reaches Redis: only the preceding HMAC-derived digest is used.
export const PUBLIC_SIGNUP_REDIS_LIMIT_SCRIPT = [
  'local limit = tonumber(ARGV[1])',
  'local window = tonumber(ARGV[2])',
  'local current = redis.call("GET", KEYS[1])',
  'if current and tonumber(current) >= limit then return 0 end',
  'local count = redis.call("INCR", KEYS[1])',
  'if count == 1 then',
  '  if redis.call("EXPIRE", KEYS[1], window) ~= 1 then return -1 end',
  'end',
  'if redis.call("TTL", KEYS[1]) <= 0 then return -1 end',
  'if count <= limit then return 1 else return 0 end'
].join('\n');

const unavailable = () => Object.assign(
  new Error('Registration abuse protection is unavailable.'),
  { status: 503, code: 'PUBLIC_SIGNUP_LIMITER_NOT_READY' }
);

export const createRedisPublicSignupLimiter = ({ redis } = {}) => {
  // An injected Redis client does not imply live infrastructure exists.
  // Binding this adapter in production requires a separately authorized
  // shared Redis deployment, TLS/auth, lifecycle health checks and failover.
  if (!redis || typeof redis.eval !== 'function') throw unavailable();

  return Object.freeze({
    durable: true,
    provider: 'redis-atomic-eval',
    async consume({ key, scope, max, windowSeconds } = {}) {
      if (typeof key !== 'string' || !HASH.test(key) ||
          !SCOPES.has(scope) ||
          !Number.isSafeInteger(max) || max < 1 || max > 1000 ||
          !Number.isSafeInteger(windowSeconds) ||
          windowSeconds < 1 || windowSeconds > 86400) {
        throw unavailable();
      }
      if (redis.isReady !== true) throw unavailable();
      try {
        const result = await redis.eval(PUBLIC_SIGNUP_REDIS_LIMIT_SCRIPT, {
          keys: [PREFIX + scope + ':' + key],
          arguments: [String(max), String(windowSeconds)]
        });
        if (result === 1 || result === 1n) return true;
        if (result === 0 || result === 0n) return false;
        // Corrupt counter, missing TTL or unsupported provider replies fail
        // closed. Never assume unknown Redis responses mean quota allowed.
        throw unavailable();
      } catch {
        throw unavailable();
      }
    }
  });
};
