import React, { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-hot-toast';
import UserLanguageSelector from '../components/forms/UserLanguageSelector';
import { saveImage, STORAGE_BUCKETS } from '../services/fileService';
import { fetchAppUser, updateAppUser } from '../services/appUserService';
import { DEFAULT_IMAGE } from '../utils/constants';
import { getStoredPreferredLanguage, setStoredPreferredLanguage } from '../utils/userPreferences';

const UserProfile = () => {
  const { user, setUser } = useAuth();
  useNavigate();
  const [loading, setLoading] = useState(true);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    phone: '',
    preferred_language: 'en'
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const preferredLanguage = getStoredPreferredLanguage(user?.id, user?.preferred_language || 'en');
      let appUser = null;

      if (user?.profileId) {
        appUser = await fetchAppUser(user.profileId);
      }

      const contactDetails = appUser?.contact_details || appUser?.contactDetails || user?.contactDetails || {};
      const profileImageUrl = appUser?.profile_image_url || user?.profile_image_url || DEFAULT_IMAGE;

      setProfile({
        full_name: appUser?.name || user?.name || '',
        email: appUser?.email || user?.email || '',
        phone: contactDetails?.phone || '',
        profile_image_url: profileImageUrl,
        preferred_language: preferredLanguage
      });
      setImagePreview(profileImageUrl);
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast.error('Failed to load profile data');
    } finally {
      setLoading(false);
    }
  }, [user?.contactDetails, user?.email, user?.id, user?.name, user?.preferred_language, user?.profileId, user?.profile_image_url]);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [fetchProfile, user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProfile({
      ...profile,
      [name]: value,
    });
  };

  const handleLanguageChange = (language) => {
    setProfile({
      ...profile,
      preferred_language: language
    });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let profileImageUrl = profile.profile_image_url;

      // Upload new image if selected
      if (imageFile) {
        const uploadResult = await saveImage(imageFile, {
          bucket: STORAGE_BUCKETS.IMAGES,
          folder: 'profiles',
          compress: true
        });

        if (!uploadResult?.success || !uploadResult?.url) {
          throw new Error(uploadResult?.error || 'Failed to upload profile image');
        }

        profileImageUrl = uploadResult.url;
      }

      const nextContactDetails = {
        ...(user?.contactDetails || {}),
        phone: profile.phone
      };

      if (!user?.profileId) {
        throw new Error('No app user profile is linked to the current account');
      }

      const result = await updateAppUser(user.profileId, {
        name: profile.full_name,
        contact_details: nextContactDetails,
        profile_image_url: profileImageUrl
      });

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to update profile');
      }

      setStoredPreferredLanguage(user.id, profile.preferred_language);
      setUser({
        ...user,
        name: profile.full_name,
        contactDetails: nextContactDetails,
        profile_image_url: profileImageUrl,
        preferred_language: profile.preferred_language
      });

      setUpdateSuccess(true);
      toast.success('Profile updated successfully');
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !profile.email) {
    return <div className="flex justify-center items-center h-96">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Profile</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Profile Image Section */}
        <div className="bg-white shadow rounded-lg overflow-hidden p-4 sm:p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Profile Image</h2>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative w-32 h-32 overflow-hidden rounded-full border-2 border-gray-200">
              <img
                src={imagePreview || DEFAULT_IMAGE}
                alt="Profile" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Change Profile Picture
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
              <p className="mt-1 text-xs text-gray-500">
                JPG, PNG or GIF files up to 5MB
              </p>
            </div>
          </div>
        </div>

        {/* Personal Information Section */}
        <div className="bg-white shadow rounded-lg overflow-hidden p-4 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Personal Information</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                id="full_name"
                name="full_name"
                value={profile.full_name}
                onChange={handleInputChange}
                className="block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500 text-base"
                placeholder="Your full name"
                required
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={profile.email}
                disabled
                className="block w-full rounded-md border-gray-300 shadow-sm p-2 border bg-gray-50 text-gray-500 text-base"
              />
              <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={profile.phone}
                onChange={handleInputChange}
                className="block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500 text-base"
                placeholder="Your phone number"
              />
            </div>
          </div>
        </div>

        {/* Preferences Section */}
        <div className="bg-white shadow rounded-lg overflow-hidden p-4 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Preferences</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">
                Preferred Language
              </label>
              <UserLanguageSelector
                value={profile.preferred_language}
                onChange={handleLanguageChange}
              />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          {updateSuccess && (
            <span className="inline-flex items-center mr-4 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
              Profile Updated
            </span>
          )}
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default UserProfile;