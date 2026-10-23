import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hashPublicSignupThrottleKey } from '../src/api/auth/publicSignupThrottleKey.js';
import {
  createRedisPublicSignupLimiter,
  PUBLIC_SIGNUP_REDIS_LIMIT_SCRIPT
} from '../src/api/auth/publicSignupRedisLimiter.js';

const router = readFileSync(
  new URL('../src/api/auth/publicSignupRegistrationRouter.js', import.meta.url), 'utf8'
);
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

const digest = identity => hashPublicSignupThrottleKey({
  scope: 'challenge-email',
  identifier: identity,
  secret: 'synthetic-test-secret-with-ample-entropy-2026'
});

// A deterministic Redis EVAL contract simulator, NOT proof of a deployed Redis.
// Its synchronized eval() boundary models a single atomic server-side script;
// validation against a live shared Redis deployment remains a release gate.
const fakeRedis = () => {
  const counters = new Map();
  const seen = [];
  let now = 0;
  let ready = true;
  const client = {
    get isReady() { return ready; },
    setReady(next) { ready = next; },
    advance(seconds) { now += seconds; },
    seen,
    counters,
    async eval(script, { keys, arguments: args }) {
      assert.equal(script, PUBLIC_SIGNUP_REDIS_LIMIT_SCRIPT);
      assert.equal(keys.length, 1);
      assert.equal(args.length, 2);
      const [key] = keys;
      const [limit, duration] = args.map(Number);
      seen.push({ key, limit, duration });
      const old = counters.get(key);
      const active = old && old.expiresAt > now ? old : null;
      if (active && active.count >= limit) return 0;
      const count = active ? active.count + 1 : 1;
      counters.set(key, { count, expiresAt: active ? active.expiresAt : now + duration });
      return 1;
    }
  };
  return client;
};

