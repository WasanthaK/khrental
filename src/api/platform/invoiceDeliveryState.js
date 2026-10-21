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
  ['EMAIL_NOT_CONFIGURED', 'EMAIL_PROVIDER_REJECTED', 'REMINDER_DELIVERY_FAILED', 'INVOICE_PDF_GENERATION_FAILED'].includes(error?.code)
    ? 'failed'
    : 'unknown'
);

// Only an error before the external sender is invoked proves that NO email
// was requested. Errors after invocation retain the ambiguity of network
// timeouts unless the provider definitively rejects the message.
export const classifyInvoiceDeliveryAttemptError = (error, providerRequestStarted) =>
  providerRequestStarted === true ? classifyInvoiceEmailError(error) : 'failed';
