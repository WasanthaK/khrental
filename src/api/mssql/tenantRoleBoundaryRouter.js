import express from 'express';

const normalizeRole = (value) => String(value || '').trim().toLowerCase();

const requestsAdministratorRole = (payload = {}) => (
  normalizeRole(payload.role) === 'admin'
  || normalizeRole(payload.user_type) === 'admin'
  || normalizeRole(payload.userType) === 'admin'
);

const denyAdministratorMutation = (req, res, next) => {
  if (!requestsAdministratorRole(req.body || {})) {
    next();
    return;
  }

  res.status(403).json({
    error: 'Tenant administrators cannot appoint tenant administrators. This action belongs to platform administration.',
    code: 'PLATFORM_ADMIN_APPOINTMENT_REQUIRED'
  });
};

export const createTenantRoleBoundaryRouter = () => {
  const router = express.Router();

  // Legacy tenant-scoped app-user mutations are still used by parts of the
  // Team UI. Keep them available for staff/contractors, but make administrator
  // appointment a platform-only operation.
  router.post('/app-users', denyAdministratorMutation);
  router.put('/app-users/:id', denyAdministratorMutation);

  return router;
};
