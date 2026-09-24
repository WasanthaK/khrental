import express from 'express';
import { findAppUserByEmail } from '../mssql/repositories.js';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { isAdminRole } from '../platform/permissionEngine.js';
import {
  issueAuthSession,
  setStorageSessionCookie,
  updateAuthRecord,
  verifyPasswordCredential
} from './index.js';
import {
  createUserInvitation,
  redeemUserInvitation,
  validateUserInvitation
} from './invitations.js';
import { normalizeInvitationEmail } from './invitationTokens.js';

const buildAuthUser = (record) => ({
  id: record.authId,
  email: record.email,
  role: record.role || 'authenticated',
  aud: 'authenticated',
  app_metadata: {
    provider: 'local-mssql',
    role: record.role || 'authenticated'
  },
  user_metadata: record.metadata || {}
});

const buildSession = async (record) => {
  const issued = await issueAuthSession(record);
  return {
    access_token: issued.accessToken,
    token_type: 'bearer',
    expires_at: Math.floor(new Date(issued.expiresAt).getTime() / 1000),
    user: buildAuthUser(record)
  };
};

const requireAdmin = (req, res, next) => {
  if (!isAdminRole({ user: req.user, membership: req.membership })) {
    res.status(403).json({
      error: 'Administrator access is required to create invitations.',
      code: 'ADMIN_ACCESS_REQUIRED'
    });
    return;
  }
  next();
};

export const createInvitationRouter = () => {
  const router = express.Router();
  const requireAdminTenant = createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'secure-invitations'
  });

  // This guard intentionally runs before the legacy platform sign-up route.
  // A genuinely new email may continue to normal self-registration, but an
  // existing app-user identity must be claimed with a server-issued invitation.
  router.post('/sign-up', async (req, res, next) => {
    try {
      const email = normalizeInvitationEmail(req.body?.email);
      if (!email) {
        next();
        return;
      }

      const existingAppUser = await findAppUserByEmail(email);
      if (!existingAppUser) {
        next();
        return;
      }

      if (existingAppUser.auth_id) {
        res.status(409).json({
          error: 'An account with this email already exists. Please sign in instead.',
          code: 'ACCOUNT_ALREADY_EXISTS'
        });
        return;
      }

      res.status(409).json({
        error: 'This email belongs to an existing KH Rentals user. Use the secure invitation link to set up the account.',
        code: 'INVITATION_REQUIRED'
      });
    } catch (error) {
      next(error);
    }
  });

  // Backward-compatible endpoint used by platformClient.auth.admin.inviteUserByEmail.
  // Identity email is globally unique; createUserInvitation performs the
  // organization ownership/membership validation before issuing a token.
  router.post('/invite', requireAdminTenant, requireAdmin, async (req, res, next) => {
    try {
      const email = normalizeInvitationEmail(req.body?.email);
      if (!email) {
        res.status(400).json({ error: 'email is required.', code: 'INVITATION_EMAIL_REQUIRED' });
        return;
      }

      const target = await findAppUserByEmail(email);
      if (!target) {
        res.status(404).json({
          error: 'Create or attach the user to the active organization before sending an invitation.',
          code: 'INVITATION_TARGET_NOT_FOUND'
        });
        return;
      }

      const invitation = await createUserInvitation({
        tenantId: req.tenantId,
        appUserId: target.id,
        createdBy: req.user?.id || null
      });

      res.status(201).json({
        data: {
          user: {
            id: target.id,
            email: target.email,
            name: target.name,
            role: invitation.target.intendedRole,
            user_type: invitation.target.userType
          },
          invitation: {
            token: invitation.token,
            expiresAt: invitation.expiresAt
          }
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/invitations', requireAdminTenant, requireAdmin, async (req, res, next) => {
    try {
      const appUserId = req.body?.appUserId || req.body?.app_user_id;
      const invitation = await createUserInvitation({
        tenantId: req.tenantId,
        appUserId,
        createdBy: req.user?.id || null
      });

      res.status(201).json({
        data: {
          invitation: {
            token: invitation.token,
            expiresAt: invitation.expiresAt
          },
          user: invitation.target
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/invitations/validate', async (req, res, next) => {
    try {
      const result = await validateUserInvitation(String(req.query?.token || ''));
      if (!result.valid) {
        res.status(400).json({
          data: { valid: false, state: result.state },
          error: 'This invitation is invalid or no longer available.',
          code: 'INVITATION_NOT_USABLE'
        });
        return;
      }

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  });

  router.post('/invitations/redeem', async (req, res, next) => {
    try {
      const password = req.body?.password;
      let { record, invitation } = await redeemUserInvitation({
        token: req.body?.token,
        password
      });

      // Redemption is not successful until the just-persisted credential can
      // be verified through the same verifier used by normal sign-in. Repair
      // once with the submitted password if persistence produced an unusable
      // credential, then fail closed if verification still does not pass.
      if (!(await verifyPasswordCredential(record, password))) {
        record = await updateAuthRecord(record, { password });
        if (!(await verifyPasswordCredential(record, password))) {
          const error = new Error('The account was created but its credential could not be verified.');
          error.status = 500;
          error.code = 'INVITATION_CREDENTIAL_VERIFICATION_FAILED';
          throw error;
        }
      }

      // Persist a non-secret verification marker only after the credential has
      // passed the same verifier used by normal sign-in. This lets lifecycle
      // status distinguish a usable invitation-created account from legacy or
      // partially written auth records without storing password material.
      record = await updateAuthRecord(record, {
        metadata: { invitation_registration_verified: true }
      });

      const establishSession = req.body?.establishSession !== false;
      const session = establishSession ? await buildSession(record) : null;
      if (session) {
        setStorageSessionCookie(res, session);
      }

      res.status(201).json({
        data: {
          user: buildAuthUser(record),
          session,
          invitation
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
