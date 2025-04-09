import React, { useEffect, useState, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { Toaster, toast } from 'react-hot-toast';
import './App.css';
import SafePropertyProvider from './components/contexts/SafePropertyProvider';
import { RouterProvider } from 'react-router-dom';
import router from './routes';

// Create a client for React Query
const queryClient = new QueryClient({
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

function App() {
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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SafePropertyProvider>
          <Suspense fallback={
            <div className="flex justify-center items-center h-screen">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600">Loading application...</p>
              </div>
            </div>
          }>
            <RouterProvider router={router} />
          </Suspense>
        </SafePropertyProvider>
        <Toaster position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

// Export the windowHasFocus flag for use in other components
export { windowHasFocus };
export default App;
