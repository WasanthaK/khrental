import { PERMISSIONS, hasPermission, isAdminRole } from './permissionEngine.js';

const EVENT_LABELS = Object.freeze({
  request_created: 'request_created',
  request_assigned: 'request_assigned',
  work_started: 'work_started',
  work_completed: 'work_completed',
  request_cancelled: 'request_cancelled'
});

/**
 * Persist one in-app notice per authorized recipient in the SAME SQL
 * transaction that commits the corresponding maintenance lifecycle event.
 * No email, SMS, push, or object-storage delivery occurs here.
 */
export const writeMaintenanceNotifications = async ({
  transaction, queryTransaction, tenantId, requestId, eventType,
  propertyId, renteeId, assignedStaffId = null, previousStaffId = null
}) => {
  if (!EVENT_LABELS[eventType]) throw new Error('Unsupported maintenance notification event');
  const recipients = new Set();

  if (eventType === 'request_created') {
    // No broadcast to all staff: only administrators or managers who have
    // the property in their active assignment scope can see a new request.
    const candidates = await queryTransaction(
      transaction,
      `SELECT tm.app_user_id, tm.role, tm.permission_bundle,
              CASE WHEN EXISTS (
                SELECT 1 FROM staff_property_assignments spa
                WHERE spa.tenant_id = tm.tenant_id
                  AND spa.staff_user_id = tm.app_user_id
                  AND spa.propertyid = @propertyId AND spa.status = 'active'
              ) THEN 1 ELSE 0 END AS property_scope
       FROM tenant_memberships tm
       JOIN app_users au ON au.id = tm.app_user_id
       WHERE tm.tenant_id = @tenantId AND tm.status = 'active'
         AND au.status = 'active' AND au.active = 1`,
      { tenantId, propertyId }
    );
    for (const candidate of candidates) {
      const subject = { user: { role: candidate.role }, membership: candidate };
      if (hasPermission(subject, PERMISSIONS.MAINTENANCE_MANAGE) &&
          (isAdminRole(subject) || Boolean(candidate.property_scope))) {
        recipients.add(String(candidate.app_user_id).toLowerCase());
      }
    }
  } else {
    for (const recipient of [renteeId, assignedStaffId, previousStaffId]) {
      if (recipient) recipients.add(String(recipient).toLowerCase());
    }
  }

  // Deliberately omit description, internal comments, payment data and
  // contact details. A notification contains only the event and request id.
  const message = `Maintenance ${EVENT_LABELS[eventType]}: request ${requestId}`;
  for (const userId of recipients) {
    // Verify active membership in the current tenant at insertion time.
    // An inactive, unlinked or foreign identity gets no notification.
    await queryTransaction(
      transaction,
      `INSERT INTO notifications (tenant_id, user_id, message)
       SELECT @tenantId, @userId, @message
       WHERE EXISTS (
         SELECT 1 FROM tenant_memberships tm
         JOIN app_users au ON au.id = tm.app_user_id
         WHERE tm.tenant_id = @tenantId AND tm.app_user_id = @userId
           AND tm.status = 'active' AND au.status = 'active' AND au.active = 1
       )`,
      { tenantId, userId, message }
    );
  }
};