test('atomic provider script wraps quota and expiration in the same EVAL', () => {
  assert.match(PUBLIC_SIGNUP_REDIS_LIMIT_SCRIPT, /redis\.call\("GET", KEYS\[1\]\)/);
  assert.match(PUBLIC_SIGNUP_REDIS_LIMIT_SCRIPT, /redis\.call\("INCR", KEYS\[1\]\)/);
  assert.match(PUBLIC_SIGNUP_REDIS_LIMIT_SCRIPT, /redis\.call\("EXPIRE", KEYS\[1\], window\)/);
  assert.match(PUBLIC_SIGNUP_REDIS_LIMIT_SCRIPT, /redis\.call\("TTL", KEYS\[1\]\)/);
  assert.match(PUBLIC_SIGNUP_REDIS_LIMIT_SCRIPT, /if current and tonumber\(current\) >= limit then return 0 end/);
  assert.doesNotMatch(PUBLIC_SIGNUP_REDIS_LIMIT_SCRIPT, /redis\.call\("(?:KEYS|FLUSHALL|DEL)"/);
});

test('two independent app replicas cannot bypass a common Redis quota', async () => {
  const redis = fakeRedis();
  const first = createRedisPublicSignupLimiter({ redis });
  const second = createRedisPublicSignupLimiter({ redis });
  assert.equal(first.durable, true);
  assert.equal(first.provider, 'redis-atomic-eval');
  const args = {
    key: digest('person@example.invalid'),
    scope: 'challenge-email', max: 4, windowSeconds: 3600
  };
  const requests = Array.from({ length: 50 }, (_, i) => (
    (i % 2 ? first : second).consume(args)
  ));
  const results = await Promise.all(requests);
  assert.equal(results.filter(Boolean).length, 4);
  assert.equal(results.filter(x=>!x).length, 46);
  assert.equal(redis.seen.length, 50);
  assert.equal(redis.counters.size, 1);
  assert.equal(redis.counters.values().next().value.count, 4,
    'rejected attempts cannot reset or extend a quota');
  assert.equal(redis.seen[0].key.includes('person@example.invalid'), false);
  assert.match(redis.seen[0].key, /^quixo:public-signup:rate:v1:challenge-email:[a-f0-9]{64}$/);

  redis.advance(3599);
  assert.equal(await first.consume(args), false);
  redis.advance(2);
  assert.equal(await second.consume(args), true, 'expired time window can safely reopen');
});

test('scopes and identities have separate hashed storage keys', async () => {
  const redis = fakeRedis();
  const limiter = createRedisPublicSignupLimiter({ redis });
  const secret = 'synthetic-test-secret-with-ample-entropy-2026';
  for (const [scope, identifier] of [
    ['challenge-email', 'one@example.invalid'],
    ['challenge-email', 'two@example.invalid'],
    ['challenge-ip', '192.0.2.4'],
    ['redeem-ip', '192.0.2.4']
  ]) {
    const key = hashPublicSignupThrottleKey({ scope, identifier, secret });
    assert.equal(await limiter.consume({ key, scope, max: 1, windowSeconds: 60 }), true);
  }
  assert.equal(redis.counters.size, 4);
  for (const key of redis.counters.keys()) {
    assert.ok(!key.includes('@') && !key.includes('192.0.2.'));
  }
});

test('invalid HMAC hash, unknown scope or unsupported quotas never touch the store', async () => {
  const redis = fakeRedis();
  const limiter = createRedisPublicSignupLimiter({ redis });
  const valid = { key: randomBytes(32).toString('hex'),
    scope: 'challenge-ip', max: 12, windowSeconds: 3600 };
  for (const input of [
    { ...valid, key: 'raw-client-email@example.invalid' },
    { ...valid, key: 'f'.repeat(65) },
    { ...valid, key: 'f'.repeat(64).toUpperCase() },
    { ...valid, scope: 'billing' },
    { ...valid, max: 0 }, { ...valid, max: -1 },
    { ...valid, max: 1.5 }, { ...valid, max: 1001 },
    { ...valid, windowSeconds: 0 }, { ...valid, windowSeconds: 86401 },
    { ...valid, windowSeconds: NaN }
  ]) {
    await assert.rejects(limiter.consume(input),
      error => error.code === 'PUBLIC_SIGNUP_LIMITER_NOT_READY');
  }
  assert.equal(redis.seen.length, 0);
});

test('unavailable Redis and ambiguous EVAL status cause generic closed failure', async () => {
  assert.throws(() => createRedisPublicSignupLimiter({}),
    error => error.code === 'PUBLIC_SIGNUP_LIMITER_NOT_READY');
  const redis = fakeRedis();
  const limiter = createRedisPublicSignupLimiter({ redis });
  redis.setReady(false);
  const valid = { key: randomBytes(32).toString('hex'),
    scope: 'redeem-ip', max: 12, windowSeconds: 3600 };
  await assert.rejects(limiter.consume(valid),
    error => error.status === 503 && error.code === 'PUBLIC_SIGNUP_LIMITER_NOT_READY');
  redis.setReady(true);
  redis.eval = async () => 2;
  await assert.rejects(limiter.consume(valid),
    error => error.status === 503 && !error.message.includes('Redis'));
  redis.eval = async () => { throw new Error('Potential secret from Redis provider'); };
  await assert.rejects(limiter.consume(valid),
    error => error.code === 'PUBLIC_SIGNUP_LIMITER_NOT_READY'
      && !error.message.includes('Potential secret'));
});

test('provider remains completely unmounted and no SQL migration is introduced', () => {
  assert.doesNotMatch(server, /publicSignupRedisLimiter|createRedisPublicSignupLimiter/);
  assert.doesNotMatch(router, /import.*publicSignupRedisLimiter|createRedisPublicSignupLimiter/);
  assert.match(router, /limiter\?\.durable !== true/);
  assert.match(router, /typeof limiter\.consume !== 'function'/);
});
