// R3 only: an opt-in, credential-gated, zero-side-effect peer observation.
// Never grants signup, creates sessions or trusts arbitrary forwarded headers.
// Disabled (404) unless a temporary Production probe credential is configured.
import { createHash, timingSafeEqual } from 'node:crypto';
import { normalizePublicSignupIp } from './publicSignupIngressGuard.js';

const SECRET_FORMAT = /^[A-Za-z0-9_-]{43}$/;
const digest = value => createHash('sha256').update(value, 'utf8').digest();

export const observeR3IngressPeer = (req, res, config = process.env) => {
  res.set('Cache-Control', 'no-store, private');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Content-Type-Options', 'nosniff');
  const disabled = () => res.status(404).json({ code: 'NOT_FOUND' });
  const secret = config.PUBLIC_SIGNUP_INGRESS_PROBE_SECRET;
  // Expire automatically if the CI runner dies before removing Azure config.
  const expiry = Number(config.PUBLIC_SIGNUP_INGRESS_PROBE_EXPIRES_AT);
  const now = Math.floor(Date.now() / 1000);
  if (typeof secret !== 'string' || !SECRET_FORMAT.test(secret) ||
      !Number.isSafeInteger(expiry) || expiry <= now || expiry > now + 3600) return disabled();
  const auth = req.headers?.authorization;
  if (req.method !== 'POST' || req.originalUrl !== '/api/internal/r3-ingress-peer' ||
      typeof auth !== 'string' || !auth.startsWith('Bearer ') ||
      !SECRET_FORMAT.test(auth.slice(7)) ||
      !timingSafeEqual(digest(auth.slice(7)), digest(secret))) return disabled();
  // No request body, no DB, no SendGrid, no mutation. This is never signup.
  if (req.headers?.['transfer-encoding'] !== undefined ||
      (req.headers?.['content-length'] !== undefined &&
       req.headers['content-length'] !== '0')) return res.status(400).json({ code: 'NO_BODY' });

  const peer = normalizePublicSignupIp(req.socket?.remoteAddress);
  const xff = [];
  for (let i = 0; i < (req.rawHeaders?.length || 0) - 1; i += 2) {
    if (String(req.rawHeaders[i]).toLowerCase() === 'x-forwarded-for') {
      xff.push(String(req.rawHeaders[i + 1]));
    }
  }
  const chain = xff.length === 1 && xff[0].length <= 2048 ? xff[0].split(',') : [];
  const rightmost = chain.length > 0 && chain.length <= 16
    ? normalizePublicSignupIp(chain[chain.length - 1].trim()) : null;
  return res.status(200).json({
    peer, rightmost, xffHeaders: xff.length, xffHops: chain.length,
    forwardedProto: req.headers?.['x-forwarded-proto'] === 'https' ? 'https' : 'other',
    source: 'server_socket_and_raw_headers'
  });
};
