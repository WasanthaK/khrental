// R3 B04: wire existing seeker registration pieces without activating public signup.
// A release flag ALONE is never sufficient; trusted ingress and a separately
// approved pilot, persistent SQL quota, pinned mail origin and sender are required.
import express from 'express';
import { createPublicSignupRouter, reportPublicSignupUnavailable } from './publicSignupRegistrationRouter.js';
import { beginPublicSignupChallenge, completePublicSignupChallengeDelivery } from './publicSignupChallengeService.js';
import { redeemPublicSignupChallenge } from './publicSignupRedemption.js';
import { createSqlPublicSignupLimiter } from './publicSignupSqlLimiter.js';
import { createPublicSignupSendGridAdapters } from './publicSignupSendGrid.js';
import { createAzureSignupClientAddress, checkPublicSignupBrowserRequest, normalizePublicSignupIp } from './publicSignupIngressGuard.js';
import { findAuthRecordByEmail, issueAuthSession, createSessionAuthMiddleware } from './index.js';
import {createAccountEmailVerificationRouter} from './accountEmailVerification.js';

// Same browser session shape as normal sign-in; credentials and tenant access are excluded.
export const serializePublicSignupSession=(record,issued)=>({
  access_token:issued.accessToken,
  token_type:'bearer',
  expires_at:Math.floor(new Date(issued.expiresAt).getTime()/1000),
  user:{
    id:record.authId,email:record.email,role:'authenticated',aud:'authenticated',
    app_metadata:{provider:'local-mssql',role:'authenticated'},
    user_metadata:{global_email_verified:record.metadata?.global_email_verified===true}
  }
});

const disabled = Object.freeze({ error: 'Public registration is not available.', code: 'PUBLIC_SIGNUP_DISABLED' });
const unavailable = Object.freeze({ error: 'Public registration is temporarily unavailable.', code: 'PUBLIC_SIGNUP_NOT_READY' });

// Exact socket-peer addresses must first be independently established against
// Azure ingress. Never trust arbitrary headers or allow a broad proxy CIDR.
export const createApprovedSignupPeerPredicate = (source) => {
  if (typeof source !== 'string' || !source.trim() || source.length > 1024) return () => false;
  const entries = source.split(',').map(x => x.trim());
  if (entries.length < 1 || entries.length > 8 || entries.some(x =>
    !x || x.includes('/') || x.includes('*') || x.includes(' ') || x.includes('%'))) return () => false;
  const peers = entries.map(normalizePublicSignupIp);
  if (peers.some(x => !x || x === '0.0.0.0' || x === '::') || new Set(peers).size !== peers.length) return () => false;
  const allow = new Set(peers);
  return peer => allow.has(normalizePublicSignupIp(peer));
};

export const resolvePublicSignupRelease = (config={}) => {
  // The accepted R3 canary remains the default. A general release requires
  // BOTH an explicit public mode and its separate owner-approval marker,
  // in addition to the existing runtime/approval/provider/ingress guards.
  const candidate = config.PUBLIC_SIGNUP_PILOT_EMAIL;
  const pilotEmail = typeof candidate === 'string' &&
    candidate === candidate.trim().toLowerCase() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) &&
    candidate.length <= 320 ? candidate : null;
  const mode=config.PUBLIC_SIGNUP_RELEASE_MODE||'pilot';
  const publicApproved=mode==='public'&&config.PUBLIC_SIGNUP_PUBLIC_APPROVED==='true';
  const enabled = ['pilot','public'].includes(mode)&&config.PUBLIC_SIGNUP_ENABLED === 'true' &&
    config.PUBLIC_SIGNUP_PILOT_APPROVED === 'true' &&
    (mode==='public'?publicApproved:(config.NODE_ENV !== 'production' || pilotEmail !== null));
  return {enabled,pilotEmail:config.NODE_ENV==='production'&&mode==='pilot'?pilotEmail:null,mode};
};

export const createPublicSignupRuntime = ({ config = process.env } = {}) => {
  const {enabled,pilotEmail}=resolvePublicSignupRelease(config);
  // This deployment-mode assertion must be set via the separately verified
  // ACA HTTP ingress OIDC gate. Never infer proxy trust from request headers.
  // In other environments keep the existing exact-socket predicate.
  const acaMode = config.NODE_ENV === 'production' &&
    config.PUBLIC_SIGNUP_INGRESS_MODE === 'azure-container-apps-http';
  const address = createAzureSignupClientAddress({
    isTrustedIngressPeer: createApprovedSignupPeerPredicate(config.PUBLIC_SIGNUP_TRUSTED_INGRESS_PEERS),
    azureManagedHttpIngress: acaMode
  });
  let mail = null;
  if (enabled) {
    try {
      mail = createPublicSignupSendGridAdapters({
        apiKey: config.PUBLIC_SIGNUP_SENDGRID_API_KEY,
        senderEmail: config.PUBLIC_SIGNUP_SENDER_EMAIL,
        senderName: config.PUBLIC_SIGNUP_SENDER_NAME || 'Quixo.Homes',
        baseUrl: config.PUBLIC_SIGNUP_VERIFICATION_ORIGIN,
        production: config.NODE_ENV === 'production'
      });
    } catch {
      // Never fall back to the landlord sender or an unverified public origin.
    }
  }
  const limiter = enabled ? createSqlPublicSignupLimiter() : null;
  const registration = createPublicSignupRouter({
    enabled,
    pilotEmail: config.NODE_ENV === 'production' ? pilotEmail : null,
    limiter,
    clientAddress: address,
    throttleSecret: config.PUBLIC_SIGNUP_THROTTLE_SECRET || '',
    beginChallenge: beginPublicSignupChallenge,
    finishDelivery: completePublicSignupChallengeDelivery,
    sendEmail: mail?.sendEmail,
    makeEmail: mail?.makeEmail,
    redeem: redeemPublicSignupChallenge,
    findAuth: findAuthRecordByEmail,
    createSession: async record => {
      // The shared identity service issues the normal secure bearer token.
      // Neither tenant membership nor organization access is granted here.
      const session = await issueAuthSession(record);
      return serializePublicSignupSession(record,session);
    }
  });
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, private');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Content-Type-Options', 'nosniff');
    if (!enabled) { res.status(404).json(disabled); return; }
    if (!checkPublicSignupBrowserRequest(req).allowed) {
      res.status(403).json({ error: 'Registration request was rejected.', code: 'SIGNUP_ORIGIN_DENIED' });
      return;
    }
    // This also prevents reading request bodies when the Azure peer cannot
    // be independently matched against the explicitly approved peer list.
    if (!address(req)) {
      reportPublicSignupUnavailable('ingress_client_address');
      res.status(503).json(unavailable); return;
    }
    next();
  });
  // Mount before the app-wide 10 MB JSON parser: enforce a separate 8 KB
  // admission limit, reject compressed/chunked bodies and invalid JSON.
  router.use(express.json({ limit: '8kb', strict: true, inflate: false }));
  router.use((error, _req, res, next) => {
    if (error?.type?.startsWith('entity.') || error instanceof SyntaxError) {
      res.status(400).json({ error: 'Invalid registration request.', code: 'SIGNUP_BAD_BODY' });
      return;
    }
    next(error);
  });
  router.use(createAccountEmailVerificationRouter({enabled, pilotEmail, limiter, clientAddress: address,
    throttleSecret: config.PUBLIC_SIGNUP_THROTTLE_SECRET || '', mail,
    authenticate: createSessionAuthMiddleware(), finishDelivery: completePublicSignupChallengeDelivery}));
  router.use(registration);
  return router;
};
