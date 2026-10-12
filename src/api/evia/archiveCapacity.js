// Admission control is deliberately local to each application replica.
// Cross-replica mutual exclusion remains the SQL Server agreement-scoped lock.
// This prevents unbounded local signed-document downloads from holding the
// entire MSSQL pool while slower storage and Evia calls finish.
let activeArchives = 0;
export const DEFAULT_EVIA_ARCHIVE_CONCURRENCY = 2;

const positiveInteger = (input, fallback) => {
  const n = Number(input);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
};

export const getEviaArchiveCapacityLimit = (env = process.env) => {
  const poolMax = positiveInteger(env.MSSQL_POOL_MAX, 10);
  const requested = positiveInteger(
    env.EVIA_ARCHIVE_MAX_CONCURRENT, DEFAULT_EVIA_ARCHIVE_CONCURRENCY
  );
  // Leave at least two connections for auth, invoice and webhook claim
  // queries where the configured pool makes that possible.
  return Math.min(requested, Math.max(1, poolMax - 2));
};

export const getEviaArchiveCapacityStatus = () => ({
  active: activeArchives,
  maxConcurrent: getEviaArchiveCapacityLimit()
});

export const withEviaArchiveCapacity = async ({
  execute, maxConcurrent = getEviaArchiveCapacityLimit(), logger = console
}) => {
  if (typeof execute !== 'function') {
    throw new TypeError('Archive execute callback is required.');
  }
  if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new RangeError('Archive maximum concurrency must be a positive integer.');
  }
  if (activeArchives >= maxConcurrent) {
    logger.warn?.('[EviaArchive] capacity_rejected', {
      active: activeArchives, maxConcurrent
    });
    throw Object.assign(new Error('Evia signed-document archival is at capacity. Retry this delivery.'), {
      status: 503, code: 'EVIA_ARCHIVE_CAPACITY_EXCEEDED'
    });
  }

  activeArchives += 1;
  const start = Date.now();
  try {
    return await execute();
  } finally {
    const elapsedMs = Math.max(0, Date.now() - start);
    activeArchives -= 1;
    logger.info?.('[EviaArchive] capacity_released', {
      elapsedMs, active: activeArchives, maxConcurrent
    });
    if (elapsedMs >= 30_000) {
      logger.warn?.('[EviaArchive] long_running_archive', { elapsedMs, maxConcurrent });
    }
  }
};
