import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { closeMssqlPool, createMssqlRouter, getMssqlConfigStatus } from './src/api/mssql/index.js';
import { createPlatformRouter } from './src/api/platform/router.js';
import { createPropertyAssignmentsRouter } from './src/api/platform/propertyAssignmentsRouter.js';
import { createTenancyOnboardingRouter } from './src/api/platform/tenancyOnboardingRouter.js';
import { guardTenancyActivationQuery } from './src/api/platform/tenancyActivationGuard.js';
import { authorizePermission, authorizePlatformQuery } from './src/api/platform/authorization.js';
import { PERMISSIONS, isAdminRole } from './src/api/platform/permissionEngine.js';
import { createTenantContextMiddleware } from './src/api/tenant/context.js';
import { createSessionAuthMiddleware } from './src/api/auth/index.js';
import { createInvitationRouter } from './src/api/auth/invitationRouter.js';
import { createPasswordResetRouter } from './src/api/auth/passwordResetRouter.js';
import { createStorageDeliveryHandler } from './src/api/storage/index.js';

dotenv.config();

const getTwilioSendGridApiKey = () => process.env.TWILIO_SENDGRID_API_KEY || process.env.SENDGRID_API_KEY || '';
const getDefaultEmailSender = ({ from, fromName } = {}) => ({
  email: from || process.env.EMAIL_FROM || process.env.DEFAULT_FROM_EMAIL || process.env.VITE_EMAIL_FROM || 'noreply@khrentals.com',
  name: fromName || process.env.EMAIL_FROM_NAME || process.env.DEFAULT_FROM_NAME || process.env.VITE_EMAIL_FROM_NAME || 'KH Rentals'
});

const normalizeEmailAttachments = (attachments = []) => {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments
    .filter((attachment) => attachment && attachment.filename && attachment.content)
    .map((attachment) => ({
      content: String(attachment.content),
      filename: String(attachment.filename),
      ...(attachment.type ? { type: String(attachment.type) } : {}),
      ...(attachment.disposition ? { disposition: String(attachment.disposition) } : {}),
      ...(attachment.content_id ? { content_id: String(attachment.content_id) } : {}),
      ...(attachment.contentId ? { content_id: String(attachment.contentId) } : {})
    }));
};

