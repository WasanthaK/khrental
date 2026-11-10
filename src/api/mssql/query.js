import { getMssqlPool, sql } from './pool.js';

const bindParams = (request, params = {}) => {
  Object.entries(params).forEach(([key, value]) => {
    request.input(key, value);
  });

  return request;
};

export const runQuery = async (queryText, params = {}, transaction = null) => {
  const request = bindParams(transaction
    ? new sql.Request(transaction)
    : (await getMssqlPool()).request(), params);
  try {
    const result = await request.query(queryText);
    return result.recordset || [];
  } catch (error) {
    if(error.number>=51070&&error.number<=51074){
      error.status=409;
      error.code='MANAGEMENT_CEASED';
      error.message='Management has ended for this property or unit. Existing records remain available.';
    }
    throw error;
  }
};

export const runSingleQuery = async (queryText, params = {}, transaction = null) => {
  const rows = await runQuery(queryText, params, transaction);
  return rows[0] || null;
};

export const paginateQuery = async ({
  baseQuery,
  orderBy,
  page = 1,
  pageSize = 50,
  params = {}
}) => {
  const safePage = Math.max(Number(page) || 1, 1);
  const safePageSize = Math.max(Number(pageSize) || 50, 1);
  const offset = (safePage - 1) * safePageSize;

  const pool = await getMssqlPool();
  const request = bindParams(pool.request(), {
    ...params,
    offset,
    pageSize: safePageSize
  });

  const result = await request.query(`
    ${baseQuery}
    ORDER BY ${orderBy}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `);

  return result.recordset || [];
};

export { sql };
