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
import { startAutomaticMonthlyBillingScheduler } from './src/api/platform/monthlyBillingScheduler.js';
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
import { retrieveAndStoreEviaCompletedDocuments } from './src/api/evia/completedDocuments.js';
import { normalizeEmailAttachments, sendViaSendGrid, writeEmailDeliveryLog } from './src/api/email/sendGridDelivery.js';

dotenv.config();

const getTwilioSendGridApiKey = () => process.env.TWILIO_SENDGRID_API_KEY || process.env.SENDGRID_API_KEY || '';
const shortId = (value) => String(value || '').slice(0, 8);
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

  const resolveEviaSignedDocumentContext = createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'evia-signed-document',
    auditUnsafeOnly: false
  });

  app.post('/api/evia/agreements/:agreementId/signed-document', requireApiSession, resolveEviaSignedDocumentContext, async (req, res, next) => {
    try {
      authorizePermission(
        { user: req.user, membership: req.membership },
        PERMISSIONS.AGREEMENTS_MANAGE
      );

      const agreementId = String(req.params?.agreementId || '').trim();
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
           eviasignreference,
           signed_document_url,
           signeddocumenturl,
           signature_pdf_url
         FROM dbo.agreements
         WHERE id = @agreementId
           AND tenant_id = @tenantId`,
        { agreementId, tenantId: req.tenantId }
      );

      if (!agreement) {
        res.status(404).json({ error: 'Agreement not found for the active tenant.', code: 'AGREEMENT_NOT_FOUND' });
        return;
      }

      const terminalStatus = ['signed', 'completed', 'active'].includes(String(agreement.status || '').toLowerCase())
        || ['signed', 'completed', 'signing_complete'].includes(String(agreement.signature_status || '').toLowerCase());

      if (!terminalStatus) {
        res.status(409).json({ error: 'The agreement is not fully signed yet.', code: 'AGREEMENT_SIGNATURE_NOT_COMPLETE' });
        return;
      }

      const existingSignedDocumentUrl = [
        agreement.signed_document_url,
        agreement.signeddocumenturl,
        agreement.signature_pdf_url
      ].find((value) => String(value || '').startsWith('/storage/documents/tenants/')) || null;

      if (existingSignedDocumentUrl) {
        res.json({
          signedDocumentUrl: existingSignedDocumentUrl,
          stored: true,
          reconciled: false
        });
        return;
      }

      const requestId = String(agreement.eviasignreference || '').trim();
      if (!requestId) {
        res.status(409).json({ error: 'The agreement has no Evia request reference.', code: 'EVIA_REQUEST_REFERENCE_MISSING' });
        return;
      }

      const accessToken = String(req.body?.accessToken || '').trim();
      if (!accessToken) {
        res.status(401).json({ error: 'Evia Sign authentication is required to retrieve the signed document.', code: 'EVIA_ACCESS_TOKEN_REQUIRED' });
        return;
      }

      const retained = await retrieveAndStoreEviaCompletedDocuments({
        requestId,
        tenantId: agreement.tenant_id,
        agreementId: agreement.id,
        accessToken
      });

      await runQuery(`
        UPDATE dbo.agreements
        SET signed_document_url = @signedDocumentUrl,
            signeddocumenturl = @signedDocumentUrl,
            signature_pdf_url = @signedDocumentUrl,
            updatedat = SYSUTCDATETIME()
        WHERE id = @agreementId
          AND tenant_id = @tenantId
          AND eviasignreference = @requestId
      `, {
        signedDocumentUrl: retained.signedDocumentUrl,
        agreementId: agreement.id,
        tenantId: agreement.tenant_id,
        requestId
      });

      console.info('[EviaDiag] signed_document_reconciled', {
        agreementId: shortId(agreement.id),
        requestId: shortId(requestId),
        signedDocumentStored: Boolean(retained.signedDocumentUrl),
        auditTrailStored: Boolean(retained.auditTrailUrl)
      });

      res.json({
        signedDocumentUrl: retained.signedDocumentUrl,
        auditTrailStored: Boolean(retained.auditTrailUrl),
        stored: true,
        reconciled: true
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
  app.use(
    '/storage/:bucket',
    (req, res, next) => {
      const parts = String(req.path || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
      const tenantIdFromPath = parts[0] === 'tenants' ? parts[1] : null;
      if (!tenantIdFromPath) {
        res.status(403).json({ error: 'Tenant-scoped storage path required.', code: 'TENANT_STORAGE_PATH_REQUIRED' });
        return;
      }
      // Express 5 exposes req.query as a getter, so do not mutate it here.
      // The tenant encoded in the storage object path is authoritative for delivery.
      req.headers['x-tenant-id'] = tenantIdFromPath;
      next();
    },
    createTenantContextMiddleware({ requireUser: true, requireTenant: true }),
    createStorageDeliveryHandler()
  );

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

  const automaticBillingEnabled = isProduction
    && String(process.env.AUTO_MONTHLY_BILLING_ENABLED || '').toLowerCase() === 'true';
  const billingScheduler = startAutomaticMonthlyBillingScheduler({
    enabled: automaticBillingEnabled,
    billingDay: process.env.AUTO_MONTHLY_BILLING_DAY || 5,
    dueDays: process.env.AUTO_MONTHLY_BILLING_DUE_DAYS || 14,
    intervalMs: process.env.AUTO_MONTHLY_BILLING_INTERVAL_MS || (60 * 60 * 1000),
    startupDelayMs: process.env.AUTO_MONTHLY_BILLING_STARTUP_DELAY_MS || 30_000
  });

  const shutdown = async () => {
    console.log('\n[Server] Shutting down...');
    billingScheduler.stop();
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
