import React from 'react';

const SignatureStatusBadge = ({ status }) => {
  // Default values if status is unknown/null
  let bgColor = 'bg-gray-100';
  let textColor = 'text-gray-700';
  let statusText = 'Unknown';
  
  // Set colors and text based on status
  switch (status) {
    case 'pending':
    case 'pending_signature':
      bgColor = 'bg-yellow-100';
      textColor = 'text-yellow-800';
      statusText = 'Pending';
      break;
    case 'in_progress':
    case 'partially_signed':
      bgColor = 'bg-blue-100';
      textColor = 'text-blue-800';
      statusText = 'In Progress';
      break;
    case 'completed':
    case 'signed':
      bgColor = 'bg-green-100';
      textColor = 'text-green-800';
      statusText = 'Completed';
      break;
    case 'expired':
      bgColor = 'bg-orange-100';
      textColor = 'text-orange-800';
      statusText = 'Expired';
      break;
    case 'canceled':
      bgColor = 'bg-red-100';
      textColor = 'text-red-800';
      statusText = 'Canceled';
      break;
    case 'rejected':
      bgColor = 'bg-red-100';
      textColor = 'text-red-800';
      statusText = 'Rejected';
      break;
    case 'unknown':
      bgColor = 'bg-purple-100';
      textColor = 'text-purple-800';
      statusText = 'Not Found';
      break;
    default:
      if (status) {
        statusText = status.charAt(0).toUpperCase() + status.slice(1);
      }
  }
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bgColor} ${textColor}`}>
      {statusText}
    </span>
  );
};

export default SignatureStatusBadge; 