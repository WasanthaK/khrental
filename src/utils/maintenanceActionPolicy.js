import { hasPermission, PERMISSIONS } from './accessPolicy.js';
import { isAdministrator } from './accessModel.js';

const sameId = (left, right) => Boolean(left && right)
  && String(left).trim().toLowerCase() === String(right).trim().toLowerCase();

// Presentation only; the lifecycle API independently authorizes every write.
export const canActOnMaintenance = ({ user, membership, request } = {}) => {
  if (!user || !request) {return false;}
  const subject = { user, membership };
  const propertyScope = isAdministrator(subject)
    || (membership?.assignedPropertyIds || []).some(id => sameId(id, request.propertyid));
  if (hasPermission(subject, PERMISSIONS.MAINTENANCE_MANAGE) && propertyScope) {return true;}
  const actorId = user.profileId || user.appUserId;
  return hasPermission(subject, PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED)
    && sameId(actorId, request.assignedto);
};
