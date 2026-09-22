import { requestMssqlApi } from './mssqlApiClient';

export const checkCanonicalInvitationStatus = async (userId) => {
  if (!userId) {
    return { success: false, error: 'User ID is required' };
  }

  try {
    const statusData = await requestMssqlApi(
      `/api/mssql/app-users/${encodeURIComponent(userId)}/invitation-status`,
      {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      }
    );

    if (!statusData) {
      return { success: false, error: 'User not found' };
    }

    return {
      success: true,
      data: statusData
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.status ? { status: error.status } : {})
    };
  }
};
