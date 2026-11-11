// Demand-driven readiness only: no idle polling and no replay of business writes.
export const createDatabaseReadiness = ({ probe, notify = () => {}, now = Date.now,
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)) }) => {
  let readyAt = null;
  let pending = null;
  return function ensureReady() {
    if (readyAt !== null && now() - readyAt < 30000) {return Promise.resolve();}
    if (pending) {return pending;}
    notify('checking');
    pending = (async () => {
      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            if (await probe()) {
              readyAt = now();
              notify('ready');
              return;
            }
          } catch { /* Network failures use the same bounded recovery state. */ }
          if (attempt < 2) {await delay(3000);}
        }
        notify('unavailable');
        throw new Error('Our helpers are taking a little longer. Please try again in a moment.');
      } finally {
        pending = null;
      }
    })();
    return pending;
  };
};

let shared;
export const ensureDatabaseReady = async () => {
  if (!shared) {
    const { getApiBaseUrl } = await import('./env.js');
    shared ||= createDatabaseReadiness({
      notify: state => window.dispatchEvent(new CustomEvent('quixo:database', { detail: state })),
      probe: async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 18000);
        try {
          const response = await fetch(getApiBaseUrl() + '/api/mssql/health', {
            credentials: 'omit', cache: 'no-store', signal: controller.signal
          });
          if (!response.ok) {return false;}
          const payload = await response.json();
          return payload.ok === true && payload.connection === 'ready';
        } finally { clearTimeout(timeout); }
      }
    });
  }
  return shared();
};
