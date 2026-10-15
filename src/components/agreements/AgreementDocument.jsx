import React, { useEffect, useState } from 'react';
import { useAuthenticatedAgreementDocument } from '../../hooks/useAuthenticatedAgreementDocument';
import { FiDownload, FiX } from 'react-icons/fi';

/**
 * Component for viewing PDF documents in agreements
 */
const AgreementDocument = ({ documentUrl, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const documentState = useAuthenticatedAgreementDocument(documentUrl);
  useEffect(() => { setLoading(true); setError(null); }, [documentUrl]);
  
  // Check if documentUrl is actually HTML content rather than a URL
  const isHtmlContent = documentUrl && (
    documentUrl.trim().startsWith('<') || 
    documentUrl.includes('<!DOCTYPE') || 
    documentUrl.includes('<html')
  );
  
  const viewUrl = documentState.url;
  const loadingDocument = !isHtmlContent && (loading || documentState.status === 'loading');
  const viewerError = documentState.error || error;

  // Handle loading state
  const handleIframeLoad = () => {
    setLoading(false);
  };

  // Handle load error
  const handleIframeError = () => {
    setLoading(false);
    setError('Failed to load document. The URL may be invalid.');
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-5/6 flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-medium">Agreement Document</h3>
          <div className="flex items-center space-x-3">
            {!isHtmlContent && viewUrl && (
              <a 
                href={viewUrl} 
                download
                className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors flex items-center"
              >
                <FiDownload className="mr-1 h-3 w-3" />
                Download
              </a>
            )}
            <button 
              onClick={onClose}
              aria-label="Close document viewer"
              className="text-gray-500 hover:text-gray-700 focus:outline-none"
            >
              <FiX className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-1 bg-gray-100 relative">
          {(loadingDocument || documentState.status === 'loading') && !viewerError && (
            <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80">
              <div className="flex flex-col items-center">
                <svg className="animate-spin h-10 w-10 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-gray-600">Loading document...</span>
              </div>
            </div>
          )}
          
          {viewerError && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="text-center p-6 bg-red-50 rounded-lg border border-red-200">
                <div className="text-red-600 mb-4">
                  <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <h3 className="text-lg font-medium mt-2">Document Error</h3>
                </div>
                <p role="alert">{viewerError}</p>
              </div>
            </div>
          )}
          
          {isHtmlContent ? (
            <div dangerouslySetInnerHTML={{ __html: documentUrl }} className="p-4 bg-white min-h-full" />
          ) : viewUrl ? (
            <iframe 
              src={viewUrl} 
              className="w-full h-full border-0 rounded"
              title="Agreement Document Viewer"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AgreementDocument; 