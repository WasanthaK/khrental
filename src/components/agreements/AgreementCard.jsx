import React from 'react';
import { Link } from 'react-router-dom';
import AgreementActions from './AgreementActions';

const AgreementCard = ({ agreement, property, rentee }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'signed':
        return 'bg-green-100 text-green-800';
      case 'pending_signature':
        return 'bg-yellow-100 text-yellow-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'terminated':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  const formatStatus = (status) => {
    if (!status) return 'Unknown';
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (!agreement) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-4">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {property?.name || 'Unknown Property'}
            </h3>
            <p className="text-sm text-gray-600">
              {property?.address || 'No address available'}
            </p>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(agreement.status)}`}>
            {formatStatus(agreement.status)}
          </span>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Rentee:</span>
            <span className="font-medium text-gray-900">{rentee?.name || 'Unknown'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Created:</span>
            <span className="text-gray-900">{formatDate(agreement.createdat)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Period:</span>
            <span className="text-gray-900">
              {formatDate(agreement.startdate)} - {formatDate(agreement.enddate)}
            </span>
          </div>
          {agreement.signeddate && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Signed:</span>
              <span className="text-gray-900">{formatDate(agreement.signeddate)}</span>
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <div className="flex justify-between items-center">
            {agreement.pdfurl ? (
              <a
                href={agreement.pdfurl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Document
              </a>
            ) : (
              <Link
                to={`/dashboard/agreements/${agreement.id}`}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                View Agreement
              </Link>
            )}
            <AgreementActions 
              agreement={agreement}
              renteeId={rentee?.id}
              onSuccess={() => {
                // Refresh the agreement list if needed
                window.location.reload();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgreementCard; 