import { platform as platformClient } from './platformClient';
import axios from 'axios';
import { formatFileSize } from '../utils/helpers';
import { ENV, getApiBaseUrl } from '../utils/env';
import { uploadTenantFile } from './storageApiService';

// Evia Sign API configuration
const EVIA_SIGN_API_BASE_URL = 'https://evia.enadocapp.com/_apis';
const EVIA_SIGN_AUTH_URL = 'https://evia.enadocapp.com/_apis';

// Load client credentials from environment variables
const EVIA_SIGN_CLIENT_ID = ENV.EVIA_SIGN_CLIENT_ID || '';

const AUTH_STORAGE_KEY = 'eviaSignAuth';

// Constants for Evia Sign API
const EVIA_SIGN_API = {
  BASE_URL: EVIA_SIGN_API_BASE_URL,
  AUTH_URL: EVIA_SIGN_AUTH_URL,
  ENDPOINTS: {
    AUTHORIZE: '/falcon/auth/oauth2/authorize',
    TOKEN: '/falcon/auth/api/v1/Token',
    DOCUMENT_UPLOAD: '/sign/thumbs/api/Requests/document',
    SEND_REQUEST: '/sign/api/Requests',
    CHECK_STATUS: '/sign/api/Requests',
    DOWNLOAD_DOCUMENT: '/sign/api/Requests'
  }
};

const requestEviaToken = async (payload) => {
  const response = await fetch(`${getApiBaseUrl()}/api/evia/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Evia token request failed with status ${response.status}`);
  }

  return data;
};

// Helper function to ensure URL has a protocol

// Status mappings for better compatibility

// Function to normalize status values for database compatibility

// Function to get display status from database status

/**
 * Get the authorization URL to redirect users for authentication
 *
 * @returns {string} The authorization URL
 */
export function getAuthorizationUrl() {
  if (!EVIA_SIGN_CLIENT_ID) {
    throw new Error('Evia Sign Client ID is not configured for this deployment.');
  }

  // Generate a random state to prevent CSRF
  const state = Math.random().toString(36).substring(2, 15);
  localStorage.setItem('eviaSignAuthState', state);

  // Get the current origin for the redirect URL - using dynamic origin to handle port changes
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  const redirectUri = encodeURIComponent(`${currentOrigin}/auth/evia-callback`);

  // CRITICAL: Use the EXACT format from the documentation, including the misspelled "responce_type"
  // The resource parameter MUST be included - it's required by the Evia Sign API
  const url = `https://evia.enadocapp.com/_apis/falcon/auth/oauth2/authorize?application_state=external&resource=RESOURCE_APPLICATION&client_id=${EVIA_SIGN_CLIENT_ID}&responce_type=code&redirect_uri=${redirectUri}&state=${state}`;

  // Only log in development mode
  if (import.meta.env.DEV) {
    console.log('[eviaSignService] Authorization URL generated');
  }
  return url;
}

// Simplified environment check - only log once
if (import.meta.env.DEV) {
  console.log('[eviaSignService] Environment check completed');
}

/**
 * Handle the authorization callback from Evia Sign
 * @param {string} code - The authorization code
 * @returns {Promise<Object>} - Authentication result with tokens
 */
export async function handleAuthCallback(code) {
  try {
    if (import.meta.env.DEV) {
      console.log('[eviaSignService] Processing auth callback');
    }

    // Get the current redirect URI to use in token requests - matching what was used in the auth URL
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    const redirectUri = `${currentOrigin}/auth/evia-callback`;

    const tokenResponse = await requestEviaToken({
      grantType: 'authorization_code',
      code,
      redirectUri
    });

    if (import.meta.env.DEV) {
      console.log('[eviaSignService] Token request successful');
    }

    return processTokenResponse(tokenResponse);
  } catch (error) {
    console.error('[eviaSignService] Authentication error:', error.message);

    // Try to extract more specific error message if available
    let errorMessage = 'Authentication failed';
    if (error.response?.data?.error_description) {
      errorMessage += ': ' + error.response.data.error_description;
    } else if (error.response?.data?.message) {
      errorMessage += ': ' + error.response.data.message;
    } else if (error.message) {
      errorMessage += ': ' + error.message;
    }

    throw new Error(errorMessage);
  }
}

