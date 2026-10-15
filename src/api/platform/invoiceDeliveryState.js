const events = Object.freeze({
  attempted: 'invoice_email_attempted',
  accepted: 'invoice_email_accepted',
  failed: 'invoice_email_failed',
  unknown: 'invoice_email_unknown'
});
export const DELIVERY_EVENTS = events;
export const deliveryOutcome = (eventType) => {
  if (eventType === events.accepted) return 'accepted';
  if (eventType === events.failed) return 'failed';
  if (eventType === events.unknown || eventType === events.attempted) return 'unknown';
  return 'not_attempted';
};
export const classifyInvoiceEmailError = error => (
  ['EMAIL_NOT_CONFIGURED', 'EMAIL_PROVIDER_REJECTED', 'REMINDER_DELIVERY_FAILED'].includes(error?.code)
    ? 'failed'
    : 'unknown'
);
