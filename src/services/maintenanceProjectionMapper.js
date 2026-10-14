/**
 * Adapt the tenant/owner-authorized maintenance lifecycle projection to the
 * legacy page-facing request shape. Only the fields actually returned by
 * the governed endpoint may be projected; never read an alternate table.
 */
export const mapMaintenanceLifecycleProjection = (projection) => {
  const request = projection?.request;
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      !request.id || typeof request.id !== 'string' ||
      !Array.isArray(projection.images)) {
    const error = new Error('Maintenance lifecycle returned an invalid request projection.');
    error.code = 'INVALID_MAINTENANCE_PROJECTION';
    throw error;
  }

  return {
    ...request,
    property: request.propertyid ? {
      id: request.propertyid,
      name: request.property_name || null,
      address: request.property_address || null
    } : null,
    rentee: request.renteeid ? {
      id: request.renteeid,
      name: request.rentee_name || null,
      email: request.rentee_email || null
    } : null,
    assigned_staff: request.assignedto ? {
      id: request.assignedto,
      name: request.assigned_name || null
    } : null,
    maintenance_request_images: projection.images
  };
};