/**
 * Process token response and store authentication data
 * @param {Object} data - The token response data
 * @returns {Object} - The processed authentication data
 */
function processTokenResponse(data) {
  // Extract tokens - handle different possible response formats
  const authToken = data.authToken || data.access_token || data.token;
  const refreshToken = data.refreshToken || data.refresh_token;

  if (!authToken) {
    throw new Error('Invalid token response: missing auth token');
  }

  // Calculate expiration time (default to 24 hours if not provided)
  const expiresIn = data.expires_in || 86400; // 24 hours in seconds
  const expiresAt = Date.now() + (expiresIn * 1000);

  // Extract user email if available
  const userEmail = data.userEmail || data.email || null;

  // Store auth data in localStorage
    const authData = {
    authToken,
    refreshToken,
    expiresAt,
    userEmail
    };

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
  if (import.meta.env.DEV) {
    console.log('[eviaSignService] Auth data stored');
  }

    return authData;
}

/**
 * Upload a document to Evia Sign
 * @param {string} documentUrl - URL or base64 string of the document
 * @param {string} accessToken - Evia Sign access token
 * @returns {Promise<string>} - Document token
 */
async function uploadDocument(documentUrl, accessToken) {
  try {
    console.log('[eviaSignService] Starting document upload process...');

    // Convert URL or base64 to blob
    let documentBlob;
    let fileName;
    let mimeType;

    if (documentUrl.startsWith('data:')) {
      // Handle base64
      console.log('[eviaSignService] Processing base64 document...');
      mimeType = documentUrl.split(';')[0].split(':')[1];
      const extension = mimeType === 'application/pdf' ? 'pdf' : 
                       mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? 'docx' : 
                       'pdf';

      const base64Data = documentUrl.split(',')[1];
      const binaryData = atob(base64Data);
      const bytes = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
      }
      documentBlob = new Blob([bytes], { type: mimeType });
      fileName = `document_${Date.now()}.${extension}`;
      console.log('[eviaSignService] Created blob from base64 data with extension:', extension, 'MIME type:', mimeType);
    } else {
      // Handle URL
      console.log('[eviaSignService] Fetching document from URL:', documentUrl);
      const response = await fetch(documentUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch document: ${response.status} ${response.statusText}`);
      }
      documentBlob = await response.blob();

      // Determine the file extension and MIME type based on content type or URL
      const contentType = documentBlob.type;
      mimeType = contentType;
      let extension = 'pdf'; // Default

      // Get extension from URL as a fallback
      if (documentUrl.toLowerCase().endsWith('.docx')) {
        extension = 'docx';
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else if (documentUrl.toLowerCase().endsWith('.pdf')) {
        extension = 'pdf';
        mimeType = 'application/pdf';
      } else if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        extension = 'docx';
      } else if (contentType === 'application/pdf') {
        extension = 'pdf';
      }

      // Create a new blob with the explicit content type (required for DOCX files)
      documentBlob = new Blob([await documentBlob.arrayBuffer()], { type: mimeType });

      // According to Evia docs, keep the filename simple but include the correct extension
      fileName = `document_${Date.now()}.${extension}`;
      console.log('[eviaSignService] Fetched document with content type:', mimeType, 'extension:', extension);
    }

    console.log('[eviaSignService] Uploading document with size:', documentBlob.size, 'type:', mimeType, 'filename:', fileName);

    // IMPORTANT: The field name MUST be "File" according to the Evia Sign API documentation
    const formData = new FormData();
    formData.append('File', documentBlob, fileName);

    // Add debugging info
    console.log('[eviaSignService] FormData entries:');
    for (const [key, value] of formData.entries()) {
      console.log(`- ${key}: ${value instanceof Blob ? `Blob (${value.size} bytes, type: ${value.type})` : value}`);
    }

    // Upload document using the correct endpoint from Evia Sign documentation
    const uploadUrl = `${EVIA_SIGN_API.BASE_URL}${EVIA_SIGN_API.ENDPOINTS.DOCUMENT_UPLOAD}`;
    console.log('[eviaSignService] Sending document upload request to:', uploadUrl);

    const response = await axios.post(
      uploadUrl,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'multipart/form-data'
        },
        // Add timeout and larger maxContentLength for larger files
        timeout: 60000,
        maxContentLength: 100 * 1024 * 1024 // 100MB max
      }
    );

    console.log('[eviaSignService] Upload response status:', response.status, response.statusText);
    console.log('[eviaSignService] Upload response headers:', response.headers);
    console.log('[eviaSignService] Upload response data:', 
      typeof response.data === 'object' ? JSON.stringify(response.data) : response.data);

    // Handle response exactly as per Evia documentation
    let documentToken = '';

    if (typeof response.data === 'string') {
      // Direct token string response
      documentToken = response.data;
    } else if (typeof response.data === 'object') {
      // Object response format
      if (response.data.documentToken) {
        documentToken = response.data.documentToken;
      } else if (response.data.DocumentToken) {
        documentToken = response.data.DocumentToken;
      } else {
        // Try to extract from any other format by finding a UUID pattern
        try {
          const responseText = JSON.stringify(response.data);
          const match = responseText.match(/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/);
          if (match && match[0]) {
            documentToken = match[0];
          }
        } catch (parseError) {
          console.error('[eviaSignService] Could not parse response data:', parseError);
        }
      }
    }

    if (!documentToken) {
      console.error('[eviaSignService] Invalid upload response:', response.data);
      throw new Error('Invalid response from document upload - no document token returned');
    }

    console.log('[eviaSignService] Successfully got document token:', documentToken);
    return documentToken;
  } catch (error) {
    if (error.response) {
      console.error('[eviaSignService] Error response from server:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        headers: error.response.headers
      });
    }
    console.error('[eviaSignService] Error uploading document:', error.message);
    throw new Error(`Failed to upload document: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Send a document for signature using Evia Sign API
 * @param {Object} params - The parameters for sending a document
 * @param {string} params.documentUrl - URL or base64 string of the document
 * @param {string} params.title - Title of the signature request
 * @param {string} params.message - Message to the signatories
 * @param {Array} params.signatories - Array of signatories (name, email, identifier)
 * @param {string} params.agreementId - ID of the agreement in our system
 * @returns {Promise<Object>} - The result of the operation
 */
export async function sendDocumentForSignature(params) {
  try {
    console.log('[eviaSignService] Starting document signature process with params:', {
      title: params.title,
      documentUrl: params.documentUrl ? (typeof params.documentUrl === 'string' ? `${params.documentUrl.substring(0, 30)}...` : 'Not a string') : 'Missing',
      signatories: params.signatories ? params.signatories.length : 0
    });

    // Get access token
    const accessToken = await getAccessToken();
    console.log('[eviaSignService] Retrieved access token:', accessToken ? 'Token obtained' : 'Failed to get token');

    // Upload document
    console.log('[eviaSignService] Uploading document...');
    const documentToken = await uploadDocument(params.documentUrl, accessToken);
    console.log('[eviaSignService] Document uploaded successfully, received token:', documentToken);

    // Validate documentToken
    if (!documentToken || typeof documentToken !== 'string' || documentToken.trim() === '') {
      throw new Error('Invalid document token received from Evia Sign');
    }

    console.log('[eviaSignService] Preparing signature request with document token:', documentToken);

    // According to the Evia docs minimum requirement for type 3 request, using the exact format
    const requestJson = {
      "Message": params.message || "Please sign this document",
      "Title": params.title || "Rental Agreement",
      "Documents": [
        documentToken
      ],
      "PDFComments": [],
      "Signatories": params.signatories.map((signatory, index) => ({
        "Color": "#7c95f4",
        "Email": signatory.email,
        "Name": signatory.name,
        "Order": index + 1,
        "PrivateMessage": "Please sign this document",
        "signatoryType": 1,
        "OTP": {
          "IsRequired": false,
          "AccessCode": "12345",
          "Type": "1",
          "MobileNumber": ""
        },
        // IMPORTANT: According to the docs, each signatory needs these 3 AutoStamps types
        "AutoStamps": [
          {
            "Identifier": signatory.textMarker || `For ${index === 0 ? 'Landlord' : 'Tenant'}:`,
            "Color": "#7c95f4",
            "Order": 1,
            "Offset": {
              "X_offset": 0,
              "Y_offset": -50
            },
            "StampSize": {
              "Height": 50,
              "Width": 100
            },
            "Type": "signature"
          },
          {
            "Identifier": "email" + (index + 1),
            "Color": "#7c95f4",
            "Order": 1,
            "Offset": {
              "X_offset": 0,
              "Y_offset": -25
            },
            "StampSize": {
              "Height": 50,
              "Width": 100
            },
            "Type": "email"
          },
          {
            "Identifier": "Date" + (index + 1),
            "Color": "#7c95f4",
            "Order": 1,
            "Offset": {
              "X_offset": 0,
              "Y_offset": -25
            },
            "StampSize": {
              "Height": 50,
              "Width": 100
            },
            "Type": "date"
          }
        ]
      })),
      "AuditDetails": {
        "AuthorType": 1,
        "AuthorIPAddress": "", // Will be captured by Evia
        "Device": "Device Type: desktop - OS: Windows - Browser: Chrome"
      },
      "Connections": []
    };

    console.log('[eviaSignService] Request JSON prepared (Auto-stamping mode):', JSON.stringify(requestJson).substring(0, 200) + '...');

    // Add the request as a JSON string with the key 'RequestJson'
    const formData = new FormData();
    formData.append('RequestJson', JSON.stringify(requestJson));

    console.log('[eviaSignService] Making API request to send for signature (Auto-stamping)...');
    console.log('[eviaSignService] Endpoint:', `${EVIA_SIGN_API.BASE_URL}${EVIA_SIGN_API.ENDPOINTS.SEND_REQUEST}?type=3`);

    // IMPORTANT: Use type=3 for Auto-Stamping as per minimum requirement in documentation
    const response = await axios.post(
      `${EVIA_SIGN_API.BASE_URL}${EVIA_SIGN_API.ENDPOINTS.SEND_REQUEST}?type=3`, 
      formData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );

    console.log('[eviaSignService] Signature request successful, response:', response.data);

    return {
      success: true, 
      requestId: response.data.requestId,
      status: 'pending'
    };
  } catch (error) {
    console.error('[eviaSignService] Error sending document for signature:', error);
    if (error.response) {
      console.error('[eviaSignService] Response status:', error.response.status);
      console.error('[eviaSignService] Response data:', error.response.data);
      console.error('[eviaSignService] Response headers:', error.response.headers);
    }
    return {
      success: false, 
      error: error.message || 'Failed to send document for signature'
    };
  }
}

// Retired browser-token fallback. Current signing/recovery uses authorized
// application routes; do not resurrect a token from build-time configuration.
const getEviaAccessToken = () => {
  throw new Error('Use the authenticated Quixo signing service. Browser Evia tokens are disabled.');
};

// Get signature status
export const getSignatureStatus = async (signatureId) => {
  try {
    // Get access token from available sources
    const accessToken = getEviaAccessToken();

    // Log some debug info
    console.log(`Using Evia API endpoint for signature ID: ${signatureId}`);

    const response = await fetch(
      `https://evia.enadocapp.com/_apis/sign/api/Requests/${signatureId}/Status`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Error getting signature status: ${response.status}`);
      return { error: `Status ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error getting signature status:", error);
    return { error: error.message || "Failed to get signature status" };
  }
};

/**
 * Helper function to get the stored authentication token
 * @returns {Promise<string|null>} - The auth token or null if not authenticated
 */

/**
 * Helper function to clear the stored token
 */

/**
 * Download a signed document from Evia Sign by its request ID
 * @param {string} requestId - The Evia Sign request ID
 * @returns {Promise<Object>} - Result with document URL if successful
 */
export async function downloadSignedDocument(requestId) {
  try {
    console.log('[eviaSignService] Downloading signed document for request ID:', requestId);

    // Get access token
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Authentication required to download document');
    }

    // Try different endpoint formats due to potential inconsistency in API paths
    let response;

    try {
      // Try first format with /document at the end
      const endpoint1 = `${EVIA_SIGN_API.BASE_URL}/sign/api/Requests/${requestId}/document`;
      console.log('[eviaSignService] Trying endpoint 1:', endpoint1);

      response = await axios.get(
        endpoint1,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );
    } catch (error1) {
      console.log('[eviaSignService] Endpoint 1 failed:', error1.message);
      const originalError = error1;

      try {
        // Try second format with /Document (capital D)
        const endpoint2 = `${EVIA_SIGN_API.BASE_URL}/sign/api/Requests/${requestId}/Document`;
        console.log('[eviaSignService] Trying endpoint 2:', endpoint2);

        response = await axios.get(
          endpoint2,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer'
          }
        );
      } catch (error2) {
        console.log('[eviaSignService] Endpoint 2 also failed:', error2.message);

        // Try a third format from docs
        try {
          const endpoint3 = `${EVIA_SIGN_API.BASE_URL}/sign/api/Requests/document/${requestId}`;
          console.log('[eviaSignService] Trying endpoint 3:', endpoint3);

          response = await axios.get(
            endpoint3,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              responseType: 'arraybuffer'
            }
          );
        } catch (error3) {
          console.log('[eviaSignService] All endpoints failed. Last error:', error3.message);
          // Rethrow the original error
          throw originalError;
        }
      }
    }

    if (!response) {
      throw new Error('Failed to get document from any endpoint');
    }

    console.log('[eviaSignService] Document download response received:', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers['content-type'],
      dataSize: response.data ? response.data.byteLength : 0
    });

    if (!response.data || response.data.byteLength === 0) {
      throw new Error('Empty document data received from Evia Sign');
    }

    // Convert binary data to blob
    const blob = new Blob([response.data], {
      type: response.headers['content-type'] || 'application/pdf' 
    });

    console.log(`[eviaSignService] Created document blob with size: ${formatFileSize(blob.size)}`);

    // Upload to platform storage
    const fileName = `signed_${requestId}_${Date.now()}.pdf`;
    const filePath = `agreements/${fileName}`;

    console.log(`[eviaSignService] Uploading signed document to storage: ${filePath}`);

    const uploadedDocument = await uploadTenantFile({
      bucket: 'files',
      path: filePath,
      file: blob
    });

    if (!uploadedDocument?.url) {
      throw new Error('Failed to get storage URL for signed document');
    }

    console.log('[eviaSignService] Signed document uploaded successfully:', {
      path: uploadedDocument.path || filePath
    });
    console.log('[eviaSignService] Signed document available at:', uploadedDocument.url);

    return {
      success: true,
      documentUrl: uploadedDocument.url,
      fileName: fileName
    };
  } catch (error) {
    console.error('[eviaSignService] Error downloading signed document:', error);
    if (error.response) {
      console.error('[eviaSignService] Response status:', error.response.status);
      console.error('[eviaSignService] Response headers:', error.response.headers);
    }
    return {
      success: false, 
      error: error.message || 'Failed to download signed document'
    };
  }
}

