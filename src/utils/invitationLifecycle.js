export const normalizeInvitationStatus = (status) => String(status || 'unknown').trim().toLowerCase();

export const isRegisteredInvitationStatus = (status) => normalizeInvitationStatus(status) === 'registered';

export const shouldPollInvitationStatus = (status) => normalizeInvitationStatus(status) === 'pending';

export const getInvitationActionLabel = (status) => {
  const normalized = normalizeInvitationStatus(status);

  if (normalized === 'registered') {
    return null;
  }

  if (normalized === 'setup_incomplete') {
    return 'Resend Invitation';
  }

  if (['pending', 'expired', 'revoked', 'invited'].includes(normalized)) {
    return 'Resend Invitation';
  }

  return 'Send Invitation';
};
