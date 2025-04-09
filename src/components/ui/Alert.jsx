import React from 'react';

/**
 * Alert component for displaying messages to the user
 * 
 * @param {Object} props - Component props
 * @param {string} props.type - Alert type (success, error, warning, info)
 * @param {string} props.title - Alert title
 * @param {string} props.message - Alert message
 * @param {boolean} props.dismissible - Whether the alert can be dismissed
 * @param {function} props.onDismiss - Dismiss handler
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Alert content
 */
const Alert = ({ 
  type = 'info', 
  title, 
  message, 
  dismissible = false, 
  onDismiss, 
  className = '', 
  children 
}) => {
  // Type-based classes
  const typeClasses = {
    success: 'bg-green-100 border-green-400 text-green-700',
    error: 'bg-red-100 border-red-400 text-red-700',
    warning: 'bg-yellow-100 border-yellow-400 text-yellow-700',
    info: 'bg-blue-100 border-blue-400 text-blue-700'
  };
  
  return (
    <div 
      className={`border px-4 py-3 rounded relative mb-4 ${typeClasses[type]} ${className}`}
      role="alert"
    >
      {title && <strong className="font-bold">{title}</strong>}
      {message && <span className="block sm:inline ml-2">{message}</span>}
      {children}
      
      {dismissible && (
        <button
          type="button"
          className="absolute top-0 right-0 mt-2 mr-2 text-gray-600 hover:text-gray-800"
          onClick={onDismiss}
          aria-label="Close"
        >
          <span className="text-xl">&times;</span>
        </button>
      )}
    </div>
  );
};

export default Alert; 