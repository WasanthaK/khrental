import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { registerNavigate } from '../../utils/navigationHelpers';

/**
 * Component that registers the navigate function from react-router
 * This component should be rendered in each layout component where navigation is available
 * No visible UI is rendered by this component
 */
function NavigationRegistrar() {
  const navigate = useNavigate();
  const location = useLocation();
  
  useEffect(() => {
    // Register the navigate function for other components to use
    registerNavigate(navigate);
    
    // Only log in development mode and only once per mount, not on every location change
    if (process.env.NODE_ENV === 'development') {
      console.debug('Navigation function registered', { path: location.pathname });
    }
    
    // Only depend on navigate, not location, to avoid re-registering on every route change
  }, [navigate]);
  
  // Render nothing - this is just a setup component
  return null;
}

export default NavigationRegistrar; 