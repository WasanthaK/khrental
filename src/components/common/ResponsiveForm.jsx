import React from 'react';
import PropTypes from 'prop-types';

/**
 * A responsive form layout component optimized for mobile and desktop
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Form content
 * @param {string} props.title - Form title
 * @param {Function} props.onSubmit - Form submit handler
 * @param {Function} props.onCancel - Cancel button handler
 * @param {boolean} props.isSubmitting - Whether the form is currently submitting
 * @param {string} props.submitLabel - Label for the submit button
 * @param {string} props.cancelLabel - Label for the cancel button
 * @param {boolean} props.showCancelButton - Whether to show the cancel button
 * @param {boolean} props.compact - Whether to use a more compact layout
 */
const ResponsiveForm = ({
  children,
  title,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  showCancelButton = true,
  compact = false
}) => {
  return (
    <div className={`${compact ? 'max-w-lg' : 'max-w-2xl'} mx-auto px-4 py-6 sm:px-6`}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
        
        {showCancelButton && (
          <button 
            onClick={onCancel}
            className="text-sm text-blue-600 px-3 py-1 rounded-md border border-blue-600"
            type="button"
          >
            {cancelLabel}
          </button>
        )}
      </div>
      
      <form onSubmit={onSubmit} className="space-y-6">
        {children}
        
        <div className={`${showCancelButton ? 'flex justify-end space-x-4' : ''} pt-4`}>
          {showCancelButton && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-3 w-full sm:w-auto border border-gray-300 rounded-lg text-gray-700 font-medium"
              disabled={isSubmitting}
            >
              {cancelLabel}
            </button>
          )}
          
          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-4 py-3 ${showCancelButton ? 'w-full sm:w-auto' : 'w-full'} rounded-lg text-white font-medium shadow-sm ${
              isSubmitting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSubmitting ? 'Processing...' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
};

// Form group component for consistent form styling
export const FormGroup = ({ children, label, htmlFor, error, hint }) => {
  return (
    <div className="mb-4">
      {label && (
        <label 
          htmlFor={htmlFor} 
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          {label}
        </label>
      )}
      {children}
      
      {hint && !error && (
        <p className="mt-1 text-xs text-gray-500">{hint}</p>
      )}
      
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
};

// Responsive input styles for consistent mobile-friendly inputs
export const getInputClassName = (error) => {
  return `w-full p-3 text-base border ${
    error ? 'border-red-500' : 'border-gray-300'
  } rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500`;
};

// Responsive select styles
export const getSelectClassName = (error) => {
  return `w-full p-3 text-base border ${
    error ? 'border-red-500' : 'border-gray-300'
  } rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500`;
};

ResponsiveForm.propTypes = {
  children: PropTypes.node.isRequired,
  title: PropTypes.string.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
  isSubmitting: PropTypes.bool,
  submitLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
  showCancelButton: PropTypes.bool,
  compact: PropTypes.bool
};

FormGroup.propTypes = {
  children: PropTypes.node.isRequired,
  label: PropTypes.string,
  htmlFor: PropTypes.string,
  error: PropTypes.string,
  hint: PropTypes.string
};

export default ResponsiveForm; 