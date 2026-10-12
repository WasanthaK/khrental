// Pure signatory completion matching the existing Evia webhook terminal
// contract. The dormant lease path derives signer information from the
// tenant-bound stored agreement, never from untrusted delivery metadata.
export const completeStoredEviaSignatories = (stored, completedAt) => {
  if (!completedAt || Number.isNaN(Date.parse(completedAt))) {
    throw Object.assign(new Error('A valid completion timestamp is required.'), {
      code: 'EVIA_COMPLETION_TIMESTAMP_INVALID'
    });
  }
  if (!stored) return null;
  let parsed;
  try { parsed = typeof stored === 'string' ? JSON.parse(stored) : stored; }
  catch {
    throw Object.assign(new Error('Stored agreement signatories are invalid JSON.'), {
      code: 'EVIA_SIGNATORIES_STORED_INVALID'
    });
  }
  if (!Array.isArray(parsed)) {
    throw Object.assign(new Error('Stored agreement signatories must be a JSON array.'), {
      code: 'EVIA_SIGNATORIES_STORED_INVALID'
    });
  }
  if (!parsed.length) return null;
  return JSON.stringify(parsed.map(item => ({
    ...item,
    status: 'completed',
    signed_at: item?.signed_at || item?.signedAt || completedAt,
    signedAt: item?.signedAt || item?.signed_at || completedAt
  })));
};
