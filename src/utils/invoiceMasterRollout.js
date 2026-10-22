// Invoice Designer master-data UI requires the separate master-data schema rollout.
// Keep it default-off until migrations 8/9 are verified and a customer rollout is approved.
// Vite exposes only explicitly configured VITE_ variables to the browser.
// This is a UI visibility gate, not a substitute for backend authorization.
export const isInvoiceMasterUiEnabled =
  import.meta.env?.VITE_INVOICE_MASTER_SETTINGS_ENABLED === 'true';
