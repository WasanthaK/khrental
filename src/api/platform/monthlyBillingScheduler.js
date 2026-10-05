import { runQuery } from '../mssql/query.js';
import { generateMonthlyInvoicesForTenant } from './monthlyBillingService.js';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_BILLING_DAY = 1;

const toPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const getAutomaticBillingPeriod = (now = new Date()) => (
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
);

export const shouldRunAutomaticBilling = ({
  now = new Date(),
  billingDay = DEFAULT_BILLING_DAY
} = {}) => now.getUTCDate() >= toPositiveInteger(billingDay, DEFAULT_BILLING_DAY);

export const runAutomaticMonthlyBilling = async ({
  now = new Date(),
  billingDay = DEFAULT_BILLING_DAY,
  dueDays = 14,
  logger = console
} = {}) => {
  if (!shouldRunAutomaticBilling({ now, billingDay })) {
    return {
      billingPeriod: getAutomaticBillingPeriod(now),
      skipped: true,
      reason: 'before_billing_day',
      tenants: []
    };
  }

  const billingPeriod = getAutomaticBillingPeriod(now);
  const dueDate = new Date(now);
  dueDate.setUTCDate(dueDate.getUTCDate() + toPositiveInteger(dueDays, 14));

  const tenants = await runQuery(
    `SELECT id
     FROM tenants
     WHERE [status] IS NULL OR [status] = 'active'
     ORDER BY createdat, id`
  );

  const tenantResults = [];
  for (const tenant of tenants) {
    try {
      const result = await generateMonthlyInvoicesForTenant({
        tenantId: tenant.id,
        billingPeriod,
        dueDate: dueDate.toISOString(),
        actorUserId: null,
        notes: 'Automatically generated monthly tenancy invoice.',
        source: 'automatic_scheduler'
      });

      tenantResults.push({
        tenantId: tenant.id,
        created: result.created.length,
        skipped: result.skipped.length,
        errors: result.errors
      });

      logger.info('[BillingScheduler] tenant_complete', {
        tenantId: tenant.id,
        billingPeriod,
        created: result.created.length,
        skipped: result.skipped.length,
        errors: result.errors.length
      });
    } catch (error) {
      tenantResults.push({
        tenantId: tenant.id,
        created: 0,
        skipped: 0,
        errors: [{ error: error.message, code: error.code || null }]
      });
      logger.error('[BillingScheduler] tenant_failed', {
        tenantId: tenant.id,
        billingPeriod,
        error: error.message,
        code: error.code || null
      });
    }
  }

  return {
    billingPeriod,
    skipped: false,
    tenants: tenantResults
  };
};

export const startAutomaticMonthlyBillingScheduler = ({
  enabled = false,
  intervalMs = DEFAULT_INTERVAL_MS,
  billingDay = DEFAULT_BILLING_DAY,
  dueDays = 14,
  startupDelayMs = 30_000,
  logger = console
} = {}) => {
  if (!enabled) {
    logger.info('[BillingScheduler] disabled');
    return { stop: () => {} };
  }

  let running = false;
  let stopped = false;

  const run = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await runAutomaticMonthlyBilling({ billingDay, dueDays, logger });
    } catch (error) {
      logger.error('[BillingScheduler] run_failed', {
        error: error.message,
        code: error.code || null
      });
    } finally {
      running = false;
    }
  };

  const startupTimer = setTimeout(() => {
    run().catch(() => {});
  }, Math.max(0, Number(startupDelayMs) || 0));
  startupTimer.unref?.();

  const interval = setInterval(() => {
    run().catch(() => {});
  }, Math.max(60_000, Number(intervalMs) || DEFAULT_INTERVAL_MS));
  interval.unref?.();

  logger.info('[BillingScheduler] enabled', {
    billingDay: toPositiveInteger(billingDay, DEFAULT_BILLING_DAY),
    dueDays: toPositiveInteger(dueDays, 14),
    intervalMs: Math.max(60_000, Number(intervalMs) || DEFAULT_INTERVAL_MS)
  });

  return {
    stop: () => {
      stopped = true;
      clearTimeout(startupTimer);
      clearInterval(interval);
    }
  };
};
