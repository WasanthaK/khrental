import React from 'react';

const DatePicker = ({
  label,
  id,
  name,
  value,
  onChange,
  required = false,
  error = null,
  className = '',
  disabled = false,
  min = null,
  max = null
}) => {
  // Format date to a string that can be used in the input
  const formatDateValue = (dateValue) => {
    if (!dateValue) return '';
    
    // If it's already a string in YYYY-MM-DD format, return it
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    
    // Convert to a date object if it's not already
    const date = new Date(dateValue);
    
    // Check if valid date
    if (isNaN(date.getTime())) return '';
    
    // Format as YYYY-MM-DD
    return date.toISOString().split('T')[0];
  };
  
  // Handle date changes
  const handleChange = (e) => {
    // If onChange is provided, call it with the new value
    if (onChange) {
      // If the value is empty, pass null or empty string based on the expected format
      if (!e.target.value) {
        onChange({ target: { name, value: null } });
        return;
      }
      
      // Otherwise pass the value as a date string
      onChange({ target: { name, value: e.target.value } });
    }
  };
  
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <input
        type="date"
        id={id}
        name={name}
        value={formatDateValue(value)}
        onChange={handleChange}
        className={`w-full px-3 py-2 border ${
          error ? 'border-red-500' : 'border-gray-300'
        } rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
          disabled ? 'bg-gray-100 cursor-not-allowed' : ''
        }`}
        min={min ? formatDateValue(min) : undefined}
        max={max ? formatDateValue(max) : undefined}
        required={required}
        disabled={disabled}
      />
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
};

export default DatePicker; 