import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { supabase } from '../../services/supabaseClient';
import { UTILITY_TYPES } from '../../utils/constants';

const UtilityReadingForm = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    utilityType: UTILITY_TYPES.ELECTRICITY,
    previousReading: null,
    currentReading: '',
    photoUrl: null,
    readingDate: new Date().toISOString().split('T')[0],
  });
  const [photoPreview, setPhotoPreview] = useState(null);
  const [user, setUser] = useState(null);
  const [property, setProperty] = useState(null);
  const [isMeterReset, setIsMeterReset] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);

  useEffect(() => {
    const fetchUserAndProperty = async () => {
      try {
        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) {
          throw userError;
        }
        setUser(user);

        // Get app_user record using auth_id
        const { data: appUser, error: appUserError } = await supabase
          .from('app_users')
          .select('id, associated_property_ids')
          .eq('auth_id', user.id)
          .single();

        if (appUserError) {
          throw appUserError;
        }
        
        if (!appUser) {
          throw new Error('User profile not found');
        }

        // Set the app_user id for later use in form submission
        setUser({
          ...user,
          appUserId: appUser.id
        });

        if (appUser?.associated_property_ids?.length > 0) {
          const { data: propertyData, error: propertyError } = await supabase
            .from('properties')
            .select('id, name, address, electricity_rate, water_rate')
            .eq('id', appUser.associated_property_ids[0])
            .single();

          if (propertyError) {
            throw propertyError;
          }
          setProperty(propertyData);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        toast.error('Failed to load user data');
      }
    };

    fetchUserAndProperty();
  }, []);

  useEffect(() => {
    const fetchLastReading = async () => {
      if (!user || !property) {
        return;
      }

      try {
        // Use app_user id instead of auth_id
        const userId = user.appUserId || user.id;
        
        // Build the query without headers
        const query = supabase
          .from('utility_readings')
          .select('currentreading')
          .eq('renteeid', userId)
          .eq('propertyid', property.id)
          .eq('utilitytype', formData.utilityType)
          .order('readingdate', { ascending: false })
          .limit(1);
          
        // Execute the query
        const { data, error } = await query;

        if (error) {
          console.error('Error fetching last reading:', error);
          // Continue without previous reading data
          return;
        }

        // Check if we have data and update the form
        if (data && data.length > 0) {
          setFormData(prev => ({
            ...prev,
            previousReading: data[0].currentreading
          }));
          
          // Reset meter reset flag when we get new previous reading
          setIsMeterReset(false);
        } else {
          setFormData(prev => ({
            ...prev,
            previousReading: null
          }));
        }
      } catch (error) {
        console.error('Error fetching last reading:', error);
        toast.error('Failed to load previous reading');
      }
    };

    fetchLastReading();
  }, [user, property, formData.utilityType]);

  const handlePhotoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    try {
      setLoading(true);
      
      // Create a preview URL
      const previewUrl = URL.createObjectURL(file);
      setPhotoPreview(previewUrl);

      // Get the correct user ID (app_user ID)
      const userId = user.appUserId || user.id;
      
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `utility-readings/${userId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      setFormData(prev => ({
        ...prev,
        photoUrl: publicUrl
      }));

      toast.success('Photo uploaded successfully');
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast.error('Failed to upload photo');
      setPhotoPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!property) {
      toast.error('No property found for this user');
      return;
    }
    
    setLoading(true);
    
    try {
      // Validate readings
      if (!formData.currentReading || isNaN(formData.currentReading)) {
        throw new Error('Please enter a valid current reading');
      }
      
      // Only validate current > previous if meter hasn't been reset
      if (formData.previousReading !== null && 
          !isMeterReset && 
          Number(formData.currentReading) < Number(formData.previousReading)) {
        throw new Error('Current reading cannot be less than previous reading unless meter has been reset');
      }
      
      // Calculate consumption
      const consumption = formData.previousReading 
        ? Number(formData.currentReading) - Number(formData.previousReading)
        : 0;
      
      // Ensure we have the correct user ID
      const userId = user.appUserId || user.id;
      console.log('Submitting utility reading with user ID:', userId);
      
      // Set up insertion data
      const insertData = {
        renteeid: userId, // Use app_user id instead of auth_id
        propertyid: property.id,
        utilitytype: formData.utilityType,
        previousreading: formData.previousReading,
        currentreading: formData.currentReading,
        readingdate: formData.readingDate,
        photourl: formData.photoUrl,
        calculatedbill: consumption,
        status: 'pending'
      };
      
      // Insert reading into database without headers
      const { error } = await supabase
        .from('utility_readings')
        .insert(insertData);

      if (error) {
        throw error;
      }

      toast.success('Utility reading submitted successfully');
      navigate('/rentee/utilities');
    } catch (error) {
      console.error('Error submitting reading:', error);
      toast.error(error.message || 'Failed to submit reading');
    } finally {
      setLoading(false);
    }
  };

  const toggleCaptureMode = () => {
    setCaptureMode(!captureMode);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Submit Utility Reading</h1>
        <button 
          onClick={() => navigate('/rentee/utilities')}
          className="text-sm text-blue-600 px-3 py-1 rounded-md border border-blue-600"
          type="button"
        >
          Cancel
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Utility Type Selection - Larger touch targets */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Utility Type
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, utilityType: UTILITY_TYPES.ELECTRICITY }))}
              className={`p-4 border rounded-md text-center flex flex-col items-center justify-center ${
                formData.utilityType === UTILITY_TYPES.ELECTRICITY
                  ? 'bg-blue-50 border-blue-600 text-blue-700'
                  : 'bg-white text-gray-700'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={loading}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Electricity</span>
            </button>
            
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, utilityType: UTILITY_TYPES.WATER }))}
              className={`p-4 border rounded-md text-center flex flex-col items-center justify-center ${
                formData.utilityType === UTILITY_TYPES.WATER
                  ? 'bg-blue-50 border-blue-600 text-blue-700'
                  : 'bg-white text-gray-700'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={loading}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <span>Water</span>
            </button>
          </div>
          
          {property && (
            <div className="mt-2 text-sm text-gray-600">
              Current rate: {formData.utilityType === UTILITY_TYPES.ELECTRICITY 
                ? `${property.electricity_rate || 'N/A'} per unit` 
                : `${property.water_rate || 'N/A'} per unit`}
            </div>
          )}
        </div>

        {/* Previous Reading Display - Mobile friendly card */}
        {formData.previousReading !== null && (
          <div className="bg-gray-50 p-4 rounded-lg shadow-sm">
            <p className="text-sm text-gray-600">Previous Reading:</p>
            <p className="text-lg font-semibold">{formData.previousReading}</p>
            
            <div className="mt-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={isMeterReset}
                  onChange={(e) => setIsMeterReset(e.target.checked)}
                  className="h-5 w-5 mr-3 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  The meter has been reset or replaced
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Current Reading Input - Larger touch target */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Current Reading
          </label>
          <input
            type="number"
            value={formData.currentReading}
            onChange={(e) => setFormData(prev => ({ ...prev, currentReading: e.target.value }))}
            className="w-full p-3 text-lg border rounded-lg shadow-sm"
            required
            disabled={loading}
            inputMode="decimal"
            placeholder="Enter meter reading"
          />
        </div>

        {/* Reading Date - Mobile optimized date picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Reading Date
          </label>
          <input
            type="date"
            value={formData.readingDate}
            onChange={(e) => setFormData(prev => ({ ...prev, readingDate: e.target.value }))}
            className="w-full p-3 text-lg border rounded-lg shadow-sm"
            required
            disabled={loading}
          />
        </div>

        {/* Photo Upload - With camera option */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Meter Photo
          </label>
          
          <div className="flex items-center mb-3">
            <button
              type="button"
              onClick={toggleCaptureMode}
              className={`px-4 py-2 mr-3 rounded-md text-sm ${
                captureMode 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700'
              }`}
              disabled={loading}
            >
              {captureMode ? 'Use File Upload' : 'Use Camera'}
            </button>
            
            <span className="text-xs text-gray-500">
              {captureMode ? 'Taking photo directly' : 'Upload existing photo'}
            </span>
          </div>
          
          {captureMode ? (
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="w-full p-3 border rounded-lg shadow-sm"
              required
              disabled={loading}
              capture="environment"
            />
          ) : (
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="w-full p-3 border rounded-lg shadow-sm"
              required
              disabled={loading}
            />
          )}
          
          {photoPreview && (
            <div className="mt-3">
              <img
                src={photoPreview}
                alt="Meter reading preview"
                className="max-w-full h-auto rounded-lg shadow-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Tap image to enlarge
              </p>
            </div>
          )}
        </div>

        {/* Submit Button - Larger touch target */}
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 px-4 rounded-lg text-white font-medium text-lg shadow-sm ${
            loading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? 'Submitting...' : 'Submit Reading'}
        </button>
      </form>
    </div>
  );
};

export default UtilityReadingForm; 