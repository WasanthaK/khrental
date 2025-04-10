import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { toast } from 'react-hot-toast';
import { navigateToUnauthorized } from '../utils/navigationHelpers';

const MAX_RECENT_PROPERTIES = 5;
const RETRY_DELAY = 3000; // 3 seconds

// Create context
const PropertyContext = createContext();

// Custom hook to use the context
export function useProperty() {
  const context = useContext(PropertyContext);
  if (!context) {
    console.warn('useProperty must be used within a PropertyProvider');
    return {
      properties: [],
      selectedPropertyIds: [],
      selectedProperties: [],
      recentProperties: [],
      accessiblePropertyIds: [],
      loading: false,
      error: new Error('PropertyContext not available'),
      selectProperty: () => {},
      togglePropertySelection: () => {},
      clearPropertySelection: () => {},
      selectAllProperties: () => {},
      refreshProperties: () => {},
      isReady: false
    };
  }
  return context;
}

// Provider component
function PropertyProvider({ children }) {
  const [properties, setProperties] = useState([]);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recentProperties, setRecentProperties] = useState([]);
  const [accessiblePropertyIds, setAccessiblePropertyIds] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const initAttempted = useRef(false);
  const retryCount = useRef(0);

  // Load properties on mount
  useEffect(() => {
    if (!initAttempted.current) {
      initAttempted.current = true;
      initializeContext();
    }
  }, []);

  // Main initialization function with retry logic
  const initializeContext = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load everything in parallel for performance
      const results = await Promise.allSettled([
        loadProperties(),
        loadUserAccessibleProperties(),
        loadRecentPropertiesFromStorage()
      ]);
      
      // Check if any critical operations failed
      const criticalErrors = results
        .filter((result, index) => index < 2 && result.status === 'rejected')
        .map(result => result.reason);
      
      if (criticalErrors.length > 0) {
        console.error('Critical errors during PropertyContext initialization:', criticalErrors);
        setError(new Error('Failed to initialize property data'));
        
        // Retry logic for critical failures
        if (retryCount.current < 3) {
          retryCount.current += 1;
          setTimeout(() => {
            initializeContext();
          }, RETRY_DELAY);
          return;
        } else {
          toast.error('Could not load property data after multiple attempts');
        }
      } else {
        // If we loaded properties but had non-critical errors, we're still ready
        setIsReady(true);
      }
    } catch (err) {
      console.error('Error in context initialization:', err);
      setError(err);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  };

  // Load properties from the database
  const loadProperties = async () => {
    try {
      const { data: properties, error } = await supabase
        .from('properties')
        .select('*')
        .order('createdat', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      setProperties(properties || []);
      return properties;
    } catch (err) {
      console.error('Error loading properties:', err);
      setError(err);
      throw err;
    }
  };

  // Load user's accessible properties
  const loadUserAccessibleProperties = async () => {
    try {
      // Get current user
      const { data: userData, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        throw new Error(userError.message);
      }

      if (!userData?.user) {
        setAccessiblePropertyIds([]);
        return [];
      }

      // For simplicity, get all properties for now
      // In a real implementation, you would check permissions
      const { data: allProperties, error: propError } = await supabase
        .from('properties')
        .select('id');
      
      if (propError) {
        throw new Error(propError.message);
      }
      
      const propertyIds = allProperties.map(p => p.id);
      setAccessiblePropertyIds(propertyIds);
      return propertyIds;
    } catch (err) {
      console.error('Error loading user property access:', err);
      // Default to empty array on error
      setAccessiblePropertyIds([]);
      throw err;
    }
  };

  // Load recent properties from localStorage
  const loadRecentPropertiesFromStorage = () => {
    try {
      const storedProperties = localStorage.getItem('recentProperties');
      if (storedProperties) {
        const parsed = JSON.parse(storedProperties);
        setRecentProperties(parsed);
        return parsed;
      }
      return [];
    } catch (err) {
      console.error('Error loading recent properties from storage:', err);
      return [];
    }
  };

  // Save recent properties to localStorage
  const saveRecentPropertiesToStorage = (properties) => {
    try {
      localStorage.setItem('recentProperties', JSON.stringify(properties));
    } catch (err) {
      console.error('Error saving recent properties to storage:', err);
    }
  };

  // Add a property to recent properties
  const addToRecentProperties = useCallback((propertyId) => {
    // Get the full property object
    const property = properties.find(p => p.id === propertyId);
    
    if (!property) {
      return;
    }

    setRecentProperties(prevRecent => {
      // Filter out if already exists
      const filtered = prevRecent.filter(p => p.id !== propertyId);
      
      // Add to beginning of array
      const updated = [property, ...filtered].slice(0, MAX_RECENT_PROPERTIES);
      
      // Save to storage
      saveRecentPropertiesToStorage(updated);
      
      return updated;
    });
  }, [properties]);

  // Check if user has access to a property
  const hasAccessToProperty = useCallback((propertyId) => {
    // If not initialized yet or loading is still in progress, assume access for now
    if (!initialized || loading) {
      return true;
    }
    
    // If no accessible properties loaded or error occurred, assume access
    // This prevents blocking UI in case of errors
    if (accessiblePropertyIds.length === 0) {
      return true;
    }
    
    return accessiblePropertyIds.includes(propertyId);
  }, [accessiblePropertyIds, initialized, loading]);

  // Select a property (single select mode)
  const selectProperty = useCallback((propertyId) => {
    if (!hasAccessToProperty(propertyId)) {
      toast.error('You do not have access to this property');
      navigateToUnauthorized();
      return;
    }

    setSelectedPropertyIds([propertyId]);
    addToRecentProperties(propertyId);
  }, [hasAccessToProperty, addToRecentProperties]);

  // Toggle property selection (multi-select mode)
  const togglePropertySelection = useCallback((propertyId) => {
    if (!hasAccessToProperty(propertyId)) {
      console.warn(`User does not have access to property: ${propertyId}`);
      toast.error('You do not have access to this property');
      navigateToUnauthorized();
      return;
    }

    setSelectedPropertyIds(prevSelected => {
      if (prevSelected.includes(propertyId)) {
        return prevSelected.filter(id => id !== propertyId);
      } else {
        addToRecentProperties(propertyId);
        return [...prevSelected, propertyId];
      }
    });
  }, [hasAccessToProperty, addToRecentProperties]);

  // Clear all property selections
  const clearPropertySelection = useCallback(() => {
    setSelectedPropertyIds([]);
  }, []);

  // Select all accessible properties
  const selectAllProperties = useCallback(() => {
    setSelectedPropertyIds([...accessiblePropertyIds]);
  }, [accessiblePropertyIds]);

  // Refresh properties with error handling
  const refreshProperties = useCallback(async () => {
    try {
      setLoading(true);
      await loadProperties();
      await loadUserAccessibleProperties();
      return true;
    } catch (err) {
      console.error('Error refreshing properties:', err);
      setError(err);
      toast.error('Failed to refresh properties');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get selected property objects
  const selectedProperties = properties.filter(property => 
    selectedPropertyIds.includes(property.id)
  );

  // Context value
  const contextValue = {
    properties,
    selectedPropertyIds,
    selectedProperties,
    recentProperties,
    recentPropertyIds: Array.isArray(recentProperties) ? recentProperties.map(p => p.id) : [],
    accessiblePropertyIds,
    accessibleProperties: properties,
    loading,
    error,
    initialized,
    isReady,
    selectProperty,
    togglePropertySelection,
    clearPropertySelection,
    selectAllProperties,
    refreshProperties,
  };

  return (
    <PropertyContext.Provider value={contextValue}>
      {children}
    </PropertyContext.Provider>
  );
}

// Only export the Provider component as default, not the context itself
export default PropertyProvider; 