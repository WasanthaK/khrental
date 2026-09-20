import { requestMssqlApi } from './mssqlApiClient';

export const listTenantProperties = async () => {
  const properties = await requestMssqlApi('/api/mssql/properties?pageSize=500');
  return Array.isArray(properties) ? properties : [];
};

export const listTenantPropertyUnits = async (propertyId) => {
  if (!propertyId) {
    return [];
  }

  const units = await requestMssqlApi(
    `/api/mssql/property-units?propertyId=${encodeURIComponent(propertyId)}&pageSize=500`
  );

  return Array.isArray(units)
    ? [...units].sort((left, right) => String(left.unitnumber || '').localeCompare(String(right.unitnumber || ''), undefined, { numeric: true }))
    : [];
};
