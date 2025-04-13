import { supabase } from './supabaseClient';
import axios from 'axios';
import { STATUS as AGREEMENT_STATUS } from '../contexts/AgreementFormContext';
import { formatFileSize } from '../utils/helpers';
import { getSignatureStatusFromWebhooks } from '../api/evia-sign';

// Evia Sign API configuration
const EVIA_SIGN_API_BASE_URL = 'https://evia.enadocapp.com/_apis';
const EVIA_SIGN_AUTH_URL = 'https://evia.enadocapp.com/_apis';

// Load client credentials from environment variables
const EVIA_SIGN_CLIENT_ID = import.meta.env.VITE_EVIA_SIGN_CLIENT_ID || '';
const EVIA_SIGN_CLIENT_SECRET = import.meta.env.VITE_EVIA_SIGN_CLIENT_SECRET || '';

// Use a hardcoded port to ensure consistency
const EVIA_SIGN_REDIRECT_URL = typeof window !== 'undefined' 
  ? `${window.location.origin}/auth/evia-callback`
  : 'http://localhost:5173/auth/evia-callback'; // Keep this as 5173, or whatever is registered

const APP_NAME = 'Khrentals';

// Enable offline mode for testing - set to false to use the real API
const USE_OFFLINE_MODE = false;

// Add a timestamp to localStorage key to avoid conflicts
const STORAGE_KEY = 'eviaSignRequests';
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

const EVIA_API_URL = 'https://evia.enadocapp.com/_apis/sign/api';

// Helper function to ensure URL has a protocol
const ensureHttpsProtocol = (url) => {
  if (!url) return '';
  if (url.startsWith('https://')) return url;
  if (url.startsWith('http://')) return `https://${url.substring(7)}`;
  return `https://${url}`;
};

// Get the webhook URL from environment or use a fallback
const rawWebhookUrl = '';
const DEFAULT_WEBHOOK_URL = '';

// Status mappings for better compatibility
const STATUS_MAPPINGS = {
  // Webhook event ID to database status
  eventToStatus: {
    1: 'pending',
    2: 'in_progress', // We'll use this as the primary one stored in DB
    3: 'completed'
  },
  // Alternative names to standardized values
  normalize: {
    'pending_signature': 'pending',
    'partially_signed': 'in_progress',
    'signed': 'completed'
  },
  // For display purposes - from DB value to human-readable
  display: {
    'pending': 'Pending Signature',
    'in_progress': 'Partially Signed',
    'completed': 'Signed',
    'failed': 'Failed'
  }
};

// Function to normalize status values for database compatibility
function normalizeStatus(status) {
  return STATUS_MAPPINGS.normalize[status] || status;
}

// Function to get display status from database status
function getDisplayStatus(status) {
  return STATUS_MAPPINGS.display[status] || status;
}

/**
 * Get the authorization URL to redirect users for authentication
 * 
 * @returns {string} The authorization URL
 */
