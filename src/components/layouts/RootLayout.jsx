import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { initializeApp } from '../../services/appInitService';
import { useAuth } from '../../hooks/useAuth';
import ScrollToTop from '../common/ScrollToTop';
import RouteChangeHandler from '../common/RouteChangeHandler';
import ForceRefresh from '../common/ForceRefresh';
import { Toaster } from 'react-hot-toast';
import { ConfirmContextProvider } from '../../contexts/ConfirmContext';
import PropertyProvider from '../../contexts/PropertyContext';
import NavigationRegistrar from './NavigationRegistrar';

const RootLayout = () => {
  const { user, loading } = useAuth();
  const [initStatus, setInitStatus] = useState({
    initialized: false,
    error: null,
    isStorageError: false
  });
  const [showStorageWarning, setShowStorageWarning] = useState(true);
  
  // Initialize app when it loads
  useEffect(() => {
    // Skip initialization if still loading auth state
    if (loading) return;
    
    const initialize = async () => {
      try {
        // Check if we've shown the warning before in this session
        const dismissedWarning = sessionStorage.getItem('storage_warning_dismissed') === 'true';
        
        // Initialize app services
        const result = await initializeApp({ user });
        
        setInitStatus({
          initialized: true,
          error: result.error,
          isStorageError: result.isStorageError
        });
        
        // If warning was previously dismissed, don't show it again
        if (dismissedWarning && result.isStorageError) {
          setShowStorageWarning(false);
        }
      } catch (error) {
        console.error('Error initializing app:', error);
        setInitStatus({
          initialized: true,
          error: error.message,
          isStorageError: false
        });
      }
    };
    
    initialize();
  }, [user, loading]); // Run when user or loading state changes
  
  // Function to dismiss the storage warning
  const dismissStorageWarning = () => {
    setShowStorageWarning(false);
    sessionStorage.setItem('storage_warning_dismissed', 'true');
  };

  return (
    <>
      <ScrollToTop />
      <RouteChangeHandler />
      <ForceRefresh />
      <NavigationRegistrar />
      
      <ConfirmContextProvider>
        <PropertyProvider>
          <Toaster position="top-right" />
          
          {initStatus.error && showStorageWarning && (
            <div className={`border-l-4 p-4 fixed bottom-0 right-0 z-50 max-w-md shadow-md flex justify-between ${
              initStatus.isStorageError 
                ? 'bg-yellow-50 border-yellow-500 text-yellow-700' 
                : 'bg-red-50 border-red-500 text-red-700'
            }`}>
              <div>
                <p className="font-medium">{initStatus.isStorageError ? 'Storage Notice' : 'Error'}</p>
                <p className="text-sm">{initStatus.error}</p>
                {initStatus.isStorageError && (
                  <p className="text-xs mt-1">
                    Note: File uploads will be unavailable. Please contact an administrator to set up the required storage buckets.
                  </p>
                )}
              </div>
              <button 
                onClick={dismissStorageWarning}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Dismiss"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}
          
          <Outlet />
        </PropertyProvider>
      </ConfirmContextProvider>
    </>
  );
};

export default RootLayout; 