/**
 * Get document thumbnails from Evia Sign
 * @param {string} documentToken - The document token
 * @returns {Promise<Object>} - Result with thumbnail URL if successful
 */
export async function getDocumentThumbnail(documentToken) {
  try {
    console.log('[eviaSignService] Getting thumbnail for document:', documentToken);

    // Get access token
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Authentication required to get document thumbnail');
    }

    // Request the thumbnail from Evia Sign API
      const response = await axios.get(
      `${EVIA_SIGN_API.BASE_URL}/sign/thumbs/api/Requests/document/${documentToken}/thumbnails/1`,
        {
          headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );

    console.log('[eviaSignService] Thumbnail response received:', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers['content-type'],
      dataSize: response.data ? response.data.byteLength : 0
    });

    if (!response.data || response.data.byteLength === 0) {
      throw new Error('Empty thumbnail data received from Evia Sign');
    }

    // Convert binary data to blob and create object URL
    const blob = new Blob([response.data], {
      type: response.headers['content-type'] || 'image/png' 
    });

    // Create a data URL for immediate display
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    console.log('[eviaSignService] Thumbnail created successfully');

    return {
      success: true, 
      thumbnailUrl: dataUrl,
      size: blob.size
    };
  } catch (error) {
    console.error('[eviaSignService] Error getting document thumbnail:', error);
    if (error.response) {
      console.error('[eviaSignService] Response status:', error.response.status);
      console.error('[eviaSignService] Response headers:', error.response.headers);
    }
    return {
      success: false, 
      error: error.message || 'Failed to get document thumbnail'
    };
  }
}

