const createAccessError = (message, code, status = 403) =>
  Object.assign(new Error(message), { code, status });

/**
 * Notification reads and mark-as-read updates are always scoped to the
 * authenticated user's application ID AND active organization.
 */
export const parseNotificationPage = (query = {}) => {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 100);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    throw createAccessError('Invalid notification page request.', 'INVALID_NOTIFICATION_PAGE', 400);
  }
  return { page, pageSize };
};

export const listOwnNotificationPage = async ({ tenantId, userId, page, pageSize, query }) => {
  if (!tenantId || !userId) throw createAccessError('Authenticated tenant context is required.', 'TENANT_CONTEXT_REQUIRED');
  return query(
    `SELECT n.* FROM notifications n
     WHERE n.tenant_id = @tenantId AND n.user_id = @userId
     ORDER BY n.createdat DESC, n.id DESC
     OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
    { tenantId, userId, offset: (page - 1) * pageSize, pageSize }
  );
};

export const markOwnNotificationRead = async ({ tenantId, userId, notificationId, queryOne }) => {
  if (!tenantId || !userId) throw createAccessError('Authenticated tenant context is required.', 'TENANT_CONTEXT_REQUIRED');
  if (!notificationId) throw createAccessError('Notification ID is required.', 'INVALID_NOTIFICATION_ID', 400);
  const row = await queryOne(
    `UPDATE notifications
     SET is_read = 1, updatedat = SYSUTCDATETIME()
     OUTPUT INSERTED.*
     WHERE tenant_id = @tenantId AND user_id = @userId AND id = @notificationId`,
    { tenantId, userId, notificationId }
  );
  if (!row) throw createAccessError('Notification not found.', 'NOTIFICATION_NOT_FOUND', 404);
  return row;
};

/**
 * Generic notification fan-out may be initiated by an organization admin,
 * but the selected recipient must be an active member of the SAME tenant.
 */
export const requireNotificationTenantRecipient = async ({ tenantId, userId, queryOne }) => {
  if (!tenantId || !userId) {
    throw createAccessError('Notification recipient and tenant are required.', 'NOTIFICATION_RECIPIENT_REQUIRED');
  }
  const membership = await queryOne(
    `SELECT TOP 1 app_user_id FROM tenant_memberships
     WHERE tenant_id = @tenantId AND app_user_id = @userId AND status = 'active'`,
    { tenantId, userId }
  );
  if (!membership) {
    throw createAccessError('The notification recipient is not an active member of this organization.', 'NOTIFICATION_RECIPIENT_SCOPE_DENIED');
  }
  return true;
};
