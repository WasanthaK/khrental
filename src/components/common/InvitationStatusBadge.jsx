import React from 'react';

/**
 * Component to display invitation status with appropriate styling
 * @param {Object} props
 * @param {string} props.status - Status: 'not_invited', 'invited', 'registered', or 'removed'
 * @param {boolean} props.compact - Whether to show a compact version (just icon)
 */
const InvitationStatusBadge = ({ status, compact = false }) => {
  // Define colors and text based on status
  let bgColor, textColor, icon, text;
  
  switch (status) {
    case 'registered':
      bgColor = 'bg-green-100';
      textColor = 'text-green-800';
      icon = (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      );
      text = 'Registered';
      break;
    case 'invited':
      bgColor = 'bg-blue-100';
      textColor = 'text-blue-800';
      icon = (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
        </svg>
      );
      text = 'Invited';
      break;
    case 'removed':
      bgColor = 'bg-red-100';
      textColor = 'text-red-800';
      icon = (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
        </svg>
      );
      text = 'Removed';
      break;
    default: // not_invited
      bgColor = 'bg-gray-100';
      textColor = 'text-gray-800';
      icon = (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      );
      text = 'Not Invited';
  }
  
  // Return compact or full version
  if (compact) {
    return (
      <span className={`inline-flex items-center rounded-full p-1 ${bgColor} ${textColor}`} title={text}>
        {icon}
      </span>
    );
  }
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bgColor} ${textColor}`}>
      {icon}
      <span className="ml-1">{text}</span>
    </span>
  );
};

export default InvitationStatusBadge; 