const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const formatAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
};

const formatDate = (value) => {
  if (!value) return 'Not specified';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toISOString().slice(0, 10);
};

export const buildPaymentReminderEmail = ({ invoice = {}, outstandingBalance = 0 } = {}) => {
  const tenantName = String(invoice.rentee_name || 'Tenant').trim() || 'Tenant';
  const propertyName = String(invoice.property_name || 'your rental property').trim() || 'your rental property';
  const billingPeriod = String(invoice.billingperiod || 'current billing period').trim();
  const invoiceReference = String(invoice.id || '').slice(0, 8) || 'invoice';
  const dueDate = formatDate(invoice.duedate);
  const amount = formatAmount(outstandingBalance);

  const subject = `KH Rentals payment reminder — ${billingPeriod}`;
  const text = [
    `Hello ${tenantName},`,
    '',
    `This is a payment reminder for invoice ${invoiceReference} for ${propertyName}.`,
    `Billing period: ${billingPeriod}`,
    `Due date: ${dueDate}`,
    `Outstanding balance: ${amount}`,
    '',
    'If you have already paid, please submit your payment proof through KH Rentals or contact your property manager.',
    '',
    'KH Rentals'
  ].join('\n');

  const html = [
    `<p>Hello ${escapeHtml(tenantName)},</p>`,
    `<p>This is a payment reminder for invoice <strong>${escapeHtml(invoiceReference)}</strong> for ${escapeHtml(propertyName)}.</p>`,
    '<ul>',
    `<li>Billing period: ${escapeHtml(billingPeriod)}</li>`,
    `<li>Due date: ${escapeHtml(dueDate)}</li>`,
    `<li>Outstanding balance: ${escapeHtml(amount)}</li>`,
    '</ul>',
    '<p>If you have already paid, please submit your payment proof through KH Rentals or contact your property manager.</p>',
    '<p>KH Rentals</p>'
  ].join('');

  return { subject, text, html };
};
