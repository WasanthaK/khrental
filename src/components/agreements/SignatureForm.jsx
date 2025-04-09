import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { 
  sendDocumentForSignature, 
  getSignatureStatus, 
  downloadSignedDocument, 
  getAuthorizationUrl,
  handleAuthCallback as eviaAuthCallback 
} from '../../services/eviaSignService';
import { supabase } from '../../services/supabaseClient';
import Button from '../ui/Button';
import { toast } from 'react-hot-toast';

// Use the same storage key as the service
const STORAGE_KEY = 'eviaSignRequests';
const AUTH_STORAGE_KEY = 'eviaSignAuth';

const SignatureForm = ({ 
  agreement = {}, 
  onSubmit = () => {}, 
  onSuccess = () => {}, 
  onCancel = () => {}, 
  currentUser = {} 
}) => {
  // Debug logging at component mount
  console.log('SignatureForm MOUNTED with props:', {
    agreement,
    currentUser,
    hasOnSubmit: typeof onSubmit === 'function',
    hasOnSuccess: typeof onSuccess === 'function',
    hasOnCancel: typeof onCancel === 'function'
  });

  // Validate required data
  useEffect(() => {
    if (!agreement?.id) {
      console.error('SignatureForm: No agreement provided');
      toast.error('Missing agreement data');
      onCancel();
      return;
    }
    
    if (!currentUser?.id) {
      console.error('SignatureForm: No currentUser provided');
      toast.error('Missing user data');
      onCancel();
      return;
    }
  }, [agreement, currentUser]);

  const [title, setTitle] = useState(() => {
    const propertyName = agreement?.property?.name || 'Property';
    return `Rental Agreement - ${propertyName}`;
  });

  const [message, setMessage] = useState(() => {
    const propertyName = agreement?.property?.name || 'the property';
    return `Please sign this rental agreement for ${propertyName}`;
  });

  const [signatories, setSignatories] = useState([
    {
      name: currentUser?.name || '',
      email: currentUser?.email || '',
      identifier: 'landlord',
      textMarker: 'For Landlord:'
    },
    {
      name: '',
      email: '',
      identifier: 'tenant',
      textMarker: 'For Tenant:'
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEviaAuthenticated, setIsEviaAuthenticated] = useState(false);
  const [eviaUserEmail, setEviaUserEmail] = useState(null);
  const [supabaseSession, setSupabaseSession] = useState(null);
  const [showAuthIframe, setShowAuthIframe] = useState(false);
  const [authUrl, setAuthUrl] = useState('');

  // Debug logging
  useEffect(() => {
    console.log('SignatureForm mounted with:', {
      agreement,
      currentUser,
      signatories
    });
  }, [agreement, currentUser, signatories]);

  // Check Supabase authentication status
  useEffect(() => {
    const checkSupabaseAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error checking Supabase auth:', error);
          setError('Authentication error: ' + error.message);
          return;
        }
        if (!session) {
          console.error('No Supabase session found');
          setError('Please log in to continue');
          
          // Only redirect if we're not in the middle of Evia Sign auth
          const isEviaAuthInProgress = sessionStorage.getItem('eviaAuthInProgress');
          if (!isEviaAuthInProgress) {
            const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = `/login?returnUrl=${returnUrl}`;
          }
          return;
        }
        setSupabaseSession(session);
        console.log('Supabase session:', session);
      } catch (err) {
        console.error('Error in checkSupabaseAuth:', err);
        setError('Authentication error: ' + err.message);
      }
    };

    checkSupabaseAuth();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session);
      if (event === 'SIGNED_OUT') {
        setError('Please log in to continue');
        setSupabaseSession(null);
        
        // Only redirect if we're not in the middle of Evia Sign auth
        const isEviaAuthInProgress = sessionStorage.getItem('eviaAuthInProgress');
        if (!isEviaAuthInProgress) {
          const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/login?returnUrl=${returnUrl}`;
        }
      } else if (event === 'SIGNED_IN') {
        setError('');
        setSupabaseSession(session);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Check if we're returning from Evia Sign auth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    
    if (code && state) {
      // Verify state to prevent CSRF
      const savedState = localStorage.getItem('eviaSignAuthState');
      if (state !== savedState) {
        setError('Invalid authentication state');
        return;
      }

      // Process the authentication callback
      eviaAuthCallback(code)
        .then(result => {
          setIsEviaAuthenticated(true);
          setEviaUserEmail(result.userEmail);
          setError('');
          
          // Restore form state if needed
          const savedState = JSON.parse(sessionStorage.getItem('signatureFormState') || '{}');
          if (savedState.title) {
            setTitle(savedState.title);
          }
          if (savedState.message) {
            setMessage(savedState.message);
          }
          if (savedState.signatories) {
            setSignatories(savedState.signatories);
          }
          
          // Clean up storage
          sessionStorage.removeItem('signatureFormState');
          
          // Remove the code and state from URL
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        })
        .catch(error => {
          console.error('Error processing auth callback:', error);
          setError('Authentication failed: ' + error.message);
          setIsEviaAuthenticated(false);
          setEviaUserEmail(null);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, []);

  // Check Evia Sign authentication status on mount
  useEffect(() => {
    const storedAuth = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || '{}');
    if (storedAuth.authToken && storedAuth.expiresAt && storedAuth.expiresAt > Date.now()) {
      setIsEviaAuthenticated(true);
      setEviaUserEmail(storedAuth.userEmail); // Store the Evia user email
    } else {
      setIsEviaAuthenticated(false);
      setEviaUserEmail(null);
    }
  }, []);

  // Load tenant data when component mounts
  useEffect(() => {
    console.log('Agreement data received:', agreement);
    
    const fetchTenantData = async () => {
      if (!agreement?.renteeid) {
        console.error('No tenant ID provided in agreement');
        return;
      }

      try {
        // Fetch the tenant details
        const { data: renteeData, error } = await supabase
          .from('app_users')
          .select('*')
          .eq('id', agreement.renteeid)
          .single();
          
        if (error) {
          console.error('Error fetching tenant details:', error);
          toast.error('Failed to load tenant details');
          return;
        }
        
        console.log('Fetched tenant data:', renteeData);
        
        if (!renteeData) {
          console.error('No tenant data found');
          toast.error('Tenant data not found');
          return;
        }

        // Update signatories with landlord (current user) and tenant data
        setSignatories(prev => [
          {
            // Landlord (current user)
            name: currentUser?.name || prev[0].name,
            email: currentUser?.email || prev[0].email,
            identifier: 'landlord',
            textMarker: 'For Landlord:'
          },
          {
            // Tenant (rentee)
            name: renteeData?.name || prev[1].name,
            email: renteeData?.email || renteeData?.contact_details?.email || prev[1].email,
            identifier: 'tenant',
            textMarker: 'For Tenant:'
          }
        ]);
      } catch (err) {
        console.error('Error in fetchTenantData:', err);
        toast.error('Failed to load tenant data');
      }
    };

    fetchTenantData();
  }, [agreement?.renteeid, currentUser]);

  // Function to handle Evia Sign authentication
  const handleEviaAuth = async () => {
    try {
      setLoading(true);
      setError('');
      
      console.log('Starting Evia Sign authentication process...');

      // Validate agreement object
      if (!agreement?.id) {
        throw new Error('Invalid agreement data');
      }

      // Store current form state in session storage
      const formState = {
        title: title || '',
        message: message || '',
        signatories: signatories || [],
        agreementId: agreement.id,
        timestamp: Date.now()
      };

      try {
        console.log('Saving form state before authentication');
        sessionStorage.setItem('signatureFormState', JSON.stringify(formState));
      } catch (storageError) {
        console.error('Error saving form state:', storageError);
        // Continue without saving state
      }

      // Set flag to indicate Evia Sign auth is in progress
      try {
        sessionStorage.setItem('eviaAuthInProgress', 'true');
      } catch (storageError) {
        console.error('Error setting auth progress flag:', storageError);
        // Continue without setting flag
      }

      // Get Evia Sign auth URL using the imported function
      const url = getAuthorizationUrl();
      console.log('Authentication URL generated:', url.substring(0, 50) + '...');

      // Calculate popup window position
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      // Open popup window
      console.log('Opening authentication popup window');
      const popup = window.open(
        url,
        'EviaSignAuth',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
      );

      // Check if popup was blocked
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        console.error('Popup was blocked by browser');
        throw new Error('Popup window was blocked. Please allow popups for this site.');
      }

      console.log('Authentication popup window opened successfully');
      
      // Check current localStorage state
      const currentAuthState = localStorage.getItem(AUTH_STORAGE_KEY);
      console.log('Current auth state:', currentAuthState ? 'Present (token exists)' : 'Not present');

      // Listen for messages from the popup window
      const messageHandler = (event) => {
        // Log incoming messages for debugging
        console.log('Received message from popup:', event.data);
        
        if (!event?.data?.type) {
          console.warn('Received invalid message:', event);
          return;
        }

        if (event.data.type === 'EVIA_AUTH_SUCCESS') {
          console.log('Authentication successful!');
          // Update authentication state
          setIsEviaAuthenticated(true);
          setEviaUserEmail(event.data.data?.userEmail || null);
          setError('');
          setLoading(false);
          
          // Clean up
          window.removeEventListener('message', messageHandler);
          try {
            sessionStorage.removeItem('eviaAuthInProgress');
          } catch (storageError) {
            console.error('Error removing auth progress flag:', storageError);
          }
          
          // Alert user for confirmation
          toast.success('Authentication successful! You can now send the document for signature.');
        } else if (event.data.type === 'EVIA_AUTH_ERROR') {
          console.error('Authentication error:', event.data.error);
          setError('Authentication failed: ' + (event.data.error || 'Unknown error'));
          setIsEviaAuthenticated(false);
          setEviaUserEmail(null);
          setLoading(false);
          
          // Clean up
          window.removeEventListener('message', messageHandler);
          try {
            sessionStorage.removeItem('eviaAuthInProgress');
          } catch (storageError) {
            console.error('Error removing auth progress flag:', storageError);
          }
          
          // Alert user for confirmation
          toast.error('Authentication failed: ' + (event.data.error || 'Unknown error'));
        }
      };

      window.addEventListener('message', messageHandler);

      // Clean up after 5 minutes (timeout)
      setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        try {
          sessionStorage.removeItem('eviaAuthInProgress');
        } catch (storageError) {
          console.error('Error removing auth progress flag:', storageError);
        }
        setLoading(false);
        if (popup && !popup.closed) {
          popup.close();
        }
      }, 5 * 60 * 1000);

    } catch (err) {
      console.error('Error in handleEviaAuth:', err);
      setError('Evia Sign authentication error: ' + (err.message || 'An unexpected error occurred'));
      setLoading(false);
      try {
        sessionStorage.removeItem('eviaAuthInProgress');
      } catch (storageError) {
        console.error('Error removing auth progress flag:', storageError);
      }
    }
  };

  // Function to add a signatory
  const addSignatory = () => {
    setSignatories([
      ...signatories, 
      { 
        name: '', 
        email: '', 
        identifier: `signatory-${signatories.length + 1}`, 
        textMarker: `For Signatory ${signatories.length + 1}:` 
      }
    ]);
  };

  // Function to remove a signatory
  const removeSignatory = (index) => {
    setSignatories(signatories.filter((_, i) => i !== index));
  };

  // Function to handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('Submit button clicked - form submission started');
    setLoading(true);
    setError('');

    try {
      // First check Supabase authentication
      if (!supabaseSession) {
        console.error('No Supabase session found');
        setError('Please log in to continue');
        setLoading(false);
        return;
      }
      console.log('Supabase authentication verified');

      if (!agreement.documenturl) {
        console.error('No document URL found in agreement:', agreement);
        setError('No document available. Please generate the document first.');
        setLoading(false);
        return;
      }
      console.log('Document URL verified:', agreement.documenturl);

      if (signatories.length < 1) {
        console.error('No signatories found');
        setError('At least one signatory is required');
        setLoading(false);
        return;
      }
      console.log('Signatories verified:', signatories);

      // Check for empty fields in signatories
      const hasEmptySignatoryFields = signatories.some(s => !s.name || !s.email || !s.identifier || !s.textMarker);
      if (hasEmptySignatoryFields) {
        console.error('Empty fields found in signatories');
        setError('Please fill in all signatory fields');
        setLoading(false);
        return;
      }
      console.log('Signatory fields all filled');

      // Check Evia Sign authentication before proceeding
      const storedAuth = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || '{}');
      console.log('Checking Evia Sign auth:', {
        hasToken: !!storedAuth.authToken,
        tokenExpiry: storedAuth.expiresAt ? new Date(storedAuth.expiresAt).toLocaleString() : 'none',
        isValid: storedAuth.expiresAt && storedAuth.expiresAt > Date.now()
      });
      
      if (!storedAuth.authToken || !storedAuth.expiresAt || storedAuth.expiresAt <= Date.now()) {
        console.error('Evia Sign auth token missing or expired');
        setError('Please authenticate with Evia Sign before sending for signature');
        setIsEviaAuthenticated(false);
        setLoading(false);
        return;
      }
      console.log('Evia Sign authentication verified');

      // Prepare signature data
      const signatureData = {
        documentUrl: agreement.documenturl,
        title,
        message,
        signatories: signatories.map(s => ({
          name: s.name,
          email: s.email,
          identifier: s.identifier,
          textMarker: s.textMarker
        }))
      };
      console.log('Prepared signature data:', signatureData);

      console.log('Directly calling onSuccess handler with signature data');
      if (typeof onSuccess === 'function') {
        console.log('Calling onSuccess handler...');
        await onSuccess(signatureData);
        console.log('onSuccess call completed');
        toast.success('Document sent for signature successfully');
      } else {
        console.error('No onSuccess handler provided');
        setError('Configuration error: No onSuccess handler provided');
      }
      
      console.log('Form submission completed successfully');
    } catch (err) {
      console.error('Error submitting form:', err);
      setError(err.message || 'An error occurred during submission');
    } finally {
      setLoading(false);
      console.log('Form submission process ended');
    }
  };

  // Update the handleInputChange function to properly update signatory data
  const handleSignatoryChange = (index, field, value) => {
    setSignatories(prev => {
      const updated = [...prev];
      if (!updated[index]) {
        updated[index] = { name: '', email: '', identifier: '', textMarker: '' };
      }
      updated[index][field] = value;
      return updated;
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
        <h2 className="text-xl font-bold mb-4">Signature Request Details</h2>
        
        {/* Authentication Status Section */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div className="mb-4 md:mb-0">
              <h3 className="text-sm font-medium text-gray-700">Evia Sign Authentication Status</h3>
              <p className={`text-sm mt-1 ${isEviaAuthenticated ? 'text-green-600' : 'text-red-600 font-bold'}`}>
                {isEviaAuthenticated ? 'Authenticated ✓' : 'Not authenticated - Please authenticate before submitting'}
              </p>
              {isEviaAuthenticated && eviaUserEmail && (
                <p className="text-xs mt-1 text-gray-500">
                  Authenticated as: {eviaUserEmail.replace(/(.{2})(.*)(?=@)/, (_, start, rest) => start + '•'.repeat(rest.length))}
                </p>
              )}
              {!isEviaAuthenticated && (
                <p className="text-xs mt-1 text-orange-600">
                  You must authenticate with Evia Sign before you can submit the signature request.
                </p>
              )}
            </div>
            <Button
              type="button"
              onClick={handleEviaAuth}
              variant={isEviaAuthenticated ? "secondary" : "primary"}
              disabled={loading}
              className={!isEviaAuthenticated ? "bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded animate-pulse" : ""}
            >
              {isEviaAuthenticated ? 'Re-authenticate' : 'Authenticate with Evia Sign'}
            </Button>
          </div>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-2 border rounded"
              rows="3"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Signatories
            </label>
            {signatories.map((signatory, index) => (
              <div key={index} className="mb-4 p-3 border rounded bg-gray-50">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium">Signatory #{index + 1}</h3>
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => removeSignatory(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <input
                      type="text"
                      value={signatory.name}
                      onChange={(e) => handleSignatoryChange(index, 'name', e.target.value)}
                      className="w-full p-2 border rounded"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Email</label>
                    <input
                      type="email"
                      value={signatory.email}
                      onChange={(e) => handleSignatoryChange(index, 'email', e.target.value)}
                      className="w-full p-2 border rounded"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Identifier</label>
                    <input
                      type="text"
                      value={signatory.identifier}
                      onChange={(e) => handleSignatoryChange(index, 'identifier', e.target.value)}
                      className="w-full p-2 border rounded"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Text Marker</label>
                    <input
                      type="text"
                      value={signatory.textMarker}
                      onChange={(e) => handleSignatoryChange(index, 'textMarker', e.target.value)}
                      className="w-full p-2 border rounded"
                      required
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addSignatory}
              className="mt-2 text-blue-600 hover:text-blue-800"
            >
              + Add Signatory
            </button>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              onClick={onCancel}
              variant="secondary"
            >
              Cancel
            </Button>
            {isEviaAuthenticated ? (
              <Button
                type="submit"
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Send for Signature'}
              </Button>
            ) : (
              <div className="relative inline-block">
                <Button
                  type="button"
                  disabled={true}
                  title="Please authenticate with Evia Sign first"
                  className="bg-gray-400 cursor-not-allowed opacity-60"
                >
                  Send for Signature
                </Button>
                <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 p-2 text-sm text-white rounded shadow-lg bottom-full left-1/2 transform -translate-x-1/2 mb-2">
                  Please authenticate with Evia Sign first
                </div>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

SignatureForm.propTypes = {
  agreement: PropTypes.shape({
    id: PropTypes.string.isRequired,
    renteeid: PropTypes.string.isRequired,
    property: PropTypes.shape({
      name: PropTypes.string
    })
  }).isRequired,
  currentUser: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    email: PropTypes.string
  }).isRequired,
  onSubmit: PropTypes.func,
  onSuccess: PropTypes.func,
  onCancel: PropTypes.func
};

export default SignatureForm; 