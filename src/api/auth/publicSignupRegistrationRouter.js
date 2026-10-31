// B04 S3b2b: testable HTTP contract only. DO NOT mount in the server
// until a real cross-instance atomic limiter, trusted client IP source,
// controlled delivery adapter, governed SQL apply and pilot acceptance exist.
import express from 'express';
import {PUBLIC_SIGNUP_PASSWORD_HINT} from '../../utils/publicSignupPasswordPolicy.js';
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

const DIAGNOSTIC_STAGES = new Set([
  'runtime_dependencies', 'ingress_client_address', 'challenge_client_address',
  'challenge_ip_quota', 'challenge_email_quota', 'challenge_issue',
  'challenge_delivery_finalization', 'redeem_client_address', 'redeem_ip_quota',
  'redemption', 'redemption_result', 'identity_readback', 'session_issue'
]);

// Never forward the error object, message, SQL, parameters, headers or body.
// Only fixed categories may leave this boundary, including for hostile errors.
export const reportPublicSignupUnavailable = (stage, error) => {
  try {
    const number = Number(error?.number ?? error?.originalError?.info?.number);
    const code = error?.code;
    let category = 'UNCLASSIFIED';
    if ([207, 208].includes(number) || code === 'SIGNUP_SCHEMA_REQUIRED') {category = 'SQL_SCHEMA';}
    else if (number === 229) {category = 'SQL_PERMISSION';}
    else if ([334, 515, 547, 8114].includes(number)) {category = 'SQL_WRITE_CONTRACT';}
    else if (number === 1205) {category = 'SQL_DEADLOCK';}
    else if (number === 1222 || code === 'ETIMEOUT') {category = 'TIMEOUT';}
    else if ([40501, 10928, 10929, 49918, 49919, 49920].includes(number)) {category = 'SQL_THROTTLED';}
    else if (['ECONNCLOSED', 'ESOCKET', 'ELOGIN', 'EINSTLOOKUP', 'ENOCONN'].includes(code)) {category = 'CONNECTION';}
    else if (code === 'SIGNUP_TRANSACTION_FAILED') {category = 'TRANSACTION_RESULT';}
    else if (code === 'PUBLIC_SIGNUP_LIMITER_NOT_READY') {
      category = ['DEADLOCK', 'LOCK_TIMEOUT', 'SQL_THROTTLED', 'TIMEOUT', 'CONNECTION'].includes(error?.diagnosticCategory)
        ? error.diagnosticCategory : 'LIMITER_UNAVAILABLE';
    }
    console.error('[PublicSignupUnavailable]', {
      stage: DIAGNOSTIC_STAGES.has(stage) ? stage : 'unknown', category
    });
  } catch { /* Diagnostics must not change the existing fail-closed response. */ }
};

const noStore = (_req, res, next) => {
  res.set('Cache-Control', 'no-store, private');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
};

export const createPublicSignupRouter = ({
  enabled = false,
  pilotEmail = null,
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
      reportPublicSignupUnavailable('runtime_dependencies');
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
    let stage = 'challenge_client_address';
    try {
      const address = clientAddress(req);
      if (typeof address !== 'string' || !address.trim()) {
        reportPublicSignupUnavailable(stage);
        res.status(503).json(UNAVAILABLE); return;
      }
      stage = 'challenge_ip_quota';
      if (!await consume(req, 'challenge-ip', address.trim(), 12)) {
        res.status(429).json({ error: 'Please try again later.', code: 'SIGNUP_RATE_LIMITED' });
        return;
      }
      const details = normalizePublicSignupDetails(req.body);
      // An unapproved mailbox gets the same generic response: no challenge,
      // no SendGrid mail, no account/identity existence disclosure.
      if (pilotEmail && details?.email !== pilotEmail) {
        res.json(GENERIC); return;
      }
      if (!details) {
        res.json(GENERIC); return;
      }
      stage = 'challenge_email_quota';
      if (!await consume(req, 'challenge-email', details.email, 4)) {
        res.status(429).json({ error: 'Please try again later.', code: 'SIGNUP_RATE_LIMITED' });
        return;
      }

      stage = 'challenge_issue';
      const issued = await beginChallenge(details);
      if (issued) {
        // Link/email is constructed only after the server has chosen the
        // token and destination. The caller must supply a validated origin.
        let accepted = false;
        try {
          const mail = makeEmail({ token: issued.token,...(details.enquiry?{enquiry:details.enquiry}:{}),...(details.ownerCountry?{ownerCountry:details.ownerCountry}:{}) });
          const response = await sendEmail({ to: issued.email, ...mail });
          accepted = response?.success === true && response?.simulated !== true;
        } catch {
          // Keep provider errors, addresses and opaque tokens out of logs.
        }
        // Delivery finalization errors fail the endpoint closed; the
        // redeem transaction also needs an accepted-send marker.
        stage = 'challenge_delivery_finalization';
        await finishDelivery({
          challengeId: issued.challengeId, providerAccepted: accepted
        });
      }
      res.json(GENERIC);
    } catch (error) {
      reportPublicSignupUnavailable(stage, error);
      res.status(503).json(UNAVAILABLE);
    }
  });

  router.post('/redeem', async (req, res) => {
    let stage = 'redeem_client_address';
    try {
      const address = clientAddress(req);
      if (typeof address !== 'string' || !address.trim()) {
        reportPublicSignupUnavailable(stage);
        res.status(503).json(UNAVAILABLE); return;
      }
      stage = 'redeem_ip_quota';
      if (!await consume(req, 'redeem-ip', address.trim(), 12)) {
        res.status(429).json({ error: 'Please try again later.', code: 'SIGNUP_RATE_LIMITED' });
        return;
      }
      stage = 'redemption';
      const result = await redeem({
        token: req.body?.token, password: req.body?.password,
        ...(pilotEmail ? { expectedEmail: pilotEmail } : {})
      });
      stage = 'redemption_result';
      if (result.tenantId !== null || result.role !== 'authenticated' ||
          result.userType !== 'seeker') {
        reportPublicSignupUnavailable(stage);
        res.status(503).json(UNAVAILABLE); return;
      }
      stage = 'identity_readback';
      const record = await findAuth(result.email);
      if (!record ||
          String(record.authId).toLowerCase() !== String(result.authId).toLowerCase() ||
          String(record.appUserId).toLowerCase() !== String(result.appUserId).toLowerCase() ||
          record.role !== 'authenticated') {
        reportPublicSignupUnavailable(stage);
        res.status(503).json(UNAVAILABLE); return;
      }
      stage = 'session_issue';
      const session = await createSession(record);
      res.status(201).json({ data: {
        // Use the read-back authority, exactly as the issued session does.
        user: { id: record.authId, role: 'authenticated', user_type: 'seeker' },
        session
      } });
    } catch (error) {
      if(error?.code==='SIGNUP_PASSWORD_INVALID'){
        res.status(400).json({error:PUBLIC_SIGNUP_PASSWORD_HINT,code:'SIGNUP_PASSWORD_INVALID'});
        return;
      }
      if (['SIGNUP_VERIFICATION_UNAVAILABLE',
        'SIGNUP_IDENTITY_ALREADY_EXISTS'].includes(error?.code)) {
        res.status(400).json({
          error: 'This verification cannot be completed. Sign in or request another link.',
          code: 'SIGNUP_VERIFICATION_UNAVAILABLE'
        });
        return;
      }
      reportPublicSignupUnavailable(stage, error);
      res.status(503).json(UNAVAILABLE);
    }
  });
  return router;
};
