const EVIA_V1_REQUEST_URL = 'https://evia.enadocapp.com/_apis/sign/api/Requests';

const parseResponse = async (response, operation) => {
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `${operation} failed with status ${response.status}`);
  }

  return data;
};

export const buildV1AutoStampRequestPayload = ({ documentToken, title, message, signatories }) => {
  if (!documentToken) throw new Error('Evia document token is required.');
  if (!Array.isArray(signatories) || signatories.length === 0) {
    throw new Error('At least one Evia signatory is required.');
  }

  return {
    Message: message || 'Please sign this document',
    Title: title || 'Rental Agreement',
    Documents: [documentToken],
    PDFComments: [],
    Signatories: signatories.map((signatory, index) => ({
      Color: '#7c95f4',
      Email: signatory.email,
      Name: signatory.name,
      Order: index + 1,
      PrivateMessage: 'Please sign this document',
      signatoryType: 1,
      OTP: {
        IsRequired: false,
        AccessCode: '12345',
        Type: '1',
        MobileNumber: ''
      },
      AutoStamps: [
        {
          Identifier: signatory.textMarker || `For ${index === 0 ? 'Landlord' : 'Tenant'}:`,
          Color: '#7c95f4',
          Order: 1,
          Offset: {
            X_offset: 0,
            Y_offset: -50
          },
          StampSize: {
            Height: 50,
            Width: 100
          },
          Type: 'signature'
        },
        {
          Identifier: `email${index + 1}`,
          Color: '#7c95f4',
          Order: 1,
          Offset: {
            X_offset: 0,
            Y_offset: -25
          },
          StampSize: {
            Height: 50,
            Width: 100
          },
          Type: 'email'
        },
        {
          Identifier: `Date${index + 1}`,
          Color: '#7c95f4',
          Order: 1,
          Offset: {
            X_offset: 0,
            Y_offset: -25
          },
          StampSize: {
            Height: 50,
            Width: 100
          },
          Type: 'date'
        }
      ]
    })),
    AuditDetails: {
      AuthorType: 1,
      AuthorIPAddress: '',
      Device: 'KH Rentals web application'
    },
    Connections: []
  };
};

export async function createAndSendV1AutoStampRequest({
  documentToken,
  title,
  message,
  signatories,
  accessToken,
  fetchImpl = fetch
}) {
  if (!accessToken) throw new Error('Evia access token is required.');

  const requestJson = buildV1AutoStampRequestPayload({
    documentToken,
    title,
    message,
    signatories
  });

  const formData = new FormData();
  formData.append('RequestJson', JSON.stringify(requestJson));

  const response = await fetchImpl(`${EVIA_V1_REQUEST_URL}?type=3`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    },
    body: formData
  });

  const data = await parseResponse(response, 'Evia V1 AutoStamp request');
  const requestId = data?.requestId || data?.RequestId;
  if (!requestId) {
    throw new Error('Evia V1 AutoStamp request returned no requestId.');
  }

  return {
    success: true,
    requestId,
    status: 'pending'
  };
}

export { EVIA_V1_REQUEST_URL };
