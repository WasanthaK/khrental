import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { closeMssqlPool, createMssqlRouter, getMssqlConfigStatus } from './src/api/mssql/index.js';
import { runQuery, runSingleQuery } from './src/api/mssql/query.js';
import { createPlatformRouter } from './src/api/platform/router.js';
import { createPropertyAssignmentsRouter } from './src/api/platform/propertyAssignmentsRouter.js';
import { createTenancyOnboardingRouter } from './src/api/platform/tenancyOnboardingRouter.js';
import { createBillingRouter } from './src/api/platform/billingRouter.js';
import { createMonthlyBillingRouter } from './src/api/platform/monthlyBillingRouter.js';
import { createBillingAdjustmentsRouter } from './src/api/platform/billingAdjustmentsRouter.js';
import { createMaintenanceLifecycleRouter } from './src/api/platform/maintenanceLifecycleRouter.js';
import { createTenancyExitRouter } from './src/api/platform/tenancyExitRouter.js';
import { guardBillingMssqlCompatibility, guardBillingPlatformQuery } from './src/api/platform/billingMutationGuard.js';
import { guardTenancyActivationQuery } from './src/api/platform/tenancyActivationGuard.js';
import { guardTenancyClosureQuery } from './src/api/platform/tenancyClosureGuard.js';
import { authorizePermission, authorizePlatformQuery } from './src/api/platform/authorization.js';
import { PERMISSIONS, isAdminRole } from './src/api/platform/permissionEngine.js';
import { createTenantContextMiddleware } from './src/api/tenant/context.js';
import { createSessionAuthMiddleware } from './src/api/auth/index.js';
import { createInvitationRouter } from './src/api/auth/invitationRouter.js';
import { createPasswordResetRouter } from './src/api/auth/passwordResetRouter.js';
import { createStorageDeliveryHandler } from './src/api/storage/index.js';
import { createEviaCallbackToken, createEviaWebhookRouter } from './src/api/evia/webhook.js';
import { exchangeEviaV2Token } from './src/api/evia/oauthV2.js';
import { normalizeEmailAttachments, sendViaSendGrid, writeEmailDeliveryLog } from './src/api/email/sendGridDelivery.js';

dotenv.config();

const getTwilioSendGridApiKey = () => process.env.TWILIO_SENDGRID_API_KEY || process.env.SENDGRID_API_KEY || '';
const shortId = (value) => String(value || '').slice(0, 8);
const safeDiagnosticText = (value, maxLength = 250) => {
  if (value === undefined || value === null || value === '') return null;
  return String(value).slice(0, maxLength);
};
const parseDiagnosticJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};
const summarizeStoredEviaSignatories = (value) => parseDiagnosticJsonArray(value).map((entry, index) => ({
  index,
  type: safeDiagnosticText(entry?.type || entry?.identifier || entry?.role, 80),
  status: safeDiagnosticText(entry?.status, 80),
  hasSignedAt: Boolean(entry?.signed_at || entry?.signedAt)
}));
const sanitizeProviderPoll = (value = {}) => ({
  success: Boolean(value?.success),
  normalizedStatus: safeDiagnosticText(value?.normalizedStatus, 100),
  rawStatus: ['string', 'number', 'boolean'].includes(typeof value?.rawStatus)
    ? safeDiagnosticText(value.rawStatus, 100)
    : null,
  error: safeDiagnosticText(value?.error, 250),
  signatories: Array.isArray(value?.signatories)
    ? value.signatories.slice(0, 10).map((entry, index) => ({
        index: Number.isInteger(entry?.index) ? entry.index : index,
        status: safeDiagnosticText(entry?.status, 100),
        order: Number.isFinite(Number(entry?.order)) ? Number(entry.order) : null,
        keys: Array.isArray(entry?.keys)
          ? entry.keys.slice(0, 20).map((key) => safeDiagnosticText(key, 80)).filter(Boolean)
          : []
      }))
    : []
});
const parseDiagnosticObject = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_error) {
    return null;
  }
};
const getDefaultEmailSender = ({ from, fromName } = {}) => ({
  email: from || process.env.EMAIL_FROM || process.env.DEFAULT_FROM_EMAIL || process.env.VITE_EMAIL_FROM || 'noreply@khrentals.com',
  name: fromName || process.env.EMAIL_FROM_NAME || process.env.DEFAULT_FROM_NAME || process.env.VITE_EMAIL_FROM_NAME || 'KH Rentals'
});