/**
 * Get an access token for the Evia Sign API
 * This is a private helper function
 *
 * @returns {Promise<string>} - The access token
 */
async function getAccessToken() {
  try {
    console.log('[eviaSignService] Getting access token...');
    const storedAuth = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || '{}');

    // If we have a valid token, return it
    if (storedAuth.authToken && storedAuth.expiresAt && storedAuth.expiresAt > Date.now()) {
      console.log('[eviaSignService] Using existing token, valid until:', new Date(storedAuth.expiresAt).toLocaleString());
      return storedAuth.authToken;
    }

    console.log('[eviaSignService] Token expired or missing, trying refresh...');
    // If we have a refresh token, try to refresh
    if (storedAuth.refreshToken) {
      try {
        console.log('[eviaSignService] Refreshing token using refresh_token...');
        const response = await requestEviaToken({
          grantType: 'refresh_token',
          refreshToken: storedAuth.refreshToken
        });

        if (response && response.authToken) {
          // Update stored auth data
          const authData = {
            authToken: response.authToken,
            refreshToken: response.refreshToken,
            expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
            userEmail: storedAuth.userEmail
          };

          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
          console.log('[eviaSignService] Token refreshed successfully');
          return authData.authToken;
        }
      } catch (error) {
        console.error('[eviaSignService] Error refreshing token:', error);
      }
    }

    // If we get here, we need to re-authenticate
    console.error('[eviaSignService] Authentication required - no valid token or refresh token');
    throw new Error('Authentication required');
  } catch (error) {
    console.error('[eviaSignService] Failed to get access token:', error);
    throw error;
  }
}

