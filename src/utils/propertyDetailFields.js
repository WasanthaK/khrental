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
