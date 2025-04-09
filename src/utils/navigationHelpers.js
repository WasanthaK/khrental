/**
 * Navigation helper functions to avoid circular dependencies
 * This utility helps decouple components from direct router dependencies
 */

// Store the navigate function when it becomes available
let navigateFunction = null;

/**
 * Register the navigate function from useNavigate hook
 * This should be called by a component that has access to the router context
 * @param {Function} navigate - The navigate function from useNavigate hook
 */
export const registerNavigate = (navigate) => {
  if (typeof navigate === 'function') {
    navigateFunction = navigate;
    // Only log in development and not on every re-render
    if (process.env.NODE_ENV === 'development' && !window.navigationRegistered) {
      console.debug('Navigate function registered and available for use');
      window.navigationRegistered = true;
    }
  } else {
    console.warn('Attempted to register invalid navigate function');
  }
};

/**
 * Get the current navigate function
 * @returns {Function|null} The navigate function or null if not registered
 */
export const getNavigateFunction = () => {
  return navigateFunction;
};

/**
 * Navigate to a specific path
 * @param {string} path - The path to navigate to
 * @param {Object} options - Navigation options
 */
export const navigateTo = (path, options = {}) => {
  if (navigateFunction) {
    navigateFunction(path, options);
  } else {
    console.warn('Navigate function not available, fallback to window.location');
    // Use a safe approach to modify location
    try {
      window.location.href = path;
    } catch (error) {
      console.error('Failed to navigate:', error);
    }
  }
};

/**
 * Navigate to the unauthorized page
 */
export const navigateToUnauthorized = () => {
  navigateTo('/unauthorized');
};

/**
 * Check if navigation is supported
 * @returns {boolean} True if navigation is supported
 */
export const canNavigate = () => {
  return navigateFunction !== null;
}; 