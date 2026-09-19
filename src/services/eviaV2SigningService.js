const EVIA_SIGN_V2_BASE_URL = 'https://evia.enadocapp.com/_apis/sign/api/v2';

const readResponseData = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json')
    ? response.json()
    : { error: await response.text() };
};

const parseJsonResponse = async (response, operation) => {
  const data = await readResponseData(response);

  if (!response.ok) {
    const error = new Error(data?.error || data?.message || `${operation} failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
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

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const addStampWithPropagationRetry = async ({
  requestId,
  signatoryId,
  stamp,
  accessToken,
  fetchImpl,
  sleepImpl,
  retryDelaysMs
}) => {
  const url = `${EVIA_SIGN_V2_BASE_URL}/requests/${encodeURIComponent(requestId)}/signatories/${encodeURIComponent(signatoryId)}/stamps`;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify(stamp)
    });

    try {
      return await parseJsonResponse(response, `Evia V2 ${stamp.Type} stamp creation`);
    } catch (error) {
      const canRetry = error.status === 404 && attempt < retryDelaysMs.length;
      if (!canRetry) {
        if (error.status === 404) {
          error.message = `${error.message} (requestId=${requestId}, signatoryId=${signatoryId})`;
        }
        throw error;
      }
      await sleepImpl(retryDelaysMs[attempt]);
    }
  }

  throw new Error('Evia V2 stamp creation exhausted retry attempts.');
};

export async function createAndSendV2SignatureRequest({
  documentToken,
  title,
  message,
  signatories,
  accessToken,
  fetchImpl = fetch,
  sleepImpl = defaultSleep,
  stampRetryDelaysMs = [250, 750, 1500]
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

  // Create every participant first. Evia can return a signatoryId before the
  // participant is immediately visible to the stamp endpoint, so keep the
  // exact IDs returned by Evia and stamp them only after participant creation
  // has completed for the request.
  const addedSignatories = [];
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
    addedSignatories.push({ signatory, index, signatoryId });
  }

  for (const { signatory, index, signatoryId } of addedSignatories) {
    const stampPayloads = buildV2StampPayloads(signatory, index);
    for (const stamp of stampPayloads) {
      await addStampWithPropagationRetry({
        requestId,
        signatoryId,
        stamp,
        accessToken,
        fetchImpl,
        sleepImpl,
        retryDelaysMs: stampRetryDelaysMs
      });
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
