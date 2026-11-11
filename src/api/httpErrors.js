import {randomUUID} from 'node:crypto';

export const publicApiError = error => {
  const candidate=Number(error?.status);
  const status=Number.isInteger(candidate) && candidate>=400 && candidate<=599 ? candidate : 500;
  const requestId=randomUUID();
  if (status>=500) {return {status,body:{error:status===503
    ? 'The service is temporarily unavailable. Please try again.' : 'We couldn’t complete the request. Please try again.',
    code:status===503?'SERVICE_UNAVAILABLE':'SERVER_ERROR',requestId}};}
  return {status,body:{error:error?.message||'The request could not be completed.',
    ...(error?.code?{code:error.code}:{}),...(error?.details?{details:error.details}:{}),requestId}};
};
