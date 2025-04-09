import React, { useState } from 'react';
import { FiDownload, FiX } from 'react-icons/fi';

/**
 * Component for viewing PDF documents in agreements
 */
const AgreementDocument = ({ documentUrl, onClose }) => {
  const [loading, setLoading] = useState(true);
  
  // Handle loading state
  const handleIframeLoad = () => {
    setLoading(false);
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-5/6 flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-medium">Agreement Document</h3>
          <div className="flex items-center space-x-3">
            <a 
              href={documentUrl} 
              download
              className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors flex items-center"
            >
              <FiDownload className="mr-1 h-3 w-3" />
              Download
            </a>
            <button 
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 focus:outline-none"
            >
              <FiX className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-1 bg-gray-100 relative">
          {loading && (
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
          
          <iframe 
            src={documentUrl} 
            className="w-full h-full border-0 rounded"
            title="Agreement Document Viewer"
            onLoad={handleIframeLoad}
          />
        </div>
      </div>
    </div>
  );
};

export default AgreementDocument; 