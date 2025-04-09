import React, { useState } from 'react';
import { formatDate } from '../../utils/helpers';

const PropertyAvailability = ({ 
  status, 
  availableFrom, 
  onStatusChange, 
  onDateChange, 
  readOnly = false 
}) => {
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Format date for input
  const formatDateForInput = (dateString) => {
    if (!dateString) {
      return '';
    }
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  // Handle status change
  const handleStatusChange = (e) => {
    const newStatus = e.target.value;
    onStatusChange(newStatus);
    
    // Show date picker if status is 'reserved'
    setShowDatePicker(newStatus === 'reserved');
  };

  // Handle date change
  const handleDateChange = (e) => {
    const date = e.target.value;
    onDateChange(date ? new Date(date).toISOString() : null);
  };

  // Get status badge color
  const getStatusBadgeColor = () => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'reserved':
        return 'bg-yellow-100 text-yellow-800';
      case 'maintenance':
        return 'bg-orange-100 text-orange-800';
      case 'inactive':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get status label
  const getStatusLabel = () => {
    switch (status) {
      case 'active':
        return 'Available';
      case 'reserved':
        return 'Reserved';
      case 'maintenance':
        return 'Under Maintenance';
      case 'inactive':
        return 'Inactive';
      default:
        return 'Unknown';
    }
  };

  // If read-only, just display the status
  if (readOnly) {
    return (
      <div className="space-y-2">
        <div className="flex items-center">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor()}`}>
            {getStatusLabel()}
          </span>
          
          {status === 'reserved' && availableFrom && (
            <span className="ml-2 text-sm text-gray-600">
              Available from {formatDate(availableFrom)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="propertyStatus" className="block text-sm font-medium text-gray-700 mb-1">
          Availability Status
        </label>
        <select
          id="propertyStatus"
          value={status || 'active'}
          onChange={handleStatusChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="active">Available</option>
          <option value="reserved">Reserved</option>
          <option value="maintenance">Under Maintenance</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      
      {(showDatePicker || status === 'reserved') && (
        <div>
          <label htmlFor="availableFrom" className="block text-sm font-medium text-gray-700 mb-1">
            Available From
          </label>
          <input
            type="date"
            id="availableFrom"
            value={formatDateForInput(availableFrom)}
            onChange={handleDateChange}
            min={formatDateForInput(new Date())}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      )}
      
      <div className="mt-2">
        <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor()}`}>
          Current Status: {getStatusLabel()}
        </span>
      </div>
    </div>
  );
};

export default PropertyAvailability; 