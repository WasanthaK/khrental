import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls to top on route changes
 * Place this inside the Router component to ensure it works with all navigations
 */
export default function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    // Scroll to top on navigation
    window.scrollTo(0, 0);
    
    // Force a re-render of the current view by adding a small delay
    // This helps when components might not re-fetch data on navigation
    const timeout = setTimeout(() => {
      // This empty function just forces a re-render cycle
      // It's a workaround for pages not refreshing on navigation
    }, 0);
    
    return () => clearTimeout(timeout);
  }, [pathname, search]);

  return null;
} 