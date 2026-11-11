import React, { useEffect, Suspense, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Toaster } from 'react-hot-toast';
import './App.css';
import SafePropertyProvider from './components/contexts/SafePropertyProvider';
import AppRouter from './routes';

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Prevent refetching when window regains focus
      retry: 1,
      staleTime: 0, // Force fresh data on navigation
      cacheTime: 5 * 60 * 1000, // 5 minutes
      refetchOnMount: 'always', // Always refetch when component mounts
      refetchOnReconnect: true,
    },
  },
});

// Flag to track if window currently has focus
let windowHasFocus = true;

// Ensure environment variables that need to be URLs have proper protocol
function ensureEnvironmentURLs() {
  try {
    // No URL checks needed after webhook removal
    console.log('Environment checks completed');
  } catch (error) {
    console.error('Error checking environment URLs:', error);
  }
}

// The keyed boundary owns a fresh cache for each organization.
const TenantScopedProviders = ({ tenantScopeKey }) => {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient} key={tenantScopeKey}>
      <SafePropertyProvider key={tenantScopeKey}>
        <Suspense fallback={
          <div className="flex justify-center items-center h-screen">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Loading application...</p>
            </div>
          </div>
        }>
          <AppRouter key={tenantScopeKey} />
        </Suspense>
      </SafePropertyProvider>
    </QueryClientProvider>
  );
};

const TenantScopedAppShell = () => {
  const { activeTenantId } = useAuth();
  const tenantScopeKey = activeTenantId || 'no-tenant';
  return <TenantScopedProviders key={tenantScopeKey} tenantScopeKey={tenantScopeKey} />;
};

function App() {
  // Fix environment URLs immediately on app initialization
  useEffect(() => {
    ensureEnvironmentURLs();
  }, []);

  // Add focus/blur event listeners to better handle tab switches
  useEffect(() => {
    // Handle window focus changes
    const handleFocus = () => {
      windowHasFocus = true;
    };

    const handleBlur = () => {
      windowHasFocus = false;
    };

    // Add event listeners
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Clean up
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return (
    <AuthProvider>
      <TenantScopedAppShell />
      <Toaster position="top-right" />
    </AuthProvider>
  );
}

// Export the windowHasFocus flag for use in other components
export { windowHasFocus };
export default App;
