import React from 'react';

/**
 * A utility component that adds a refresh button in the corner of the screen
 * Helpful for users when they encounter issues with stale data
 */
const ForceRefresh = () => {
  const handleRefresh = () => {
    // Clear React Query cache if possible and reload the page
    if (window.location) {
      window.location.reload();
    }
  };

  return (
    <button
      onClick={handleRefresh}
      className="fixed bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full shadow-lg z-50 flex items-center justify-center"
      title="Refresh page"
      aria-label="Refresh page"
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className="h-6 w-6" 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
        />
      </svg>
    </button>
  );
};

export default ForceRefresh; 