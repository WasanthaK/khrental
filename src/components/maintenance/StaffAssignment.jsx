import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { formatDate } from '../../utils/helpers';
import ImageUpload from './ImageUpload';

const StaffAssignment = ({ 
  requestId,
  currentAssignee = null, 
  onAssign, 
  disabled = false,
  existingImages = [] // Add a prop for existing images
}) => {
  const [staffMembers, setStaffMembers] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState(currentAssignee?.id || '');
  const [scheduledDate, setScheduledDate] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [assignmentImages, setAssignmentImages] = useState([]);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  
  // Fetch staff members
  useEffect(() => {
    const fetchStaffMembers = async () => {
      try {
        setLoading(true);
        
        // Get maintenance staff from app_users table
        const { data, error } = await supabase
          .from('app_users')
          .select('*')
          .eq('user_type', 'staff')
          .in('role', ['maintenance', 'maintenance_staff', 'admin']);
        
        if (error) {
          throw error;
        }
        
        setStaffMembers(data || []);
      } catch (err) {
        console.error('Error fetching staff members:', err.message);
        setError('Failed to load staff members. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchStaffMembers();
  }, []);
  
  // Set initial scheduled date if available
  useEffect(() => {
    if (currentAssignee?.scheduledDate) {
      // Convert to YYYY-MM-DD format for input
      const date = new Date(currentAssignee.scheduledDate);
      const formattedDate = date.toISOString().split('T')[0];
      setScheduledDate(formattedDate);
    }
  }, [currentAssignee]);
  
  // Initialize images from existingImages prop
  useEffect(() => {
    if (existingImages && existingImages.length > 0) {
      const formattedImages = existingImages.map((url, index) => ({
        id: `existing-${index}`,
        url,
        preview: url,
        isNew: false
      }));
      setAssignmentImages(formattedImages);
    }
  }, [existingImages]);
  
  // Handle calendar toggle
  const toggleCalendar = () => {
    if (!disabled && !loading) {
      setShowCalendar(!showCalendar);
    }
  };
  
  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const calendarContainer = document.getElementById('calendar-container');
      if (calendarContainer && !calendarContainer.contains(event.target) && 
          event.target.id !== 'scheduledDate' && event.target.id !== 'calendar-toggle') {
        setShowCalendar(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Handle image changes
  const handleImagesChange = (images) => {
    setAssignmentImages(images);
  };
  
  // Handle image preview
  const handleImagePreview = (image) => {
    setPreviewImage(image.preview || image.url);
    setShowImagePreview(true);
  };
  
  // Close image preview
  const closeImagePreview = () => {
    setShowImagePreview(false);
    setPreviewImage(null);
  };
  
  // Generate calendar days
  const generateCalendarDays = () => {
    const today = new Date();
    const currentMonth = scheduledDate ? new Date(scheduledDate) : today;
    currentMonth.setDate(1); // Set to first day of month
    
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    // Get first day of month and total days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Generate calendar grid
    const days = [];
    
    // Add empty cells for days before the first of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-8 w-8"></div>);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateString = date.toISOString().split('T')[0];
      const isToday = date.toDateString() === today.toDateString();
      const isSelected = dateString === scheduledDate;
      const isPast = date < today && !isToday;
      
      days.push(
        <button
          key={day}
          type="button"
          onClick={() => {
            setScheduledDate(dateString);
            setShowCalendar(false);
          }}
          disabled={isPast}
          className={`
            h-8 w-8 rounded-full flex items-center justify-center text-sm
            ${isSelected ? 'bg-blue-600 text-white' : isToday ? 'border border-blue-400' : ''}
            ${isPast ? 'text-gray-400 cursor-not-allowed' : 'hover:bg-blue-100'}
          `}
        >
          {day}
        </button>
      );
    }
    
    return days;
  };
  
  // Navigate to previous month
  const prevMonth = () => {
    const date = scheduledDate ? new Date(scheduledDate) : new Date();
    date.setMonth(date.getMonth() - 1);
    setScheduledDate(date.toISOString().split('T')[0]);
  };
  
  // Navigate to next month
  const nextMonth = () => {
    const date = scheduledDate ? new Date(scheduledDate) : new Date();
    date.setMonth(date.getMonth() + 1);
    setScheduledDate(date.toISOString().split('T')[0]);
  };
  
  // Handle assignment
  const handleAssign = async (e) => {
    e.preventDefault();
    
    if (!selectedStaffId) {
      setError('Please select a staff member.');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const selectedStaff = staffMembers.find(staff => staff.id === selectedStaffId);
      
      if (!selectedStaff) {
        throw new Error('Selected staff member not found.');
      }
      
      // Get all image URLs (both existing and new)
      const imageUrls = assignmentImages.map(img => img.url || img.preview);
      
      // Call the onAssign callback with the assignment details
      await onAssign({
        staffId: selectedStaffId,
        staffName: selectedStaff.name,
        scheduledDate: scheduledDate ? new Date(scheduledDate).toISOString() : null,
        requestId: requestId,
        assignmentImages: imageUrls // Pass all image URLs
      });
      
    } catch (err) {
      console.error('Error assigning staff:', err.message);
      setError(err.message || 'Failed to assign staff. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Format month for display
  const formatMonth = () => {
    const date = scheduledDate ? new Date(scheduledDate) : new Date();
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };
  
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border">
      <h3 className="text-lg font-medium mb-4">Assign Staff</h3>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      
      {loading && !staffMembers.length ? (
        <div className="text-center py-4">
          <div className="spinner-border text-primary" role="status">
            <span className="sr-only">Loading...</span>
          </div>
          <p className="mt-2">Loading staff members...</p>
        </div>
      ) : (
        <form onSubmit={handleAssign}>
          <div className="mb-4">
            <label htmlFor="staffMember" className="block text-sm font-medium text-gray-700 mb-1">
              Staff Member
            </label>
            <select
              id="staffMember"
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              disabled={disabled || loading}
              required
            >
              <option value="">Select a staff member</option>
              {staffMembers.map(staff => (
                <option key={staff.id} value={staff.id}>
                  {staff.name} ({staff.role})
                </option>
              ))}
            </select>
          </div>
          
          <div className="mb-4">
            <label htmlFor="scheduledDate" className="block text-sm font-medium text-gray-700 mb-1">
              Scheduled Date (optional)
            </label>
            <div className="relative">
              <div className="flex items-center">
                <input
                  type="text"
                  id="scheduledDate"
                  value={scheduledDate ? formatDate(scheduledDate) : ''}
                  readOnly
                  placeholder="Select a date"
                  onClick={toggleCalendar}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                  disabled={disabled || loading}
                />
                <button
                  type="button"
                  id="calendar-toggle"
                  onClick={toggleCalendar}
                  className="absolute right-2 text-gray-500 hover:text-gray-700"
                  disabled={disabled || loading}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              
              {/* Calendar Popup */}
              {showCalendar && (
                <div
                  id="calendar-container"
                  className="absolute mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10"
                >
                  <div className="p-2">
                    <div className="flex justify-between items-center mb-2">
                      <button
                        type="button"
                        onClick={prevMonth}
                        className="p-1 rounded-full hover:bg-gray-100"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <div className="text-sm font-medium">{formatMonth()}</div>
                      <button
                        type="button"
                        onClick={nextMonth}
                        className="p-1 rounded-full hover:bg-gray-100"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-7 gap-1 text-xs text-center mb-1">
                      <div>Su</div>
                      <div>Mo</div>
                      <div>Tu</div>
                      <div>We</div>
                      <div>Th</div>
                      <div>Fr</div>
                      <div>Sa</div>
                    </div>
                    
                    <div className="grid grid-cols-7 gap-1">
                      {generateCalendarDays()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Maintenance Request Images */}
          {existingImages && existingImages.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Request Images</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {existingImages.map((image, index) => (
                  <div key={`image-${index}`} className="relative">
                    <img 
                      src={image} 
                      alt={`Maintenance request image ${index + 1}`}
                      className="w-full h-24 object-cover rounded-md cursor-pointer border border-gray-200 hover:border-blue-500"
                      onClick={() => handleImagePreview({ url: image })}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Upload new images during assignment */}
          {!disabled && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add New Images (optional)
              </label>
              <ImageUpload
                onImagesChange={handleImagesChange}
                maxImages={5}
                initialImages={[]}
              />
            </div>
          )}
          
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
              disabled={disabled || loading || !selectedStaffId}
            >
              {loading ? 'Assigning...' : currentAssignee ? 'Update Assignment' : 'Assign Staff'}
            </button>
          </div>
        </form>
      )}
      
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

export default StaffAssignment; 