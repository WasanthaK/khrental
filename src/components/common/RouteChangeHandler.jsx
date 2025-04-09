import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Component to handle React Query cache invalidation on route changes
 * This helps ensure fresh data when navigating between pages
 * Modified to be more HMR-friendly by throttling invalidations
 */
export default function RouteChangeHandler() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const lastPathRef = useRef(location.pathname);
  const lastInvalidationRef = useRef(0);
  
  useEffect(() => {
    // Skip invalidation if we're just rerendering the same path during HMR
    if (location.pathname === lastPathRef.current) {
      return;
    }
    
    // Throttle invalidations to prevent excessive reloads during HMR
    const now = Date.now();
    if (now - lastInvalidationRef.current < 2000) { // 2 second cooldown
      return;
    }
    
    // Update the refs
    lastPathRef.current = location.pathname;
    lastInvalidationRef.current = now;
    
    // When route changes, only invalidate specific queries that should be refreshed
    const handleRouteChange = () => {
      // More selective query invalidation based on route
      if (location.pathname.includes('agreements')) {
        queryClient.invalidateQueries(['agreements']);
      } else if (location.pathname.includes('rentees')) {
        queryClient.invalidateQueries(['rentees']);
      } else if (location.pathname.includes('properties')) {
        queryClient.invalidateQueries(['properties']);
      }
      
      // Only force refetch for very specific cases
      // This improves performance and reduces unnecessary reloads
      if (
        location.pathname.includes('/details') || 
        location.pathname.includes('/edit')
      ) {
        queryClient.refetchQueries({
          predicate: (query) => 
            query.queryKey[0] === location.pathname.split('/')[1]
        });
      }
    };

    handleRouteChange();
  }, [location.pathname, queryClient]);

  return null;
} 