export function getAuthorizationUrl() {
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

    // Try different formats for the token request as the API might be strict about format
    // Let's try JSON format first - this is what the Evia docs show
    try {
      const jsonResponse = await axios.post(
        `${EVIA_SIGN_API.BASE_URL}${EVIA_SIGN_API.ENDPOINTS.TOKEN}`,
        {
        client_id: EVIA_SIGN_CLIENT_ID,
        client_secret: EVIA_SIGN_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
          redirect_uri: redirectUri
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      if (import.meta.env.DEV) {
        console.log('[eviaSignService] Token request successful');
      }
      return processTokenResponse(jsonResponse.data);
    } catch (jsonError) {
      if (import.meta.env.DEV) {
        console.warn('[eviaSignService] Trying alternative token request format');
      }
      
      // If JSON fails, try with form data
      const formData = new FormData();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', code);
      formData.append('client_id', EVIA_SIGN_CLIENT_ID);
      formData.append('client_secret', EVIA_SIGN_CLIENT_SECRET);
      formData.append('redirect_uri', redirectUri);

      const formResponse = await axios.post(
        `${EVIA_SIGN_API.BASE_URL}${EVIA_SIGN_API.ENDPOINTS.TOKEN}`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (import.meta.env.DEV) {
        console.log('[eviaSignService] Alternative token request successful');
      }
      return processTokenResponse(formResponse.data);
    }
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
 * @param {string} params.webhookUrl - URL for receiving webhook notifications
 * @param {string} params.agreementId - ID of the agreement in our system
 * @returns {Promise<Object>} - The result of the operation
 */
export async function sendDocumentForSignature(params) {
  try {
    console.log('[eviaSignService] Starting document signature process with params:', {
      title: params.title,
      documentUrl: params.documentUrl ? (typeof params.documentUrl === 'string' ? `${params.documentUrl.substring(0, 30)}...` : 'Not a string') : 'Missing',
      signatories: params.signatories ? params.signatories.length : 0,
      webhookUrl: params.webhookUrl ? 'Provided' : 'Not provided',
      completedDocumentsAttached: params.completedDocumentsAttached
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

    // Get the webhook URL - look in multiple places with clear priorities
    // 1. First use the one explicitly provided in the function params
    // 2. Then fall back to the environment variable
    // 3. Finally fall back to the default webhook URL
    const envWebhookUrl = import.meta.env.VITE_EVIA_WEBHOOK_URL || '';
    const defaultWebhookUrl = 'https://khrentals.com/api/evia-webhook';
    
    // Priority chain for webhook URL
    const webhookUrl = params.webhookUrl || params.callbackUrl || envWebhookUrl || defaultWebhookUrl;
    
    console.log('[eviaSignService] 📣 WEBHOOK URL: ' + webhookUrl);
    console.log('[eviaSignService] Webhook URL source:', 
      params.webhookUrl ? 'From params.webhookUrl' : 
      params.callbackUrl ? 'From params.callbackUrl' : 
      envWebhookUrl ? 'From environment variable' : 
      'Using default URL');
    
    // Determine whether to attach documents in webhook
    const completedDocumentsAttached = params.completedDocumentsAttached === undefined ? true : !!params.completedDocumentsAttached;
    
    // Add debugs for the webhook parameters specifically
    console.log('[eviaSignService] Setting up webhook parameters:');
    console.log('  - CallbackUrl:', webhookUrl);
    console.log('  - CompletedDocumentsAttached:', completedDocumentsAttached);

    // According to the Evia docs minimum requirement for type 3 request, using the exact format
    const requestJson = {
      "Message": params.message || "Please sign this document",
      "Title": params.title || "Rental Agreement",
      // CRITICAL: Include the webhook URL and completedDocumentsAttached parameters here
      "CallbackUrl": webhookUrl,
      "CompletedDocumentsAttached": completedDocumentsAttached,
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

    // Add webhook parameters if URL is provided
    if (webhookUrl) {
      requestJson.CallbackUrl = webhookUrl;
      requestJson.CompletedDocumentsAttached = completedDocumentsAttached;
    }

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

// Utility function to get the access token from all possible sources
const getEviaAccessToken = () => {
  // Try to get the token from import.meta.env first (Vite preferred method)
  const viteToken = import.meta.env?.VITE_EVIA_ACCESS_TOKEN;
  
  // If not found, try process.env (fallback method)
  const processToken = process.env?.VITE_EVIA_ACCESS_TOKEN;
  
  // Use the first available token or fallback to a placeholder
  const token = viteToken || processToken || "missing_token";
  
  // Log warning if using placeholder
  if (token === "missing_token") {
    console.warn("⚠️ WARNING: Using placeholder access token. Set VITE_EVIA_ACCESS_TOKEN in your .env file");
  }
  
  return token;
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

    [{
	"resource": "/c:/Users/User/khrentals/src/index.css",
	"owner": "_generated_diagnostic_collection_name_#0",
	"code": "unknownAtRules",
	"severity": 4,
	"message": "Unknown at rule @tailwind",
	"source": "css",
	"startLineNumber": 1,
	"startColumn": 1,
	"endLineNumber": 1,
	"endColumn": 10,
	"modelVersionId": 4
},{
	"resource": "/c:/Users/User/khrentals/src/index.css",
	"owner": "_generated_diagnostic_collection_name_#0",
	"code": "unknownAtRules",
	"severity": 4,
	"message": "Unknown at rule @tailwind",
	"source": "css",
	"startLineNumber": 2,
	"startColumn": 1,
	"endLineNumber": 2,
	"endColumn": 10,
	"modelVersionId": 4
},{
	"resource": "/c:/Users/User/khrentals/src/index.css",
	"owner": "_generated_diagnostic_collection_name_#0",
	"code": "unknownAtRules",
	"severity": 4,
	"message": "Unknown at rule @tailwind",
	"source": "css",
	"startLineNumber": 3,
	"startColumn": 1,
	"endLineNumber": 3,
	"endColumn": 10,
	"modelVersionId": 4
}];
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
async function getAuthToken() {
  try {
    const storedAuth = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || '{}');
    
    // Check if token exists and is not expired
    if (storedAuth.authToken && storedAuth.expiresAt && storedAuth.expiresAt > Date.now()) {
      return storedAuth.authToken;
    }
    
    // Token is expired or doesn't exist
    console.log('[eviaSignService] Auth token is missing or expired');
    return null;
  } catch (error) {
    console.error('[eviaSignService] Error getting auth token:', error);
    return null;
  }
}

/**
 * Helper function to clear the stored token
 */
function clearStoredToken() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    console.log('[eviaSignService] Cleared stored authentication token');
  } catch (error) {
    console.error('[eviaSignService] Error clearing auth token:', error);
  }
}

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
    let error;
    
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
      error = error1;
      
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
          throw error;
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
    
    // Upload to Supabase Storage
    const fileName = `signed_${requestId}_${Date.now()}.pdf`;
    const filePath = `agreements/${fileName}`;
    
    console.log(`[eviaSignService] Uploading signed document to storage: ${filePath}`);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('files')
      .upload(filePath, blob, {
        contentType: 'application/pdf',
        upsert: true
      });
      
    if (uploadError) {
      console.error('[eviaSignService] Error uploading signed document to storage:', uploadError);
      throw uploadError;
    }
    
    console.log('[eviaSignService] Signed document uploaded successfully:', uploadData);
    
    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('files')
      .getPublicUrl(filePath);
      
    if (!urlData || !urlData.publicUrl) {
      throw new Error('Failed to get public URL for signed document');
    }
    
    console.log('[eviaSignService] Signed document available at:', urlData.publicUrl);
    
    return { 
      success: true, 
      documentUrl: urlData.publicUrl,
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
        const response = await axios.post(
          `${EVIA_SIGN_API.BASE_URL}${EVIA_SIGN_API.ENDPOINTS.TOKEN}`,
          {
            client_id: EVIA_SIGN_CLIENT_ID,
            client_secret: EVIA_SIGN_CLIENT_SECRET,
            refresh_token: storedAuth.refreshToken,
            grant_type: 'refresh_token'
          }
        );

        if (response.data && response.data.authToken) {
          // Update stored auth data
          const authData = {
            authToken: response.data.authToken,
            refreshToken: response.data.refreshToken,
            expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
            userEmail: storedAuth.userEmail
          };
          
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
          console.log('[eviaSignService] Token refreshed successfully');
          return authData.authToken;
        }
      } catch (error) {
        console.error('[eviaSignService] Error refreshing token:', error);
        if (error.response) {
          console.error('[eviaSignService] Response status:', error.response.status);
          console.error('[eviaSignService] Response data:', error.response.data);
        }
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
    
    // First check the database for webhook events - this is more reliable than API calls
    // especially if the document has been deleted from Evia Sign
    try {
      const webhookResult = await getSignatureStatusFromWebhooks(requestId);
      
      // If we found status info in webhook events, use that
      if (webhookResult.success && webhookResult.fromWebhook) {
        console.log('[eviaSignService] Using status from stored webhook events:', webhookResult.status);
        return webhookResult;
      } else {
        console.log('[eviaSignService] No useful status from webhook events, will try API');
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
      
      // Try one more endpoint format as a last resort - according to older API docs
      if (apiError.response && apiError.response.status === 404) {
        try {
          // Try with just /status endpoint (lowercase)
          const statusEndpoint = `${EVIA_SIGN_API_BASE_URL}/sign/api/Drafts/${requestId}`;
          console.log('[eviaSignService] Trying draft endpoint:', statusEndpoint);
          
          const draftResponse = await axios.get(
            statusEndpoint,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          console.log('[eviaSignService] Draft check response:', draftResponse.data);
          
          return {
            success: true,
            status: draftResponse.data.status || 'unknown',
            signatories: draftResponse.data.signatories || [],
            completed: draftResponse.data.status === 'Completed',
            fromDrafts: true
          };
        } catch (draftError) {
          console.error('[eviaSignService] Draft endpoint also failed:', draftError.message);
          
          // If all API calls fail, rely on our webhook events database
          console.log('[eviaSignService] All API endpoints failed, using webhook events data exclusively');
          const webhookResult = await getSignatureStatusFromWebhooks(requestId);
          
          // If we have webhook data, use that
          if (webhookResult.success) {
            return webhookResult;
          }
          
          // If even the webhook data isn't available, check if this is a 404 Not Found
          // which likely means the document has been processed and removed from the Evia system
          if (apiError.response && apiError.response.status === 404) {
            console.log('[eviaSignService] Document likely completed and removed from Evia Sign - checking agreements table');
            
            // Check our database for the agreement status
            const { data: agreement, error } = await supabase
              .from('agreements')
              .select('status, signature_status, signatories_status')
              .eq('eviasignreference', requestId)
              .single();
            
            if (agreement && !error) {
              const status = agreement.signature_status || 'unknown';
              console.log(`[eviaSignService] Found agreement with status: ${status}`);
              
              // Return what we know from our database
              return {
                success: true, 
                status: status,
                signatories: agreement.signatories_status || [],
                completed: status === 'completed',
                fromDatabase: true
              };
            }
          }
          
          // If we can't determine the status from any source, return unknown
          return {
            success: true,
            status: 'unknown',
            signatories: [],
            completed: false,
            noDataAvailable: true
          };
        }
      }
      
      // For any other error, fall back to webhook data
      return await getSignatureStatusFromWebhooks(requestId);
    }
  } catch (error) {
    console.error('[eviaSignService] Error checking signature status:', error);
    if (error.response) {
      console.error('[eviaSignService] Response status:', error.response.status);
      console.error('[eviaSignService] Response data:', error.response.data);
    }
    
    // Always try to get webhook status as last resort
    try {
      return await getSignatureStatusFromWebhooks(requestId);
    } catch (webhookError) {
      console.error('[eviaSignService] Final fallback to webhook also failed:', webhookError);
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
export async function updateAgreementSignatureStatus(agreementId, eviaRequestId) {
  try {
    console.log(`[eviaSignService] Updating agreement ${agreementId} signature status for Evia request ${eviaRequestId}`);
    
    // First check webhook events to see if we have status information
    try {
      const { data: webhookEvents } = await supabase
        .from('webhook_events')
        .select('*')
        .eq('request_id', eviaRequestId)
        .order('event_time', { ascending: false })
        .limit(10);
      
      if (webhookEvents && webhookEvents.length > 0) {
        console.log('[eviaSignService] Found webhook events for this request, using those for status update');
        
        // Map of event IDs to statuses with corrected values that match DB constraints
        const statusMap = {
          1: 'pending',        // SignRequestReceived -> pending
          2: 'in_progress',    // SignatoryCompleted -> in_progress
          3: 'completed'       // RequestCompleted -> completed
        };
        
        // Get the most recent event with the highest event_id (completed takes precedence)
        const sortedEvents = webhookEvents.sort((a, b) => {
          // First sort by event_id in descending order (3 > 2 > 1)
          if (b.event_id !== a.event_id) {
            return b.event_id - a.event_id;
          }
          // Then by event_time (most recent first)
          return new Date(b.event_time) - new Date(a.event_time);
        });
        
        const latestEvent = sortedEvents[0];
        const signatureStatus = statusMap[latestEvent.event_id] || 'pending';
        
        // Map status to agreement.status (different from signature_status)
        let agreementStatus = null;
        if (signatureStatus === 'completed') {
          agreementStatus = 'signed';
        }
        
        console.log(`[eviaSignService] Latest webhook event: ${latestEvent.event_description}, setting signature status to ${signatureStatus}`);
        
        // Update agreement with this status
        const updates = {
          signature_status: signatureStatus,
          updatedat: new Date().toISOString()
        };
        
        // If the status is 'completed', update the agreement status too
        if (signatureStatus === 'completed') {
          updates.status = 'signed';
          
          // Try to get the signed document
          try {
            const docResult = await downloadSignedDocument(eviaRequestId);
            if (docResult.success && docResult.documentUrl) {
              updates.signatureurl = docResult.documentUrl;
            }
          } catch (docError) {
            console.error('[eviaSignService] Error downloading signed document:', docError);
          }
        }
        
        // Update in database
        return await updateAgreementStatus(agreementId, updates);
      }
    } catch (webhookError) {
      console.error('[eviaSignService] Error checking webhook events:', webhookError);
    }
    
    // If no webhook events found, proceed with API check
    // Fetch current status from Evia Sign
    const statusResult = await checkSignatureStatus(eviaRequestId);
    
    if (!statusResult.success) {
      // If the request is not found but we have the "notFound" flag, handle differently
      if (statusResult.notFound) {
        console.log('[eviaSignService] Request not found in Evia Sign. Checking for webhook events...');
        
        try {
          const { data: webhookEvents } = await supabase
            .from('webhook_events')
            .select('*')
            .eq('request_id', eviaRequestId)
            .order('event_time', { ascending: false })
            .limit(1);
            
          if (webhookEvents && webhookEvents.length > 0) {
            const latestEvent = webhookEvents[0];
            console.log(`[eviaSignService] Found webhook event ${latestEvent.event_description} for request not found in API`);
            
            // Use the webhook event to determine status - with corrected mapping
            let signatureStatus;
            switch (latestEvent.event_id) {
              case 3: signatureStatus = 'completed'; break;
              case 2: signatureStatus = 'in_progress'; break;
              default: signatureStatus = 'pending';
            }
            
            const { data: updateResult, error: updateError } = await supabase
              .from('agreements')
              .update({
                signature_status: signatureStatus,
                updatedat: new Date().toISOString()
              })
              .eq('id', agreementId)
              .select();
              
            if (updateError) {
              console.error('[eviaSignService] Error updating agreement status:', updateError);
            } else {
              console.log('[eviaSignService] Agreement updated based on webhook event:', updateResult);
            }
            
            return {
              success: true,
              message: `Status updated from webhook: ${signatureStatus}`,
              status: signatureStatus
            };
          } else {
            // If no webhook events found either, use failed status instead of error
            console.log('[eviaSignService] No webhook events found, using failed status');
            
            const { data: updateResult, error: updateError } = await supabase
              .from('agreements')
              .update({
                signature_status: 'failed',
                updatedat: new Date().toISOString()
              })
              .eq('id', agreementId)
              .select();
              
            if (updateError) {
              console.error('[eviaSignService] Error updating agreement status to failed:', updateError);
              // Try an alternative update if the first one fails
              try {
                await supabase.rpc('update_agreement_status', { 
                  agreement_id: agreementId,
                  status_value: 'failed'
                });
              } catch (rpcError) {
                console.error('[eviaSignService] RPC update also failed:', rpcError);
              }
            } else {
              console.log('[eviaSignService] Agreement updated to failed status:', updateResult);
            }
            
            return {
              success: false,
              message: statusResult.error,
              status: 'failed'
            };
          }
        } catch (webhookError) {
          console.error('[eviaSignService] Error checking webhook events:', webhookError);
          
          // Fall back to failed status if webhook check fails
          try {
            await supabase
              .from('agreements')
              .update({
                signature_status: 'failed',
                updatedat: new Date().toISOString()
              })
              .eq('id', agreementId);
              
          } catch (updateError) {
            console.error('[eviaSignService] Error updating agreement status to failed:', updateError);
          }
          
          return {
            success: false,
            message: statusResult.error,
            status: 'failed'
          };
        }
      }
      
      throw new Error(`Failed to check status: ${statusResult.error}`);
    }
  } catch (error) {
    console.error('[eviaSignService] Error updating agreement signature status:', error);
    throw error;
  }
} 