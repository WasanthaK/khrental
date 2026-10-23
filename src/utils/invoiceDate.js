// Match the UTC calendar date retained by the issued invoice PDF. Browser
// timezone conversion must not move a billing date to the previous day.
export const formatInvoiceDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });
};
