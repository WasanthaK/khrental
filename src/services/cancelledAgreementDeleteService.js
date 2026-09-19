import { requestMssqlApi } from './mssqlApiClient';

export const deleteCancelledAgreement = async (agreementId) => {
  if (!agreementId) {
    throw new Error('Agreement ID is required');
  }

  return requestMssqlApi(`/api/mssql/agreements/${agreementId}`, {
    method: 'DELETE'
  });
};
