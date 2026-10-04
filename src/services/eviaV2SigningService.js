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

const shortId = (value) => String(value || '').slice(0, 8);

export const buildV2CreateRequestPayload = ({
  documentToken,
  title,
  message,
  callbackUrl,
  callbackTypes,
  completedDocumentsAttached
}) => ({
  Title: title || 'Rental Agreement',
  Message: message || 'Please sign this document',
  Documents: [documentToken],
  ...(callbackUrl ? {
    CallbackUrl: callbackUrl,
    CallbackTypes: Array.isArray(callbackTypes) && callbackTypes.length > 0 ? callbackTypes : [0],
    CompletedDocumentsAttached: completedDocumentsAttached !== false
  } : {}),
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
  }
]);

export async function createAndSendV2SignatureRequest({
  documentToken,
  title,
  message,
  signatories,
  callbackUrl,
  callbackTypes,
  completedDocumentsAttached,
  accessToken,
  fetchImpl = fetch
}) {
  if (!documentToken) throw new Error('Evia document token is required.');
  if (!accessToken) throw new Error('Evia access token is required.');
  if (!Array.isArray(signatories) || signatories.length === 0) {
    throw new Error('At least one Evia signatory is required.');
  }

  console.info('[EviaDiag] v2_create_request_start', {
    callbackConfigured: Boolean(callbackUrl),
    callbackTypes: Array.isArray(callbackTypes) ? callbackTypes : [],
    completedDocumentsAttached: completedDocumentsAttached !== false,
    signatoryCount: signatories.length
  });

  const createResponse = await fetchImpl(`${EVIA_SIGN_V2_BASE_URL}/requests?type=0`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(buildV2CreateRequestPayload({
      documentToken,
      title,
      message,
      callbackUrl,
      callbackTypes,
      completedDocumentsAttached
    }))
  });
  const created = await parseJsonResponse(createResponse, 'Evia V2 request creation');
  const requestId = created.requestId || created.RequestId;
  if (!requestId) throw new Error('Evia V2 request creation returned no requestId.');
  console.info('[EviaDiag] v2_create_request_ok', {
    requestId: shortId(requestId),
    responseKeys: Object.keys(created || {})
  });

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
    console.info('[EviaDiag] v2_signatory_created', {
      requestId: shortId(requestId),
      signatoryIndex: index,
      signatoryId: shortId(signatoryId),
      responseKeys: Object.keys(added || {})
    });

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
  console.info('[EviaDiag] v2_send_ok', {
    requestId: shortId(sent.requestId || sent.RequestId || requestId),
    responseKeys: Object.keys(sent || {})
  });

  return {
    success: true,
    requestId: sent.requestId || sent.RequestId || requestId,
    embeddedSigningUrl: sent.embeddedSigningUrl || sent.EmbeddedSigningUrl || null,
    status: 'pending'
  };
}