async function createServer() {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins = String(process.env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);

  const getPasswordResetBaseUrl = () => {
    const configured = process.env.PASSWORD_RESET_BASE_URL || process.env.PUBLIC_APP_URL || process.env.VITE_APP_BASE_URL || '';
    if (configured) return configured.replace(/\/$/, '');
    if (!isProduction) return 'http://localhost:5174';
    const error = new Error('PASSWORD_RESET_BASE_URL is required in production.');
    error.status = 503;
    error.code = 'PASSWORD_RESET_BASE_URL_REQUIRED';
    throw error;
  };

  const getEviaClientId = () => process.env.EVIA_SIGN_CLIENT_ID || process.env.VITE_EVIA_SIGN_CLIENT_ID || '';
  const getEviaClientSecret = () => process.env.EVIA_SIGN_CLIENT_SECRET || '';

  const sendEmail = async ({ to, subject, html, text, from, fromName, attachments }) => sendViaSendGrid({
    apiKey: getTwilioSendGridApiKey(),
    sender: getDefaultEmailSender({ from, fromName }),
    to,
    subject,
    html,
    text,
    attachments
  });

  const exchangeEviaToken = async ({ grantType, code, refreshToken }) => exchangeEviaV2Token({
    grantType,
    code,
    refreshToken,
    clientId: getEviaClientId(),
    clientSecret: getEviaClientSecret()
  });

  app.use(cors({ origin: isProduction ? (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)) : true }));
  app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buffer) => {
      if (String(req.originalUrl || '').startsWith('/api/evia/webhook')) {
        req.rawBody = Buffer.from(buffer);
      }
    }
  }));

  app.use('/api/evia', createEviaWebhookRouter());
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
      database: { configured: databaseStatus.configured, encrypt: databaseStatus.encrypt }
    });
  });

  app.post('/api/send-email', requireApiSession, async (req, res, next) => {
    const requestId = String(req.get('x-request-id') || req.get('x-correlation-id') || `email_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
    const startedAt = Date.now();
    const { to, subject, html, text, from, fromName, attachments } = req.body || {};
    const normalizedAttachments = normalizeEmailAttachments(attachments);
    const logContext = {
      requestId,
      attachmentCount: normalizedAttachments.length,
      hasHtml: Boolean(html),
      hasText: Boolean(text)
    };

    if (!to || !subject || (!html && !text)) {
      writeEmailDeliveryLog('warn', 'email_request_rejected', {
        ...logContext,
        durationMs: Date.now() - startedAt,
        errorCode: 'EMAIL_REQUEST_INVALID'
      });
      res.status(400).json({ success: false, error: 'Missing required fields: to, subject, and either html or text.', code: 'EMAIL_REQUEST_INVALID', requestId });
      return;
    }

    try {
      const result = await sendEmail({ to, subject, html, text, from, fromName, attachments: normalizedAttachments });
      writeEmailDeliveryLog('info', 'email_provider_accepted', {
        ...logContext,
        provider: result.provider,
        providerStatus: result.providerStatus,
        providerMessageId: result.providerMessageId,
        durationMs: Date.now() - startedAt
      });
      res.json({ ...result, requestId, timestamp: new Date().toISOString() });
    } catch (error) {
      writeEmailDeliveryLog('error', 'email_provider_failed', {
        ...logContext,
        provider: error.provider,
        providerStatus: error.providerStatus,
        providerMessageId: error.providerMessageId,
        durationMs: Date.now() - startedAt,
        errorCode: error.code || 'EMAIL_PROVIDER_REQUEST_FAILED'
      });
      next(error);
    }
  });

  const resolveEviaCallbackContext = createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'evia-callback-token',
    auditUnsafeOnly: false
  });

  app.post('/api/evia/callback-token', requireApiSession, resolveEviaCallbackContext, async (req, res, next) => {
    try {
      authorizePermission(
        { user: req.user, membership: req.membership },
        PERMISSIONS.AGREEMENTS_MANAGE
      );

      const agreementId = String(req.body?.agreementId || '').trim();
      if (!agreementId) {
        res.status(400).json({ error: 'agreementId is required.', code: 'AGREEMENT_ID_REQUIRED' });
        return;
      }

      const agreement = await runSingleQuery(
        `SELECT TOP 1 id
         FROM dbo.agreements
         WHERE id = @agreementId
           AND tenant_id = @tenantId`,
        { agreementId, tenantId: req.tenantId }
      );

      if (!agreement) {
        res.status(404).json({ error: 'Agreement not found for the active tenant.', code: 'AGREEMENT_NOT_FOUND' });
        return;
      }

      const secret = process.env.EVIA_WEBHOOK_HMAC_SECRET || '';
      if (!secret) {
        res.status(503).json({ error: 'Evia callback verification is not configured.', code: 'EVIA_CALLBACK_VERIFICATION_REQUIRED' });
        return;
      }

      const expiresInSeconds = 90 * 24 * 60 * 60;
      const callbackToken = createEviaCallbackToken({
        agreementId,
        tenantId: req.tenantId,
        secret,
        expiresInSeconds
      });

      console.info('[EviaDiag] callback_token_issued', {
        agreementId: shortId(agreementId),
        tenantId: shortId(req.tenantId),
        expiresInSeconds
      });

      res.json({
        callbackToken,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  const resolveEviaDiagnosticContext = createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'evia-diagnostics',
    auditUnsafeOnly: false
  });

  app.post('/api/evia/diagnostics/poll', requireApiSession, resolveEviaDiagnosticContext, async (req, res, next) => {
    try {
      authorizePermission(
        { user: req.user, membership: req.membership },
        PERMISSIONS.AGREEMENTS_MANAGE
      );

      const agreementId = String(req.body?.agreementId || '').trim();
      if (!agreementId) {
        res.status(400).json({ error: 'agreementId is required.', code: 'AGREEMENT_ID_REQUIRED' });
        return;
      }

      const agreement = await runSingleQuery(
        `SELECT TOP 1
           id,
           tenant_id,
           status,
           signature_status,
           signatories_status,
           eviasignreference,
           signature_completed_at,
           updatedat
         FROM dbo.agreements
         WHERE id = @agreementId
           AND tenant_id = @tenantId`,
        { agreementId, tenantId: req.tenantId }
      );

      if (!agreement) {
        res.status(404).json({ error: 'Agreement not found for the active tenant.', code: 'AGREEMENT_NOT_FOUND' });
        return;
      }

      const providerPoll = sanitizeProviderPoll(req.body?.providerPoll || {});
      const requestId = String(agreement.eviasignreference || '').trim();

      if (requestId) {
        await runQuery(
          `INSERT INTO dbo.webhook_events (
             tenant_id,
             event_type,
             request_id,
             subject,
             raw_data,
             processed,
             processed_at,
             createdat,
             updatedat
           )
           VALUES (
             @tenantId,
             @eventType,
             @requestId,
             @subject,
             @rawData,
             1,
             SYSUTCDATETIME(),
             SYSUTCDATETIME(),
             SYSUTCDATETIME()
           )`,
          {
            tenantId: req.tenantId,
            eventType: 'client_status_poll',
            requestId,
            subject: 'Temporary Evia diagnostic poll',
            rawData: JSON.stringify(providerPoll)
          }
        );
      }

      const recentEvents = requestId
        ? await runQuery(
            `SELECT TOP 20
               event_type,
               event_id,
               event_time,
               processed,
               processed_at,
               createdat,
               raw_data
             FROM dbo.webhook_events
             WHERE tenant_id = @tenantId
               AND request_id = @requestId
             ORDER BY createdat DESC`,
            { tenantId: req.tenantId, requestId }
          )
        : [];

      res.json({
        agreement: {
          id: shortId(agreement.id),
          requestId: shortId(requestId),
          status: agreement.status || null,
          signatureStatus: agreement.signature_status || null,
          signatureCompletedAt: agreement.signature_completed_at || null,
          updatedAt: agreement.updatedat || null,
          storedSignatories: summarizeStoredEviaSignatories(agreement.signatories_status)
        },
        providerPoll,
        recentEvents: recentEvents.map((event) => ({
          eventType: event.event_type || null,
          eventId: event.event_id ?? null,
          eventTime: event.event_time || null,
          processed: Boolean(event.processed),
          processedAt: event.processed_at || null,
          createdAt: event.createdat || null,
          details: parseDiagnosticObject(event.raw_data)
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/evia/token', requireApiSession, async (req, res, next) => {
    try {
      const { grantType, code, refreshToken, redirectUri } = req.body || {};
      if (!grantType || !['authorization_code', 'refresh_token'].includes(grantType)) {
        res.status(400).json({ success: false, error: 'grantType must be authorization_code or refresh_token.' });
        return;
      }
      if (grantType === 'authorization_code' && (!code || !redirectUri)) {
        res.status(400).json({ success: false, error: 'code and redirectUri are required for authorization_code.' });
        return;
      }
      if (grantType === 'refresh_token' && !refreshToken) {
        res.status(400).json({ success: false, error: 'refreshToken is required for refresh_token.' });
        return;
      }
      res.json(await exchangeEviaToken({ grantType, code, refreshToken }));
    } catch (error) { next(error); }
  });

  const resolveMssqlCompatibilityUser = createTenantContextMiddleware({ requireUser: true, auditLabel: 'mssql-compatibility-admin', auditUnsafeOnly: false });
  const guardMssqlCompatibilityRoutes = (req, res, next) => {
    if (req.path === '/health' || req.path === '/me' || req.path === '/tenant-context') { next(); return; }
    resolveMssqlCompatibilityUser(req, res, (error) => {
      if (error) { next(error); return; }
      const isAgreementPut = req.method === 'PUT' && /^\/agreements\/[^/]+$/.test(req.path);
      const requestedAgreementStatus = String(req.body?.status || '').trim().toLowerCase();
      if (isAgreementPut && requestedAgreementStatus === 'active') {
        res.status(409).json({ error: 'Tenancy activation must use the dedicated activation endpoint.', code: 'TENANCY_ACTIVATION_REQUIRED' });
        return;
      }
      if (isAgreementPut && requestedAgreementStatus === 'closed') {
        res.status(409).json({ error: 'Tenancy closure must use the dedicated exit and settlement endpoint.', code: 'TENANCY_CLOSURE_REQUIRED' });
        return;
      }
      if (isAdminRole({ user: req.user, membership: req.membership })) { next(); return; }
      const isAgreementTemplateRead = req.method === 'GET' && (req.path === '/agreement-templates' || req.path.startsWith('/agreement-templates/'));
      if (isAgreementTemplateRead) {
        try {
          authorizePermission({ user: req.user, membership: req.membership }, PERMISSIONS.AGREEMENTS_READ);
          next(); return;
        } catch (authorizationError) { next(authorizationError); return; }
      }
      const compatibilityInsertTable = req.method === 'POST' ? ({ '/agreements': 'agreements' }[req.path] || null) : null;
      if (compatibilityInsertTable) {
        try {
          const authorized = authorizePlatformQuery({ action: 'insert', table: compatibilityInsertTable, payload: req.body, user: req.user, membership: req.membership });
          req.body = authorized.payload;
          next(); return;
        } catch (authorizationError) { next(authorizationError); return; }
      }
      res.status(403).json({ error: 'This legacy MSSQL business route is restricted to administrators. Use the central platform API for role-scoped access.', code: 'CENTRAL_AUTHORIZATION_REQUIRED' });
    });
  };

  app.use('/api/mssql', guardBillingMssqlCompatibility, guardMssqlCompatibilityRoutes, createMssqlRouter());
  app.use('/api/property-assignments', createPropertyAssignmentsRouter());
  app.use('/api/tenancies', createTenancyOnboardingRouter());
  app.use('/api/billing', createBillingRouter());
  app.use('/api/billing', createBillingAdjustmentsRouter());
  app.use('/api/billing', createMonthlyBillingRouter());
  app.use('/api/maintenance-lifecycle', createMaintenanceLifecycleRouter());
  app.use('/api/tenancy-exit', createTenancyExitRouter());
  app.use('/api/platform/auth', createPasswordResetRouter({ sendEmail, getBaseUrl: getPasswordResetBaseUrl }));
  app.use('/api/platform/auth', createInvitationRouter());
  app.post('/api/platform/query', guardBillingPlatformQuery);
  app.post('/api/platform/query', guardTenancyActivationQuery);
  app.post('/api/platform/query', guardTenancyClosureQuery);
  app.use('/api/platform', createPlatformRouter());
  app.use('/storage', createSessionAuthMiddleware({ allowStorageCookie: true }), requireApiSession);
  app.use('/storage/:bucket', createStorageDeliveryHandler());

  if (isProduction) {
    const publicPath = path.resolve(process.cwd(), 'public');
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(publicPath, { index: false }));
    app.use(express.static(distPath, { index: false }));
    app.use((req, res, next) => {
      if (!['GET', 'HEAD'].includes(req.method)) { next(); return; }
      if (req.path === '/api' || req.path.startsWith('/api/') || req.path === '/storage' || req.path.startsWith('/storage/')) { next(); return; }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true } });
    app.use(vite.middlewares);
  }

  app.use('/api', (_req, res) => { res.status(404).json({ error: 'API route not found' }); });
  app.use((error, _req, res, _next) => {
    console.error('[Server] Unhandled API error:', {
      message: error?.message || 'Unexpected server error',
      code: error?.code || null,
      status: Number(error?.status) || 500
    });
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
    await closeMssqlPool().catch((error) => console.error('[Server] Error closing MSSQL pool:', error));
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

createServer().catch((error) => {
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});
