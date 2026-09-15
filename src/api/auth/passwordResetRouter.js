import express from 'express';
import {
  createPasswordResetRequest,
  redeemPasswordReset,
  revokePasswordResetToken,
  validatePasswordResetToken
} from './passwordResets.js';

const GENERIC_RESET_MESSAGE = 'If an account exists for that email, a password reset link has been sent.';

const buildResetEmail = ({ resetLink, expiresAt }) => {
  const expiry = expiresAt ? new Date(expiresAt).toLocaleString() : '30 minutes';

  return {
    subject: 'Reset your KH Rentals password',
    text: `A password reset was requested for your KH Rentals account. Open this link to choose a new password: ${resetLink}\n\nThis link expires at ${expiry} and can be used only once. If you did not request this reset, ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <h1 style="color: #4a90e2;">Reset your KH Rentals password</h1>
        <p>A password reset was requested for your KH Rentals account.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #4a90e2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
            Choose a New Password
          </a>
        </div>
        <p>This link expires at ${expiry} and can be used only once.</p>
        <p>If you did not request this reset, you can safely ignore this email.</p>
      </div>
    `
  };
};

export const createPasswordResetRouter = ({ sendEmail, getBaseUrl }) => {
  const router = express.Router();

  router.post('/reset-password', async (req, res, next) => {
    try {
      const email = String(req.body?.email || '').trim();
      if (!email) {
        res.status(400).json({ error: 'Email is required.', code: 'PASSWORD_RESET_EMAIL_REQUIRED' });
        return;
      }

      const request = await createPasswordResetRequest({ email });

      if (request.accountFound && request.token) {
        try {
          const baseUrl = String(getBaseUrl?.() || '').replace(/\/$/, '');
          if (!baseUrl) {
            const error = new Error('Password reset base URL is not configured.');
            error.status = 503;
            error.code = 'PASSWORD_RESET_BASE_URL_REQUIRED';
            throw error;
          }

          const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(request.token)}`;
          const emailContent = buildResetEmail({ resetLink, expiresAt: request.expiresAt });

          await sendEmail({
            to: request.email,
            ...emailContent
          });
        } catch (deliveryError) {
          await revokePasswordResetToken(request.token).catch(() => {});
          console.error('[PasswordReset] Recovery email delivery failed:', deliveryError);
          // Preserve the same public response to avoid account enumeration.
        }
      }

      res.json({
        data: {
          sent: true,
          message: GENERIC_RESET_MESSAGE
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/reset-password/validate', async (req, res, next) => {
    try {
      const result = await validatePasswordResetToken(req.query?.token);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  });

  router.post('/reset-password/redeem', async (req, res, next) => {
    try {
      const result = await redeemPasswordReset({
        token: req.body?.token,
        password: req.body?.password
      });

      res.json({
        data: {
          success: true,
          email: result.email
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
