import React, { useState } from 'react';
import { useProperty } from '../../contexts/PropertyContext';

/**
 * PropertySelector component for selecting one or multiple properties
 * @param {Object} props - Component props
 * @param {boolean} props.multiSelect - Whether to allow multiple property selection
 * @param {Function} props.onChange - Callback when selected properties change
 * @param {Array<string>} props.value - Selected property IDs (controlled component)
 * @param {string} props.className - Additional CSS class
 */
const PropertySelector = ({ 
  multiSelect = false, 
  onChange, 
  value = [], 
  className = "",
  showRecent = true,
  label = "Select Property"
}) => {
  const { 
    properties, 
    recentPropertyIds, 
    selectProperty, 
    selectMultipleProperties, 
    selectedPropertyIds,
    loading,
    error
  } = useProperty();
  
  // Local state for search term
  const [searchTerm, setSearchTerm] = useState('');
  
  // Handle search input change
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };
  
  // Filter properties based on search term
  const filteredProperties = properties.filter(property => 
    property.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    property.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Get recent properties with details
  const recentProperties = properties.filter(
    property => Array.isArray(recentPropertyIds) && recentPropertyIds.includes(property.id)
  );
  
  // Use controlled or uncontrolled selection
  const currentSelection = value.length > 0 ? value : selectedPropertyIds;
  
  // Handle property selection
  const handleSelectProperty = (propertyId) => {
    if (onChange) {
      // Controlled component
      if (multiSelect) {
        const newSelection = currentSelection.includes(propertyId)
          ? currentSelection.filter(id => id !== propertyId)
          : [...currentSelection, propertyId];
        onChange(newSelection);
      } else {
        onChange([propertyId]);
      }
    } else {
      // Uncontrolled component using context
      selectProperty(propertyId, multiSelect);
    }
  };
  
  // Handle clear selection
  const handleClearSelection = () => {
    if (onChange) {
      onChange([]);
    } else {
      selectMultipleProperties([]);
    }
  };
  
  // Handle select all
  const handleSelectAll = () => {
    if (!multiSelect) {
      return;
    }
    
    const allIds = filteredProperties.map(property => property.id);
    if (onChange) {
      onChange(allIds);
    } else {
      selectMultipleProperties(allIds);
    }
  };
  
  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-gray-200 rounded w-full mb-4"></div>
        <div className="h-8 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="text-red-500 text-sm">
        Error loading properties: {error}
      </div>
    );
  }
  
  return (
    <div className={`property-selector ${className}`}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      
      {/* Search input */}
      <div className="relative mb-4">
        <input
          type="text"
          placeholder="Search properties..."
          className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={searchTerm}
          onChange={handleSearchChange}
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>
      
      {/* Selection actions */}
      {multiSelect && (
        <div className="flex justify-between mb-2 text-sm">
          <button
            onClick={handleSelectAll}
            className="text-blue-600 hover:text-blue-800"
          >
            Select All
          </button>
          <button
            onClick={handleClearSelection}
            className="text-red-600 hover:text-red-800"
            disabled={currentSelection.length === 0}
          >
            Clear Selection
          </button>
        </div>
      )}
      
      {/* Selected count */}
      {multiSelect && currentSelection.length > 0 && (
        <div className="text-sm text-gray-600 mb-2">
          {currentSelection.length} {currentSelection.length === 1 ? 'property' : 'properties'} selected
        </div>
      )}
      
      {/* Recent properties section */}
      {showRecent && recentProperties.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Recent Properties</h3>
          <div className="space-y-2">
            {recentProperties.map(property => (
              <div
                key={`recent-${property.id}`}
                className={`
                  p-3 rounded-md cursor-pointer border
                  ${currentSelection.includes(property.id) 
                    ? 'bg-blue-50 border-blue-500' 
                    : 'bg-white border-gray-300 hover:bg-gray-50'
                  }
                `}
                onClick={() => handleSelectProperty(property.id)}
              >
                <div className="font-medium">{property.name}</div>
                <div className="text-sm text-gray-500">{property.address}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* All properties section */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">All Properties</h3>
        {filteredProperties.length === 0 ? (
          <div className="text-gray-500 text-sm">
            {searchTerm 
              ? 'No properties match your search' 
              : 'No properties available'
            }
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-2">
            {filteredProperties.map(property => (
              <div
                key={property.id}
                className={`
                  p-3 rounded-md cursor-pointer border
                  ${currentSelection.includes(property.id) 
                    ? 'bg-blue-50 border-blue-500' 
                    : 'bg-white border-gray-300 hover:bg-gray-50'
                  }
                `}
                onClick={() => handleSelectProperty(property.id)}
              >
                <div className="font-medium">{property.name}</div>
                <div className="text-sm text-gray-500">{property.address}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertySelector; 