// B04 S3b2b: testable HTTP contract only. DO NOT mount in the server
// until a real cross-instance atomic limiter, trusted client IP source,
// controlled delivery adapter, governed SQL apply and pilot acceptance exist.
import express from 'express';
import { normalizePublicSignupDetails } from './publicSignupChallengeService.js';
import { hashPublicSignupThrottleKey } from './publicSignupThrottleKey.js';

const GENERIC = Object.freeze({
  data: {
    accepted: true,
    message: 'If registration is available for this email address, a verification message will be sent.'
  }
});
const DISABLED = Object.freeze({
  error: 'Public registration is not available.',
  code: 'PUBLIC_SIGNUP_DISABLED'
});
const UNAVAILABLE = Object.freeze({
  error: 'Public registration is temporarily unavailable.',
  code: 'PUBLIC_SIGNUP_NOT_READY'
});

const noStore = (_req, res, next) => {
  res.set('Cache-Control', 'no-store, private');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
};

export const createPublicSignupRouter = ({
  enabled = false,
  limiter = null,
  clientAddress = null,
  throttleSecret = '',
  beginChallenge = null,
  finishDelivery = null,
  sendEmail = null,
  makeEmail = null,
  redeem = null,
  findAuth = null,
  createSession = null
} = {}) => {
  const router = express.Router();
  router.use(noStore);
  router.use((req, res, next) => {
    if (!enabled) {
      res.status(404).json(DISABLED);
      return;
    }
    // A caller cannot turn on public signup using a flag alone.
    // This must be an explicitly provisioned shared and atomic limiter,
    // not an in-process Map or independent Azure replica counters.
    if (limiter?.durable !== true ||
        typeof limiter.consume !== 'function' ||
        typeof clientAddress !== 'function' ||
        typeof throttleSecret !== 'string' ||
        Buffer.byteLength(throttleSecret, 'utf8') < 32 ||
        typeof beginChallenge !== 'function' ||
        typeof finishDelivery !== 'function' ||
        typeof sendEmail !== 'function' ||
        typeof makeEmail !== 'function' ||
        typeof redeem !== 'function' ||
        typeof findAuth !== 'function' ||
        typeof createSession !== 'function') {
      res.status(503).json(UNAVAILABLE);
      return;
    }
    next();
  });

  const consume = async (req, scope, identifier, limit) => {
    // Only the trusted ingress resolver may supply the public source IP.
    // Never consume x-forwarded-for or x-real-ip directly from user headers.
    const digest = hashPublicSignupThrottleKey({
      secret: throttleSecret, scope, identifier
    });
    return await limiter.consume({
      key: digest, scope, max: limit, windowSeconds: 3600
    }) === true;
  };

  router.post('/challenge', async (req, res) => {
    try {
      const address = clientAddress(req);
      if (typeof address !== 'string' || !address.trim()) {
        res.status(503).json(UNAVAILABLE); return;
      }
      if (!await consume(req, 'challenge-ip', address.trim(), 12)) {
        res.status(429).json({ error: 'Please try again later.', code: 'SIGNUP_RATE_LIMITED' });
        return;
      }
      const details = normalizePublicSignupDetails(req.body);
      if (!details) {
        res.json(GENERIC); return;
      }
      if (!await consume(req, 'challenge-email', details.email, 4)) {
        res.status(429).json({ error: 'Please try again later.', code: 'SIGNUP_RATE_LIMITED' });
        return;
      }

      const issued = await beginChallenge(details);
      if (issued) {
        // Link/email is constructed only after the server has chosen the
        // token and destination. The caller must supply a validated origin.
        let accepted = false;
        try {
          const mail = makeEmail({ token: issued.token });
          const response = await sendEmail({ to: issued.email, ...mail });
          accepted = response?.success === true && response?.simulated !== true;
        } catch {
          // Keep provider errors, addresses and opaque tokens out of logs.
        }
        // Delivery finalization errors fail the endpoint closed; the
        // redeem transaction also needs an accepted-send marker.
        await finishDelivery({
          challengeId: issued.challengeId, providerAccepted: accepted
        });
      }
      res.json(GENERIC);
    } catch {
      res.status(503).json(UNAVAILABLE);
    }
  });

  router.post('/redeem', async (req, res) => {
    try {
      const address = clientAddress(req);
      if (typeof address !== 'string' || !address.trim()) {
        res.status(503).json(UNAVAILABLE); return;
      }
      if (!await consume(req, 'redeem-ip', address.trim(), 12)) {
        res.status(429).json({ error: 'Please try again later.', code: 'SIGNUP_RATE_LIMITED' });
        return;
      }
      const result = await redeem({
        token: req.body?.token, password: req.body?.password
      });
      if (result.tenantId !== null || result.role !== 'authenticated' ||
          result.userType !== 'seeker') {
        res.status(503).json(UNAVAILABLE); return;
      }
      const record = await findAuth(result.email);
      if (!record ||
          String(record.authId).toLowerCase() !== String(result.authId).toLowerCase() ||
          String(record.appUserId).toLowerCase() !== String(result.appUserId).toLowerCase() ||
          record.role !== 'authenticated') {
        res.status(503).json(UNAVAILABLE); return;
      }
      const session = await createSession(record);
      res.status(201).json({ data: {
        user: { id: result.authId, role: 'authenticated', user_type: 'seeker' },
        session
      } });
    } catch (error) {
      if (['SIGNUP_VERIFICATION_UNAVAILABLE', 'SIGNUP_PASSWORD_INVALID',
        'SIGNUP_IDENTITY_ALREADY_EXISTS'].includes(error?.code)) {
        res.status(400).json({
          error: 'This verification cannot be completed. Sign in or request another link.',
          code: 'SIGNUP_VERIFICATION_UNAVAILABLE'
        });
        return;
      }
      res.status(503).json(UNAVAILABLE);
    }
  });
  return router;
};
