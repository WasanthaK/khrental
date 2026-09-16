export const MAINTENANCE_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [MAINTENANCE_STATUS.PENDING]: new Set([
    MAINTENANCE_STATUS.IN_PROGRESS,
    MAINTENANCE_STATUS.CANCELLED
  ]),
  [MAINTENANCE_STATUS.IN_PROGRESS]: new Set([
    MAINTENANCE_STATUS.COMPLETED,
    MAINTENANCE_STATUS.CANCELLED
  ]),
  [MAINTENANCE_STATUS.COMPLETED]: new Set(),
  [MAINTENANCE_STATUS.CANCELLED]: new Set()
});

export const canTransitionMaintenanceStatus = (fromStatus, toStatus) => (
  Boolean(ALLOWED_TRANSITIONS[String(fromStatus || '').toLowerCase()]?.has(String(toStatus || '').toLowerCase()))
);

export const assertMaintenanceTransition = (fromStatus, toStatus) => {
  if (!canTransitionMaintenanceStatus(fromStatus, toStatus)) {
    const error = new Error(`Maintenance request cannot move from ${fromStatus || 'unknown'} to ${toStatus || 'unknown'}.`);
    error.status = 409;
    error.code = 'INVALID_MAINTENANCE_TRANSITION';
    throw error;
  }
};

export const canTenantCancelMaintenance = (status) => String(status || '').toLowerCase() === MAINTENANCE_STATUS.PENDING;
