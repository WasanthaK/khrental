// Prepare a rental signing roster before an Evia request is sent.
// Pending metadata is not proof of a completed signature or delivered email.
const nonempty = value => String(value || '').trim();

export const prepareRentalAgreementSignatories = (signatories) => {
  if (!Array.isArray(signatories) || signatories.length < 2) {
    throw new Error('A rental agreement requires both landlord and tenant signatories.');
  }
  const identifiers = new Set();
  const emails = new Set();
  const submitted = signatories.map(person => {
    const name = nonempty(person?.name);
    const email = nonempty(person?.email).toLowerCase();
    const identifier = nonempty(person?.identifier).toLowerCase();
    const textMarker = nonempty(person?.textMarker);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !identifier || !textMarker) {
      throw new Error('Every signatory needs a name, valid email, identifier and signature marker.');
    }
    if (identifiers.has(identifier) || emails.has(email)) {
      throw new Error('Signatory identifiers and email addresses must be distinct.');
    }
    identifiers.add(identifier);
    emails.add(email);
    return { name, email, identifier, textMarker };
  });
  if (!identifiers.has('landlord') || !identifiers.has('tenant')) {
    throw new Error('Both the landlord and tenant must be included in the Evia request.');
  }
  return {
    submitted,
    pending: submitted.map(({ name, email, identifier }) => ({
      name, email, type: identifier, status: 'pending'
    }))
  };
};

export const matchesPendingRentalRoster = (stored, pending) => {
  let rows;
  try { rows = typeof stored === 'string' ? JSON.parse(stored) : stored; }
  catch { return false; }
  if (!Array.isArray(rows) || rows.length !== pending.length) return false;
  return pending.every(person => rows.some(row =>
    nonempty(row.type).toLowerCase() === person.type
    && nonempty(row.email).toLowerCase() === person.email
    && nonempty(row.name) === person.name
    && nonempty(row.status).toLowerCase() === 'pending'
    && !row.signed_at && !row.signedAt
  ));
};
