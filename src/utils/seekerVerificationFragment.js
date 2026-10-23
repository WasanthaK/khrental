// S3c: consume an opaque verification token from the browser URL fragment.
// The fragment is never sent in the HTTP request URL; scrub it from history
// before rendering the form or invoking any network APIs.
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const consumeSeekerVerificationFragment = ({
  location, history
} = {}) => {
  const rawHash = typeof location?.hash === 'string' ? location.hash : '';
  const path = typeof location?.pathname === 'string' ? location.pathname : '';
  const search = typeof location?.search === 'string' ? location.search : '';
  const isVerificationPath = path === '/verify-email';

  if (!isVerificationPath) return null;
  let token = null;
  if (/^#token=[A-Za-z0-9_-]{43}$/.test(rawHash)) {
    const candidate = rawHash.slice('#token='.length);
    if (TOKEN.test(candidate)) token = candidate;
  }

  // This must succeed before any page can use the token. Avoid placing tokens
  // in query strings, history state, session storage or application logs.
  if (rawHash) {
    if (typeof history?.replaceState !== 'function') return null;
    try {
      history.replaceState(history.state ?? null, '', '/verify-email' + search);
    } catch {
      return null;
    }
  }
  return token;
};
