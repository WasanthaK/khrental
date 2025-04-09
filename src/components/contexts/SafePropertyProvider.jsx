import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import PropertyProvider from '../../contexts/PropertyContext';

/**
 * SafePropertyProvider - Wraps the PropertyProvider in error handling
 * This component provides error handling around the PropertyProvider
 * to prevent the entire application from crashing due to context issues
 */
function SafePropertyProvider({ children }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return <div className="p-4 text-center">
      <h2 className="text-lg font-semibold text-red-600">Error Loading Properties</h2>
      <p className="text-gray-600 mb-4">There was a problem initializing the property data.</p>
      <button 
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Reload Application
      </button>
    </div>;
  }

  try {
    return <PropertyProvider>{children}</PropertyProvider>;
  } catch (error) {
    console.error('Error in PropertyProvider:', error);
    setHasError(true);
    toast.error('Failed to initialize property data. Please refresh the page.');
    
    return <div className="p-4 text-center">
      <h2 className="text-lg font-semibold text-red-600">Property Loading Error</h2>
      <p className="text-gray-600 mb-4">We encountered an error while loading property data.</p>
      <button 
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Refresh Page
      </button>
    </div>;
  }
}

export default SafePropertyProvider; 