/**
 * Check the status of a signature request
 *
 * @param {string} requestId - The Evia Sign request ID
 * @returns {Promise<Object>} - The signature status
 */
export async function checkSignatureStatus(requestId) {
  try {
    console.log(`[eviaSignService] Checking signature status for request: ${requestId}`);

    // First check the database for webhook events directly - this is more reliable than API calls
    // especially if the document has been deleted from Evia Sign
    try {
      // Query for webhook events from our database
      const { data: webhookEvents, error: webhookError } = await platformClient
        .from('webhook_events')
        .select('*')
        .eq('request_id', requestId)
        .order('event_id', { ascending: false })
        .order('event_time', { ascending: false })
        .limit(5);

      if (webhookError) {
        throw webhookError;
      }

      // If we found webhook events, use the most recent one for status
      if (webhookEvents && webhookEvents.length > 0) {
        const latestEvent = webhookEvents[0];

        // Map event ID to status
        let status;
        switch (latestEvent.event_id) {
          case 3: status = 'completed'; break;
          case 2: status = 'in_progress'; break;
          default: status = 'pending';
        }

        console.log('[eviaSignService] Using status from stored webhook events:', status);

        return {
          success: true,
          status: status,
          fromWebhook: true,
          completed: status === 'completed',
          event: latestEvent
        };
      } else {
        console.log('[eviaSignService] No webhook events found, will try API');
      }
    } catch (webhookError) {
      console.error('[eviaSignService] Error getting status from webhook events:', webhookError);
      // Continue with API calls if webhook check fails
    }

    // Get access token for API calls
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Authentication required to check signature status');
    }

    try {
      // Use the correct Evia Sign API endpoint based on their documentation
      // First try the standard request endpoint (without /Status or /status suffix)
      const requestEndpoint = `${EVIA_SIGN_API.BASE_URL}/sign/api/Requests/${requestId}`;
      console.log('[eviaSignService] Using request endpoint:', requestEndpoint);

      const response = await axios.get(
        requestEndpoint,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('[eviaSignService] Request check response:', response.data);

      // Check if we need to get signatories separately
      let signatories = [];
      try {
        const signatoriesEndpoint = `${EVIA_SIGN_API.BASE_URL}/sign/api/Requests/${requestId}/signatories`;
        const signatoriesResponse = await axios.get(
          signatoriesEndpoint,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        signatories = signatoriesResponse.data || [];
      } catch (signatoriesError) {
        console.warn('[eviaSignService] Could not fetch signatories:', signatoriesError.message);
        // Continue without signatories data
      }

      return {
        success: true,
        status: response.data.status || 'unknown',
        signatories: signatories,
        completed: response.data.status === 'Completed'
      };
    } catch (apiError) {
      console.error('[eviaSignService] API error when checking request:', apiError.message);

      // For any other error, fall back to webhook data directly from database
      // Try to find webhook events in the database
      try {
        const { data: webhookEvents, error: webhookError } = await platformClient
          .from('webhook_events')
          .select('*')
          .eq('request_id', requestId)
          .order('event_id', { ascending: false })
          .order('event_time', { ascending: false })
          .limit(1);

        if (!webhookError && webhookEvents && webhookEvents.length > 0) {
          const latestEvent = webhookEvents[0];

          // Map event ID to status
          let status;
          switch (latestEvent.event_id) {
            case 3: status = 'completed'; break;
            case 2: status = 'in_progress'; break;
            default: status = 'pending';
          }

          return {
            success: true,
            status: status,
            fromWebhook: true,
            completed: status === 'completed',
            event: latestEvent
          };
        }
      } catch (queryError) {
        console.error('[eviaSignService] Error querying webhook events:', queryError);
      }

      // If we can't find webhook events, return unknown status
      return {
        success: true,
        status: 'unknown',
        completed: false,
        noDataAvailable: true
      };
    }
  } catch (error) {
    console.error('[eviaSignService] Error checking signature status:', error);
    if (error.response) {
      console.error('[eviaSignService] Response status:', error.response.status);
      console.error('[eviaSignService] Response data:', error.response.data);
    }

    // Always try to get webhook status directly from database as last resort
    try {
      const { data: webhookEvents, error: webhookError } = await platformClient
        .from('webhook_events')
        .select('*')
        .eq('request_id', requestId)
        .order('event_id', { ascending: false })
        .order('event_time', { ascending: false })
        .limit(1);

      if (!webhookError && webhookEvents && webhookEvents.length > 0) {
        const latestEvent = webhookEvents[0];

        // Map event ID to status
        let status;
        switch (latestEvent.event_id) {
          case 3: status = 'completed'; break;
          case 2: status = 'in_progress'; break;
          default: status = 'pending';
        }

        return {
          success: true,
          status: status,
          fromWebhook: true,
          completed: status === 'completed'
        };
      }
    } catch (webhookError) {
      console.error('[eviaSignService] Final fallback to database also failed:', webhookError);
    }

    // Return a generic error if all else fails
    return {
      success: false,
      error: error.message || 'Failed to check signature status',
      fromServer: true
    };
  }
}

/**
 * Update agreement signatures status by checking with Evia Sign
 *
 * @param {string} agreementId - The agreement ID in our system
 * @param {string} eviaRequestId - The Evia Sign request ID
 * @returns {Promise<Object>} The result of the update
 */
export async function updateAgreementSignatureStatus(_agreementId, _eviaRequestId) {
  // Compatibility only: a browser observation cannot mutate signature evidence.
  throw Object.assign(new Error('Agreement signature changes require the verified server workflow.'), {
    code: 'AGREEMENT_SIGNING_AUTHORITY_REQUIRED'
  });
}