async function createServer() {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const getPasswordResetBaseUrl = () => {
    const configured = process.env.PASSWORD_RESET_BASE_URL
      || process.env.PUBLIC_APP_URL
      || process.env.VITE_APP_BASE_URL
      || '';

    if (configured) {
      return configured.replace(/\/$/, '');
    }

    if (!isProduction) {
      return 'http://localhost:5174';
    }

    const error = new Error('PASSWORD_RESET_BASE_URL is required in production.');
    error.status = 503;
    error.code = 'PASSWORD_RESET_BASE_URL_REQUIRED';
    throw error;
  };

  const getEviaClientId = () => process.env.EVIA_SIGN_CLIENT_ID || process.env.VITE_EVIA_SIGN_CLIENT_ID || '';
  const getEviaClientSecret = () => process.env.EVIA_SIGN_CLIENT_SECRET || '';

  const sendEmail = async ({ to, subject, html, text, from, fromName, attachments }) => {
    const apiKey = getTwilioSendGridApiKey();
    const sender = getDefaultEmailSender({ from, fromName });
    const normalizedAttachments = normalizeEmailAttachments(attachments);

    if (!apiKey) {
      const error = new Error('Email delivery is not configured. TWILIO_SENDGRID_API_KEY is missing on the server.');
      error.status = 503;
      error.code = 'EMAIL_NOT_CONFIGURED';
      throw error;
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: sender,
        subject,
        content: [
          ...(text ? [{ type: 'text/plain', value: text }] : []),
          ...(html ? [{ type: 'text/html', value: html }] : [])
        ],
        ...(normalizedAttachments.length > 0 ? { attachments: normalizedAttachments } : {})
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `SendGrid request failed with status ${response.status}`);
    }

    return {
      success: true,
      simulated: false,
      provider: 'twilio-sendgrid',
      message: 'Email sent successfully.'
    };
  };

  const exchangeEviaToken = async ({ grantType, code, refreshToken, redirectUri }) => {
    const clientId = getEviaClientId();
    const clientSecret = getEviaClientSecret();

    if (!clientId || !clientSecret) {
      throw new Error('Evia Sign server credentials are not configured.');
    }

    const payload = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: grantType
    };

    if (grantType === 'authorization_code') {
      payload.code = code;
      payload.redirect_uri = redirectUri;
    }

    if (grantType === 'refresh_token') {
      payload.refresh_token = refreshToken;
    }

    const tokenUrl = 'https://evia.enadocapp.com/_apis/falcon/auth/api/v1/Token';

    const jsonResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (jsonResponse.ok) {
      return jsonResponse.json();
    }

    const fallbackBody = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        fallbackBody.append(key, value);
      }
    });

    const formResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: fallbackBody.toString()
    });

    if (!formResponse.ok) {
      const errorText = await formResponse.text();
      throw new Error(errorText || `Evia token request failed with status ${formResponse.status}`);
    }

    return formResponse.json();
  };

  app.use(cors({
    origin: isProduction
      ? (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin))
      : true
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', createSessionAuthMiddleware());

  const requireApiSession = (req, res, next) => {
    if (!req.authSession) {
      res.status(401).json({ error: 'Authenticated session required.', code: 'AUTH_SESSION_REQUIRED' });
      return;
    }
    next();
  };

  app.get('/api/health', (_req, res) => {
    const databaseStatus = getMssqlConfigStatus();
    res.json({
      ok: true,
      server: 'kh-rentals-dev-server',
      email: {
        configured: Boolean(getTwilioSendGridApiKey()),
        senderConfigured: Boolean(process.env.EMAIL_FROM || process.env.DEFAULT_FROM_EMAIL || process.env.VITE_EMAIL_FROM)
      },
      database: {
        configured: databaseStatus.configured,
        encrypt: databaseStatus.encrypt
      }
    });
  });

  app.post('/api/send-email', requireApiSession, async (req, res, next) => {
    try {
      const { to, subject, html, text, from, fromName, attachments } = req.body || {};

      if (!to || !subject || (!html && !text)) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: to, subject, and either html or text.'
        });
        return;
      }

      const result = await sendEmail({ to, subject, html, text, from, fromName, attachments });
      res.json({
        ...result,
        to,
        subject,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/evia/token', requireApiSession, async (req, res, next) => {
    try {
      const { grantType, code, refreshToken, redirectUri } = req.body || {};

      if (!grantType || !['authorization_code', 'refresh_token'].includes(grantType)) {
        res.status(400).json({
          success: false,
          error: 'grantType must be authorization_code or refresh_token.'
        });
        return;
      }

      if (grantType === 'authorization_code' && (!code || !redirectUri)) {
        res.status(400).json({
          success: false,
          error: 'code and redirectUri are required for authorization_code.'
        });
        return;
      }

      if (grantType === 'refresh_token' && !refreshToken) {
        res.status(400).json({
          success: false,
          error: 'refreshToken is required for refresh_token.'
        });
        return;
      }

      const data = await exchangeEviaToken({ grantType, code, refreshToken, redirectUri });
      res.json(data);
    } catch (error) {
      next(error);
    }
  });

  const resolveMssqlCompatibilityUser = createTenantContextMiddleware({
    requireUser: true,
    auditLabel: 'mssql-compatibility-admin',
    auditUnsafeOnly: false
  });

  const guardMssqlCompatibilityRoutes = (req, res, next) => {
    if (req.path === '/health' || req.path === '/me' || req.path === '/tenant-context') {
      next();
      return;
    }

    resolveMssqlCompatibilityUser(req, res, (error) => {
      if (error) {
        next(error);
        return;
      }

      const attemptsDirectActivation = req.method === 'PUT'
        && /^\/agreements\/[^/]+$/.test(req.path)
        && String(req.body?.status || '').trim().toLowerCase() === 'active';

      if (attemptsDirectActivation) {
        res.status(409).json({
          error: 'Tenancy activation must use the dedicated activation endpoint.',
          code: 'TENANCY_ACTIVATION_REQUIRED'
        });
        return;
      }

      if (isAdminRole({ user: req.user, membership: req.membership })) {
        next();
        return;
      }

      const isAgreementTemplateRead = req.method === 'GET'
        && (req.path === '/agreement-templates' || req.path.startsWith('/agreement-templates/'));

      if (isAgreementTemplateRead) {
        try {
          authorizePermission(
            { user: req.user, membership: req.membership },
            PERMISSIONS.AGREEMENTS_READ
          );
          next();
          return;
        } catch (authorizationError) {
          next(authorizationError);
          return;
        }
      }

      const compatibilityInsertTable = req.method === 'POST'
        ? ({ '/agreements': 'agreements', '/invoices': 'invoices' }[req.path] || null)
        : null;

      if (compatibilityInsertTable) {
        try {
          const authorized = authorizePlatformQuery({
            action: 'insert',
            table: compatibilityInsertTable,
            payload: req.body,
            user: req.user,
            membership: req.membership
          });
          req.body = authorized.payload;
          next();
          return;
        } catch (authorizationError) {
          next(authorizationError);
          return;
        }
      }

      res.status(403).json({
        error: 'This legacy MSSQL business route is restricted to administrators. Use the central platform API for role-scoped access.',
        code: 'CENTRAL_AUTHORIZATION_REQUIRED'
      });
    });
  };

  app.use('/api/mssql', guardMssqlCompatibilityRoutes, createMssqlRouter());
  app.use('/api/property-assignments', createPropertyAssignmentsRouter());
  app.use('/api/tenancies', createTenancyOnboardingRouter());
  app.use('/api/platform/auth', createPasswordResetRouter({ sendEmail, getBaseUrl: getPasswordResetBaseUrl }));
  app.use('/api/platform/auth', createInvitationRouter());
  app.post('/api/platform/query', guardTenancyActivationQuery);
  app.use('/api/platform', createPlatformRouter());
  app.use('/storage', createSessionAuthMiddleware({ allowStorageCookie: true }), requireApiSession);
  app.use('/storage/:bucket', createStorageDeliveryHandler());

  if (isProduction) {
    const publicPath = path.resolve(process.cwd(), 'public');
    const distPath = path.resolve(process.cwd(), 'dist');

    app.use(express.static(publicPath, { index: false }));
    app.use(express.static(distPath, { index: false }));

    app.use((req, res, next) => {
      if (!['GET', 'HEAD'].includes(req.method)) {
        next();
        return;
      }

      if (req.path === '/api' || req.path.startsWith('/api/') || req.path === '/storage' || req.path.startsWith('/storage/')) {
        next();
        return;
      }

      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true }
    });

    app.use(vite.middlewares);
  }

  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: 'API route not found'
    });
  });

  app.use((error, _req, res, _next) => {
    console.error('[Server] Unhandled API error:', error);

    res.status(Number(error?.status) || 500).json({
      error: error.message || 'Unexpected server error',
      ...(error?.code ? { code: error.code } : {}),
      ...(error?.details ? { details: error.details } : {})
    });
  });

  const port = Number(process.env.PORT) || 5174;
  const server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`[Server] Mode: ${isProduction ? 'production' : 'development'}`);
    console.log('[Server] MSSQL status:', getMssqlConfigStatus());
  });

  const shutdown = async () => {
    console.log('\n[Server] Shutting down...');
    server.close();
    await closeMssqlPool().catch((error) => {
      console.error('[Server] Error closing MSSQL pool:', error);
    });
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

createServer().catch((error) => {
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});
