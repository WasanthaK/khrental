const normalize = (value) => String(value || '').trim().toLowerCase();

export const isLinkedMaintenanceCompletion = ({ status, taskType, relatedEntityId } = {}) => (
  normalize(status) === 'completed'
  && normalize(taskType) === 'maintenance'
  && Boolean(relatedEntityId)
);

export const canCompleteTaskForMaintenanceStatus = (status) => (
  ['in_progress', 'completed'].includes(normalize(status))
);

export const requiresMaintenanceCompletion = (status) => normalize(status) !== 'completed';
