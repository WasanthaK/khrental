/**
 * Public registration must never claim an existing, unlinked app user using
 * only an email address. Invitation redemption is the sole credential owner
 * for previously created tenant/rentee identities.
 *
 * Keep this independent of routing and SQL so every registration entrypoint
 * can enforce it immediately before credential creation.
 */
export const rejectPublicSignupForExistingAppUser = (existingAppUser) => {
  if (!existingAppUser) return;

  const alreadyClaimed = Boolean(existingAppUser.auth_id);
  const error = new Error(
    alreadyClaimed
      ? 'An account with this email already exists. Please sign in instead.'
      : 'This email belongs to an existing Quixo.Homes user. Use the secure invitation link to set up the account.'
  );
  error.status = 409;
  error.code = alreadyClaimed ? 'ACCOUNT_ALREADY_EXISTS' : 'INVITATION_REQUIRED';
  throw error;
};
