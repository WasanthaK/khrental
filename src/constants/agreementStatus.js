export const AGREEMENT_STATUS = {
  DRAFT: 'draft',
  REVIEW: 'review',
  PENDING: 'pending',
  PENDING_SIGNATURE: 'pending_signature',
  SIGNED: 'signed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  TERMINATED: 'terminated'
};

export const isEditableStatus = (status) => {
  return [AGREEMENT_STATUS.DRAFT, AGREEMENT_STATUS.REVIEW].includes(status);
};

export const isSignableStatus = (status) => {
  return [AGREEMENT_STATUS.PENDING, AGREEMENT_STATUS.PENDING_SIGNATURE].includes(status);
};

export const isCompletedStatus = (status) => {
  return [AGREEMENT_STATUS.SIGNED, AGREEMENT_STATUS.CANCELLED, AGREEMENT_STATUS.EXPIRED, AGREEMENT_STATUS.TERMINATED].includes(status);
}; 