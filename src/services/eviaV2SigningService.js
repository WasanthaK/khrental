const EVIA_SIGN_V2_BASE_URL = 'https://evia.enadocapp.com/_apis/sign/api/v2';

const parseJsonResponse = async (response, operation) => {
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `${operation} failed with status ${response.status}`);
  }

  return data;
};

const authHeaders = (accessToken) => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: 'application/json',
  'Content-Type': 'application/json'
});

export const buildV2CreateRequestPayload = ({ documentToken, title, message }) => ({
  Title: title || 'Rental Agreement',
  Message: message || 'Please sign this document',
  Documents: [documentToken],
  AuditDetails: {
    AuthorType: 1,
    AuthorIPAddress: '',
    Device: 'KH Rentals web application'
  },
  Connections: []
});

export const buildV2SignatoryPayload = (signatory, index) => ({
  Email: signatory.email,
  Name: signatory.name,
  Order: index + 1,
  PrivateMessage: 'Please sign this document',
  SignatoryType: 1,
  Color: '#7c95f4',
  OTP: {
    IsRequired: false,
    AccessCode: '',
    Type: 1,
    MobileNumber: ''
  }
});

export const buildV2StampPayloads = (signatory, index) => ([
  {
    Identifier: signatory.textMarker || `For ${index === 0 ? 'Landlord' : 'Tenant'}:`,
    Type: 'signature'
  },
  {
    Identifier: `email${index + 1}`,
    Type: 'email'
  },
  {
    Identifier: `Date${index + 1}`,
    Type: 'date'
  }
]);

export async function createAndSendV2SignatureRequest({
  documentToken,
  title,
  message,
  signatories,
  accessToken,
  fetchImpl = fetch
}) {
  if (!documentToken) throw new Error('Evia document token is required.');
  if (!accessToken) throw new Error('Evia access token is required.');
  if (!Array.isArray(signatories) || signatories.length === 0) {
    throw new Error('At least one Evia signatory is required.');
  }

  const createResponse = await fetchImpl(`${EVIA_SIGN_V2_BASE_URL}/requests?type=0`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(buildV2CreateRequestPayload({ documentToken, title, message }))
  });
  const created = await parseJsonResponse(createResponse, 'Evia V2 request creation');
  const requestId = created.requestId || created.RequestId;
  if (!requestId) throw new Error('Evia V2 request creation returned no requestId.');

  for (let index = 0; index < signatories.length; index += 1) {
    const signatory = signatories[index];
    const signatoryResponse = await fetchImpl(
      `${EVIA_SIGN_V2_BASE_URL}/requests/${encodeURIComponent(requestId)}/signatories`,
      {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: JSON.stringify(buildV2SignatoryPayload(signatory, index))
      }
    );
    const added = await parseJsonResponse(signatoryResponse, 'Evia V2 signatory creation');
    const signatoryId = added.signatoryId || added.SignatoryId;
    if (!signatoryId) throw new Error('Evia V2 signatory creation returned no signatoryId.');

    const stampPayloads = buildV2StampPayloads(signatory, index);
    for (const stamp of stampPayloads) {
      const stampResponse = await fetchImpl(
        `${EVIA_SIGN_V2_BASE_URL}/requests/${encodeURIComponent(requestId)}/signatories/${encodeURIComponent(signatoryId)}/stamps`,
        {
          method: 'POST',
          headers: authHeaders(accessToken),
          body: JSON.stringify(stamp)
        }
      );
      await parseJsonResponse(stampResponse, `Evia V2 ${stamp.Type} stamp creation`);
    }
  }

  const sendResponse = await fetchImpl(
    `${EVIA_SIGN_V2_BASE_URL}/requests/${encodeURIComponent(requestId)}/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    }
  );
  const sent = await parseJsonResponse(sendResponse, 'Evia V2 request send');

  return {
    success: true,
    requestId: sent.requestId || sent.RequestId || requestId,
    embeddedSigningUrl: sent.embeddedSigningUrl || sent.EmbeddedSigningUrl || null,
    status: 'pending'
  };
}
