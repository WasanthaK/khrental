/**
 * Read all pages from the server-authorized agreement endpoint. Never
 * display an incomplete property agreement directory as a complete list.
 * The server sorts by createdat DESC, id ASC for stable OFFSET/FETCH.
 */
export const collectAgreementPages = async (loadPage, { pageSize = 500, maxPages = 1000 } = {}) => {
  if (typeof loadPage !== 'function' || !Number.isSafeInteger(pageSize) || pageSize < 1 ||
      !Number.isSafeInteger(maxPages) || maxPages < 1) {
    throw new Error('Invalid agreement pagination configuration.');
  }

  const agreements = [];
  const seen = new Set();
  for (let page = 1; page <= maxPages; page += 1) {
    const rows = await loadPage(page, pageSize);
    if (!Array.isArray(rows) || rows.length > pageSize) {
      const error = new Error('Agreement list returned an invalid page.');
      error.code = 'INVALID_AGREEMENT_LIST_RESPONSE';
      throw error;
    }
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) ||
          typeof row.id !== 'string' || !row.id.trim() || seen.has(row.id.toLowerCase())) {
        const error = new Error('Agreement list contains an invalid or repeated record.');
        error.code = 'INVALID_AGREEMENT_LIST_RESPONSE';
        throw error;
      }
      seen.add(row.id.toLowerCase());
      agreements.push(row);
    }
    if (rows.length < pageSize) return agreements;
  }
  const error = new Error('Agreement list exceeded the supported pagination limit.');
  error.code = 'AGREEMENT_LIST_PAGINATION_LIMIT';
  throw error;
};
