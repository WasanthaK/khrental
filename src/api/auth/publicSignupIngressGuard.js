// B04 S3e: conservative pre-mount ingress and browser request policies.
// NOT attached to the public router while B04 SQL migrations/limiter rollout
// remain gated. Every decision fails closed on missing trust evidence.
import { isIP } from 'node:net';

const MAX_XFF_LENGTH = 2048;
const MAX_HOPS = 16;
const MAX_BODY_BYTES = 8192;
const ORIGIN = 'https://app.quixo.homes';

const normalizeIp = value => {
  if (typeof value !== 'string' || !value || value !== value.trim() ||
      value.length > 128) return null;
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6) return null;

  let normalized;
  try {
    // URL normalizes equivalent IPv6 textual representations.
    const host = new URL('http://[' + value + ']/').hostname;
    normalized = host.slice(1, -1).toLowerCase();
  } catch { return null; }

  // Azure and client networks may represent the same IPv4 address as either
  // a mapped IPv6 literal or plain IPv4. They must share a throttle bucket.
  const mapped = /^::ffff:([a-f\d]{1,4}):([a-f\d]{1,4})$/.exec(normalized);
  if (mapped) {
    const hi = Number.parseInt(mapped[1], 16);
    const lo = Number.parseInt(mapped[2], 16);
    return [hi >>> 8, hi & 255, lo >>> 8, lo & 255].join('.');
  }
  return normalized;
};

export const normalizePublicSignupIp = normalizeIp;

/**
 * Container Apps adds only its observed peer as the RIGHTMOST XFF element.
 * Client-controlled entries to the left are never authoritative.
 *
 * Two explicitly distinct trust modes:
 * (1) Exact socket allowlist, retained for proxy deployments with stable peers.
 * (2) Only AFTER independent Azure Container Apps HTTP-ingress verification,
 *     the Azure-managed edge mode trusts the RIGHTMOST XFF entry appended by
 *     that managed ingress. Azure documents that client-supplied entries are
 *     only to its left and overwrites X-Forwarded-Proto. Dynamic Envoy socket
 *     peers are not identity and MUST NOT be pinned as a stable one-IP proxy.
 *
 * The managed mode is unsafe when the application port is independently
 * reachable without Azure Envoy; it must be configured only by a governed
 * Azure ingress/configuration acceptance, never by an HTTP request header.
 * Neither mode uses req.ip, Express trust proxy, or leftmost XFF.
 */
export const createAzureSignupClientAddress = ({
  isTrustedIngressPeer, azureManagedHttpIngress = false
} = {}) => {
  if (!azureManagedHttpIngress && typeof isTrustedIngressPeer !== 'function') {
    return () => null;
  }
  return req => {
    try {
      const peer = normalizeIp(req?.socket?.remoteAddress);
      if (!peer) return null;
      if (azureManagedHttpIngress) {
        // ACA's ingress overwrites this value even when supplied by a client.
        // This check is an additional sanity condition, NOT proxy identity.
        if (req?.headers?.['x-forwarded-proto'] !== 'https') return null;
      } else if (isTrustedIngressPeer(peer, req) !== true) return null;
      if (!Array.isArray(req?.rawHeaders)) return null;
      const xffOccurrences = [];
      for (let i = 0; i < req.rawHeaders.length - 1; i += 2) {
        if (String(req.rawHeaders[i]).toLowerCase() === 'x-forwarded-for') {
          xffOccurrences.push(req.rawHeaders[i + 1]);
        }
      }
      if (xffOccurrences.length !== 1) return null;
      const header = xffOccurrences[0];
      if (typeof header !== 'string' || header.length > MAX_XFF_LENGTH) {
        return null;
      }
      const hops = header.split(',');
      if (!hops.length || hops.length > MAX_HOPS) return null;
      // Ignore spoofed left hand header entries; validate the ingress-added
      // RIGHTMOST entry and never read req.ip/req.ips or X-Real-IP.
      const rightmost = hops[hops.length - 1].trim();
      return normalizeIp(rightmost);
    } catch {
      return null;
    }
  };
};

const reject = Object.freeze({ allowed: false, status: 403 });
const accept = Object.freeze({ allowed: true, status: 200 });

/**
 * Browser registration is only a same-origin, JSON POST to the pinned HTTPS
 * Quixo domain. Run this guard *before* the JSON parser and also configure
 * that parser with an 8 KB limit; Content-Length is NOT a complete defense
 * against chunked or inconsistent bodies.
 */
export const checkPublicSignupBrowserRequest = (req, {
  allowedOrigin = ORIGIN
} = {}) => {
  try {
    const expected = new URL(allowedOrigin);
    if (expected.protocol !== 'https:' || expected.origin !== ORIGIN) {
      return reject;
    }
    const headers = req?.headers;
    if (req?.method !== 'POST' || !headers ||
        headers.origin !== ORIGIN || headers.host !== expected.host ||
        (headers['sec-fetch-site'] && headers['sec-fetch-site'] !== 'same-origin') ||
        (headers['sec-fetch-mode'] && headers['sec-fetch-mode'] !== 'cors') ||
        typeof req.originalUrl !== 'string' ||
        !/^\/api\/public-signup\/(challenge|redeem)$/.test(req.originalUrl)) {
      return reject;
    }
    const mediaType = String(headers['content-type'] || '').toLowerCase();
    if (!/^application\/json(?:;\s*charset=utf-8)?$/.test(mediaType)) {
      return reject;
    }
    // Require unambiguous Content-Length for the pre-parser admission guard.
    // A later dedicated express.json({limit:'8kb'}) is also mandatory.
    const length = headers['content-length'];
    if (typeof length !== 'string' || !/^[1-9]\d{0,5}$/.test(length) ||
        Number(length) > MAX_BODY_BYTES ||
        headers['transfer-encoding'] !== undefined) {
      return reject;
    }
    return accept;
  } catch {
    return reject;
  }
};
