import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createAppUser, fetchAppUser, updateAppUser } from '../services/appUserService';
import { inviteUser } from '../services/invitationService';
import { toast } from 'react-toastify';

const TeamMemberForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'staff',
    user_type: 'staff',
    contact_details: {
      email: '',
      phone: '',
      address: ''
    },
    skills: [],
    availability: {
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false
    },
    notes: '',
    status: 'active'
  });

  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(isEditMode);
  const [error, setError] = useState(null);
  const [skillInput, setSkillInput] = useState('');

  useEffect(() => {
    if (isEditMode) {
      const fetchTeamMember = async () => {
        try {
          setFetchLoading(true);
          const data = await fetchAppUser(id);

          if (String(data?.role || '').trim().toLowerCase() === 'admin') {
            throw new Error('Tenant administrators are managed by Platform Admin, not Team.');
          }

          if (data) {
            setFormData({
              ...data,
              contact_details: {
                ...(data.contact_details || {}),
                email: data.email || data.contact_details?.email || '',
                phone: data.contact_details?.phone || '',
                address: data.contact_details?.address || ''
              }
            });
          }
        } catch (fetchError) {
          console.error('Error fetching team member:', fetchError.message);
          setError(fetchError.message);
          toast.error(`Failed to load team member: ${fetchError.message}`);
        } finally {
          setFetchLoading(false);
        }
      };

      fetchTeamMember();
    }
  }, [id, isEditMode]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    if (name.startsWith('contact_details.')) {
      const field = name.split('.')[1];
      setFormData((previous) => ({
        ...previous,
        contact_details: {
          ...previous.contact_details,
          [field]: value
        }
      }));
    } else {
      setFormData((previous) => ({
        ...previous,
        [name]: value
      }));
    }
  };

  const handleAvailabilityToggle = (day) => {
    setFormData((previous) => ({
      ...previous,
      availability: {
        ...previous.availability,
        [day]: !previous.availability[day]
      }
    }));
  };

  const handleAddSkill = () => {
    if (skillInput.trim() && !formData.skills.includes(skillInput.trim())) {
      setFormData((previous) => ({
        ...previous,
        skills: [...previous.skills, skillInput.trim()]
      }));
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    setFormData((previous) => ({
      ...previous,
      skills: previous.skills.filter((skill) => skill !== skillToRemove)
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError(null);

      const processedFormData = {
        ...formData,
        user_type: 'staff',
        contact_details: formData.contact_details,
        email: formData.contact_details.email
      };

      let userId;
      if (id) {
        const result = await updateAppUser(id, processedFormData);
        if (!result.success) throw new Error(result.error || 'Failed to update team member');
        userId = result.data.id;
      } else {
        const result = await createAppUser(processedFormData, 'staff');
        if (!result.success) throw new Error(result.error || 'Failed to create team member');
        userId = result.data.id;
      }

      if (userId && processedFormData.contact_details.email) {
        const invitationResult = await inviteUser({
          id: userId,
          email: processedFormData.contact_details.email,
          name: processedFormData.name,
          role: processedFormData.role || 'staff'
        });

        if (!invitationResult.success) {
          throw new Error(invitationResult.error || 'Team member was saved, but the invitation email could not be sent');
        }

        if (invitationResult.simulated) {
          throw new Error('Team member was saved, but email delivery is not configured');
        }
      }

      toast.success(`Team member ${id ? 'updated' : 'created'} and invitation email sent successfully`);
      navigate('/dashboard/team');
    } catch (saveError) {
      console.error('Error saving team member:', saveError);
      setError(saveError.message);
      toast.error('Error saving team member');
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading team member data...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">
        {isEditMode ? 'Edit Team Member' : 'Add New Team Member'}
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Team is for staff and contractors. Tenant administrators are appointed by Platform Admin.
      </p>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
        <div className="mb-6">
          <h2 className="text-lg font-medium mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={formData.name}
                onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                Team role *
              </label>
              <select
                id="role"
                name="role"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={formData.role}
                onChange={handleChange}
              >
                <option value="staff">Staff / Contractor</option>
                <option value="maintenance">Maintenance</option>
                <option value="manager">Property Manager</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-medium mb-4">Contact Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                type="email"
                id="email"
                name="contact_details.email"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={formData.contact_details.email}
                onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone *
              </label>
              <input
                type="tel"
                id="phone"
                name="contact_details.phone"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={formData.contact_details.phone}
                onChange={handleChange}
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <input
                type="text"
                id="address"
                name="contact_details.address"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={formData.contact_details.address}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-medium mb-4">Skills</h2>
          <div className="flex items-center mb-2">
            <input
              type="text"
              id="skillInput"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Add a skill (e.g., Plumbing, Electrical, Customer Service)"
              value={skillInput}
              onChange={(event) => setSkillInput(event.target.value)}
              onKeyPress={(event) => event.key === 'Enter' && (event.preventDefault(), handleAddSkill())}
            />
            <button
              type="button"
              className="ml-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              onClick={handleAddSkill}
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {formData.skills.map((skill, index) => (
              <div key={index} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full flex items-center">
                {skill}
                <button
                  type="button"
                  className="ml-2 text-blue-600 hover:text-blue-800"
                  onClick={() => handleRemoveSkill(skill)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
            {formData.skills.length === 0 && (
              <div className="text-gray-500 text-sm">No skills added yet</div>
            )}
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-medium mb-4">Availability</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2">
            {Object.entries(formData.availability).map(([day, isAvailable]) => (
              <div
                key={day}
                className={`cursor-pointer p-3 rounded-md text-center ${isAvailable ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}
                onClick={() => handleAvailabilityToggle(day)}
              >
                <div className="font-medium capitalize">{day.slice(0, 3)}</div>
                <div className="text-xs mt-1">{isAvailable ? 'Available' : 'Unavailable'}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows="4"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Additional information about this team member"
          ></textarea>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => navigate('/dashboard/team')}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center"
            disabled={loading || Boolean(error && isEditMode)}
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </>
            ) : (
              <>Save</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TeamMemberForm;