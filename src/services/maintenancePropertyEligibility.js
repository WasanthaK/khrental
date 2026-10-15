/**
 * Convert only server-authorized active tenancy rows into maintenance choices.
 * No legacy profile associations, client-selected renter ID or property fallback.
 */
export const maintenancePropertiesFromTenancies = (payload) => {
  if (!payload || !Array.isArray(payload.tenancies)) {
    throw new Error('Invalid active tenancy response');
  }
  const byId = new Map();
  for (const row of payload.tenancies) {
    if (!row || String(row.agreement_status || '').toLowerCase() !== 'active'
      || typeof row.property_id !== 'string' || !row.property_id.trim()
      || typeof row.property_name !== 'string' || !row.property_name.trim()) {
      throw new Error('Invalid active tenancy property');
    }
    const key = row.property_id.toLowerCase();
    if (!byId.has(key)) byId.set(key, {
      id: row.property_id,
      name: row.property_name,
      address: row.property_address || null
    });
  }
  return [...byId.values()];
};
