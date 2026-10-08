import { requestMssqlApi } from './mssqlApiClient';

const parseJsonValue = (value, fallback) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeProperty = (property) => {
  if (!property || typeof property !== 'object') {
    return property;
  }

  const images = parseJsonValue(property.images, []);
  const amenities = parseJsonValue(property.amenities, []);
  const rentalvalues = parseJsonValue(property.rentalvalues, {});

  return {
    ...property,
    images: Array.isArray(images) ? images : [],
    amenities: Array.isArray(amenities) ? amenities : [],
    rentalvalues: rentalvalues && typeof rentalvalues === 'object' && !Array.isArray(rentalvalues)
      ? rentalvalues
      : {}
  };
};

export const listTenantProperties = async () => {
  const properties = await requestMssqlApi('/api/mssql/properties?pageSize=500');
  return Array.isArray(properties) ? properties.map(normalizeProperty) : [];
};

export const getTenantPropertyById = async (propertyId) => {
  if (!propertyId) {
    return null;
  }

  const property = await requestMssqlApi(`/api/mssql/properties/${encodeURIComponent(propertyId)}`);
  return normalizeProperty(property);
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
