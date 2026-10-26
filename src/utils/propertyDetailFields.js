// Property records from SQL may contain JSON-serialized optional fields.
// Keep this a pure, tenant-agnostic display normalization: authorization and
// property ownership remain with the existing server-scoped directory API.
const parseJson = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

const checklistText = value => {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const label = value.label ?? value.text ?? value.name ?? value.description ?? value.title;
  return typeof label === 'string' ? label.trim() : '';
};

export const normalizePropertyChecklist = input => {
  const parsed = parseJson(input, []);
  return Array.isArray(parsed) ? parsed.map(checklistText).filter(Boolean) : [];
};

export const normalizePropertyCoordinates = (input, latitude, longitude) => {
  const parsed = parseJson(input, null);
  const value = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  const latRaw = value.lat ?? value.latitude ?? latitude;
  const lngRaw = value.lng ?? value.longitude ?? longitude;
  if (latRaw === null || latRaw === undefined || latRaw === '' ||
      lngRaw === null || lngRaw === undefined || lngRaw === '') return null;
  const lat = Number(latRaw), lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

// Stored property references can predate the app.quixo.homes domain. Render only
// known tenant-owned property image paths through this app's protected /storage
// route so its host-only storage session cookie is used. Do not rewrite SQL or
// fetch a URL at the server; external/legacy providers retain their existing URL.
export const propertyImageDisplayUrl = (input, { tenantId, appOrigin } = {}) => {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) {return '';}
  const origin = appOrigin || (typeof window !== 'undefined' ? window.location.origin : 'https://app.quixo.homes');
  let parsed;
  try {parsed = new URL(value, origin);} catch {return '';}
  const trustedOrigins = new Set([
    origin,
    'https://app.quixo.homes',
    'https://khrental-app.proudpebble-f58b5187.southeastasia.azurecontainerapps.io'
  ]);
  if (!trustedOrigins.has(parsed.origin)) {return value;}
  if (!parsed.pathname.startsWith('/storage/')) {return value;}
  // Check original syntax, before URL normalization could hide traversal.
  if (/[\\%\s]/.test(value) || /\/(?:\.|\.\.)(?:\/|$)/.test(value)
      || parsed.username || parsed.password || parsed.search || parsed.hash) {return '';}
  const match = parsed.pathname.match(/^\/storage\/images\/tenants\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/properties\/[a-z0-9_-]+\.(?:jpe?g|png|gif|webp)$/i);
  if (!match || !tenantId || match[1].toLowerCase() !== String(tenantId).toLowerCase()) {return '';}
  return parsed.pathname;
};
