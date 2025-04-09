import React, { useState, useEffect } from 'react';
import { 
  sendDocumentForSignature, 
  getSignatureStatus, 
  downloadSignedDocument, 
  getAuthorizationUrl 
} from '../services/eviaSignService';
import Button from '../components/ui/Button';

// Use the same storage key as the service
const STORAGE_KEY = 'eviaSignRequests';
const AUTH_STORAGE_KEY = 'eviaSignAuth';

const DigitalSignatureForm = ({ initialData, onComplete, onCancel }) => {
  const [documentUrl, setDocumentUrl] = useState(initialData?.documentUrl || '');
  const [title, setTitle] = useState(initialData?.title || 'Rental Agreement');
  const [message, setMessage] = useState(initialData?.message || 'Please sign this rental agreement');
  const [signatories, setSignatories] = useState(initialData?.signatories || []);
  const [textMarkers, setTextMarkers] = useState(initialData?.textMarkers || []);
  const [requestId, setRequestId] = useState('');
  const [requestStatus, setRequestStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUrl, setAuthUrl] = useState('');

  // Check authentication status on component mount
  useEffect(() => {
    const storedAuth = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || '{}');
    if (storedAuth.authToken && storedAuth.expiresAt && storedAuth.expiresAt > Date.now()) {
      setIsAuthenticated(true);
    } else {
      setAuthUrl(getAuthorizationUrl());
    }
  }, []);

  // Function to handle authentication
  const handleAuth = () => {
    window.location.href = authUrl;
  };

  // Function to handle file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Check file type
      const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!validTypes.includes(file.type)) {
        setError(`Invalid file type: ${file.type}. Please upload a PDF, DOC, or DOCX file.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        setDocumentUrl(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  // Function to add a signatory
  const addSignatory = () => {
    setSignatories([...signatories, { name: '', email: '', identifier: '' }]);
    setTextMarkers([...textMarkers, { text: '', identifier: '' }]);
  };

  // Function to update signatory data
  const updateSignatory = (index, field, value) => {
    const updatedSignatories = [...signatories];
    updatedSignatories[index] = { ...updatedSignatories[index], [field]: value };
    setSignatories(updatedSignatories);
    
    if (field === 'identifier') {
      const updatedMarkers = [...textMarkers];
      if (updatedMarkers[index]) {
        updatedMarkers[index].identifier = value;
        setTextMarkers(updatedMarkers);
      }
    }
  };

  // Function to update text marker
  const updateTextMarker = (index, value) => {
    const updatedMarkers = [...textMarkers];
    updatedMarkers[index] = { ...updatedMarkers[index], text: value };
    setTextMarkers(updatedMarkers);
  };

  // Function to remove a signatory
  const removeSignatory = (index) => {
    const updatedSignatories = signatories.filter((_, i) => i !== index);
    setSignatories(updatedSignatories);
    
    const updatedMarkers = textMarkers.filter((_, i) => i !== index);
    setTextMarkers(updatedMarkers);
  };

  // Function to send document for signature
  const handleSendForSignature = async () => {
    try {
      setLoading(true);
      setError('');

      // Validate authentication
      if (!isAuthenticated) {
        setError('Please authenticate first');
        setLoading(false);
        return;
      }

      // Validate inputs
      if (!documentUrl) {
        setError('Please upload a document');
        setLoading(false);
        return;
      }

      if (signatories.length < 1) {
        setError('At least one signatory is required');
        setLoading(false);
        return;
      }

      // Check for empty fields in signatories and text markers
      const hasEmptySignatoryFields = signatories.some(s => !s.name || !s.email || !s.identifier);
      const hasEmptyMarkerFields = textMarkers.some(m => !m.text || !m.identifier);
      
      if (hasEmptySignatoryFields) {
        setError('Please fill in all signatory fields');
        setLoading(false);
        return;
      }
      
      if (hasEmptyMarkerFields) {
        setError('Please fill in all text marker fields');
        setLoading(false);
        return;
      }
      
      // Ensure that identifiers match between signatories and markers
      const signatoryIds = signatories.map(s => s.identifier);
      const markerIds = textMarkers.map(m => m.identifier);
      
      const mismatchedIds = signatoryIds.filter(id => !markerIds.includes(id));
      if (mismatchedIds.length > 0) {
        setError(`Signatory identifiers don't match text markers: ${mismatchedIds.join(', ')}`);
        setLoading(false);
        return;
      }

      const params = {
        documentId: `doc-${Date.now()}`,
        documentUrl,
        title,
        message,
        signatories,
        textMarkers: textMarkers.map(m => m.text)
      };

      const result = await sendDocumentForSignature(params);
      
      if (result.success) {
        setRequestId(result.requestId);
        setRequestStatus(result.status);
        onComplete && onComplete(result.requestId);
      } else {
        setError(result.error || 'Failed to send document for signature');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Digital Signature Request</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {!isAuthenticated && (
        <div className="mb-8 p-6 bg-white rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Authentication Required</h2>
          <p className="mb-4">You need to authenticate with Evia Sign before sending documents for signature.</p>
          
          <div className="mb-4">
            <div className="flex space-x-2">
              <Button 
                onClick={handleAuth}
                variant="primary"
              >
                Authenticate with Evia Sign
              </Button>
            </div>
          </div>
        </div>
      )}

      {isAuthenticated && (
        <div className="mb-8 p-6 bg-white rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Signature Request Details</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Document</label>
            {documentUrl ? (
              <div className="flex items-center space-x-2">
                <span className="text-green-600">Document loaded</span>
                <Button
                  onClick={() => window.open(documentUrl, '_blank')}
                  variant="secondary"
                  size="sm"
                >
                  View Document
                </Button>
              </div>
            ) : (
              <input 
                type="file" 
                accept=".pdf,.doc,.docx"
                onChange={handleFileUpload}
                className="w-full p-2 border border-gray-300 rounded"
              />
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input 
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="Agreement Title"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <input 
              type="text" 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="Message to signatories"
            />
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-medium">Signatories</h3>
              <Button 
                onClick={addSignatory} 
                variant="primary" 
                size="sm"
              >
                Add Signatory
              </Button>
            </div>
            
            {signatories.map((signatory, index) => (
              <div key={index} className="p-3 border rounded mb-3 bg-gray-50">
                <div className="flex justify-between mb-2">
                  <h4 className="text-md font-medium">Signatory #{index + 1}</h4>
                  <button 
                    onClick={() => removeSignatory(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input 
                      type="text" 
                      value={signatory.name}
                      onChange={(e) => updateSignatory(index, 'name', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded"
                      placeholder="Full Name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input 
                      type="email" 
                      value={signatory.email}
                      onChange={(e) => updateSignatory(index, 'email', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded"
                      placeholder="Email"
                    />
                  </div>
                </div>
                
                <div className="mb-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Identifier (e.g., landlord, tenant)</label>
                  <input 
                    type="text" 
                    value={signatory.identifier}
                    onChange={(e) => updateSignatory(index, 'identifier', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded"
                    placeholder="Identifier"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Text Marker (e.g., "for Landlord:")</label>
                  <input 
                    type="text" 
                    value={textMarkers[index]?.text || ''}
                    onChange={(e) => updateTextMarker(index, e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded"
                    placeholder="Text marker to search for in document"
                  />
                  <p className="text-xs text-gray-500 mt-1">This text will be searched in the document to place the signature</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end space-x-2">
            <Button 
              onClick={onCancel}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSendForSignature}
              variant="primary"
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send for Signature'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DigitalSignatureForm; 