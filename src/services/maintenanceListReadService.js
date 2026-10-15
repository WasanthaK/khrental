import { getApiBaseUrl } from '../utils/env';
import { buildRequestContextHeaders } from './requestContext';

export const listAuthorizedMaintenanceRequests = async () => {
  const rows = [];
  for (let offset = 0; offset <= 10000; offset += 100) {
    const response = await fetch(`${getApiBaseUrl()}/api/maintenance-lifecycle/requests?limit=100&offset=${offset}`, {
      headers: buildRequestContextHeaders()
    });
    if (!response.ok) throw new Error(`Maintenance list denied or unavailable (HTTP ${response.status})`);
    const payload = await response.json();
    if (!Array.isArray(payload?.data)) throw new Error('Invalid authorized maintenance list response');
    rows.push(...payload.data);
    if (payload.nextOffset === null) return rows;
    if (payload.nextOffset !== offset + payload.data.length || payload.data.length !== 100) {
      throw new Error('Invalid authorized maintenance pagination');
    }
  }
  throw new Error('Maintenance list exceeds the supported pagination window');
};
