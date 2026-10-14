// Inclusive, local-calendar billing periods converted into UTC ISO boundaries.
// MSSQL invoice queries use createdat >= fromDate and <= toDate.
export const getInvoiceSummaryDateRange = (period, now = new Date()) => {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('A valid invoice summary date is required.');
  }
  const year = now.getFullYear();
  const month = now.getMonth();
  const toIso = date => date.toISOString();
  if (period === 'current_month') {
    return {
      fromDate: toIso(new Date(year, month, 1)),
      toDate: toIso(new Date(year, month + 1, 0, 23, 59, 59, 999))
    };
  }
  if (period === 'last_month') {
    return {
      fromDate: toIso(new Date(year, month - 1, 1)),
      toDate: toIso(new Date(year, month, 0, 23, 59, 59, 999))
    };
  }
  if (period === 'current_year') {
    return {
      fromDate: toIso(new Date(year, 0, 1)),
      toDate: toIso(new Date(year, 11, 31, 23, 59, 59, 999))
    };
  }
  return {};
};
