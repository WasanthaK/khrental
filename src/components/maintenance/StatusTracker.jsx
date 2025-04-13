import React, { useState } from 'react';
import { formatDate } from '../../utils/helpers';
import { MAINTENANCE_STATUS } from '../../utils/constants';

const StatusTracker = ({ request, assignedTeamMember }) => {
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  // Define the steps based on the current status
  const getStatusSteps = (request) => {
    const steps = [
      {
        label: 'Request Created',
        completed: true,
        date: request.createdat ? formatDate(request.createdat) : null,
        description: `Created on ${formatDate(request.createdat)}`
      },
      {
        label: 'Assigned to Staff',
        completed: !!request.assignedto,
        date: request.assignedat ? formatDate(request.assignedat) : null,
        description: request.assigned_staff ? 
          `Assigned to ${request.assigned_staff.name}${request.assignedat ? `\nScheduled for: ${formatDate(request.assignedat)}` : ''}` : 
          'Not yet assigned'
      },
      {
        label: 'Scheduled',
        completed: !!request.assignedat,
        date: request.assignedat ? formatDate(request.assignedat) : null,
        description: request.assignedat ? 
          `Scheduled for ${formatDate(request.assignedat)}` : 
          'Not yet scheduled'
      },
      {
        label: 'In Progress',
        completed: request.status === 'in_progress' || request.status === 'completed',
        date: request.startedat ? formatDate(request.startedat) : null,
        description: request.startedat ? 
          `Started on ${formatDate(request.startedat)}` : 
          'Work not yet started'
      },
      {
        label: 'Completed',
        completed: request.status === 'completed',
        date: request.completedat ? formatDate(request.completedat) : null,
        description: request.completedat ? 
          `Completed on ${formatDate(request.completedat)}` : 
          'Not yet completed'
      }
    ];

    return steps;
  };
  
  // Handle image preview
  const handleImagePreview = (imageUrl) => {
    setPreviewImage(imageUrl);
    setShowImagePreview(true);
  };

  // Close image preview
  const closeImagePreview = () => {
    setShowImagePreview(false);
    setPreviewImage(null);
  };
  
  // Handle the case where the request is cancelled
  if (request.status === MAINTENANCE_STATUS.CANCELLED) {
    return (
      <div className="bg-white rounded-lg shadow p-4 border">
        <h3 className="text-lg font-medium mb-4">Status: Cancelled</h3>
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="text-sm text-gray-600">
            This request was cancelled on {formatDate(request.cancelledat || request.updatedat)}.
            {request.cancellationreason && (
              <div className="mt-1">
                <strong>Reason:</strong> {request.cancellationreason}
              </div>
            )}
          </div>
        </div>
        
        {/* Show images even for cancelled requests */}
        {request.maintenance_request_images && request.maintenance_request_images.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Images</h4>
            <div className="grid grid-cols-2 gap-2">
              {request.maintenance_request_images.map((image, index) => (
                <div key={index} className="relative">
                  <img
                    src={image.image_url}
                    alt={`Status image ${index + 1}`}
                    className="w-full h-24 object-cover rounded"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-lg shadow p-4 border">
      <h3 className="text-lg font-medium mb-4">Request Progress</h3>
      
      <div className="space-y-6">
        {getStatusSteps(request).map((step, index) => (
          <div key={index} className="relative">
            {/* Connector line */}
            {index < getStatusSteps(request).length - 1 && (
              <div className="absolute top-6 left-3 w-0.5 h-full bg-gray-200"></div>
            )}
            
            <div className="flex items-start">
              {/* Status indicator */}
              <div className={`flex-shrink-0 h-6 w-6 rounded-full ${
                step.completed ? 'bg-green-500' : (step.current ? 'bg-blue-500' : 'bg-gray-200')
              } flex items-center justify-center mt-1`}>
                {step.completed && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              
              {/* Step content */}
              <div className="ml-4 flex-1">
                <h4 className={`text-sm font-medium ${
                  step.completed ? 'text-green-600' : (step.current ? 'text-blue-600' : 'text-gray-500')
                }`}>
                  {step.label}
                </h4>
                <p className="mt-1 text-sm text-gray-500">{step.description}</p>
                
                {/* Show scheduled information */}
                {index === 1 && step.date && (
                  <p className="mt-1 text-sm text-gray-600">
                    {step.date}
                  </p>
                )}
                
                {/* Show initial assessment notes */}
                {(step.current || step.completed) && index === 3 && request.start_work_notes && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-700">
                      <strong>Initial assessment:</strong> {request.start_work_notes}
                    </p>
                  </div>
                )}
                
                {/* Show images for in-progress step */}
                {(step.current || step.completed) && index === 3 && request.maintenance_request_images && request.maintenance_request_images.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-gray-700 mb-1">Assessment Photos:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {request.maintenance_request_images
                        .filter(image => image.image_type === 'progress')
                        .map((image, imgIndex) => (
                        <div key={imgIndex} className="relative">
                          <img
                            src={image.image_url}
                            alt={`Status image ${imgIndex + 1}`}
                            className="w-full h-24 object-cover rounded"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Show completion notes and images */}
                {step.completed && index === 4 && (
                  <div className="mt-2">
                    {request.notes && (
                      <div className="mt-2 text-sm text-gray-600">
                        <strong>Completion notes:</strong> {request.notes}
                      </div>
                    )}
                    
                    {/* Show completion images if available */}
                    {request.maintenance_request_images && request.maintenance_request_images
                      .filter(image => image.image_type === 'completion').length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Completion Images</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {request.maintenance_request_images
                            .filter(image => image.image_type === 'completion')
                            .map((image, imgIndex) => (
                            <div key={imgIndex} className="relative">
                              <img
                                src={image.image_url}
                                alt={`Completion image ${imgIndex + 1}`}
                                className="w-full h-24 object-cover rounded"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Image Preview Modal */}
      {showImagePreview && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={closeImagePreview}>
          <div className="relative max-w-4xl max-h-screen p-2">
            <button 
              className="absolute top-4 right-4 bg-white rounded-full p-2 shadow-lg"
              onClick={closeImagePreview}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img 
              src={previewImage} 
              alt="Preview" 
              className="max-w-full max-h-screen object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default StatusTracker; 