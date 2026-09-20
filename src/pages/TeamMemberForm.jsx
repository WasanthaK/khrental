import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createTeamMember, fetchTeamMember, updateTeamMember } from '../services/teamMemberService';
import { inviteUser } from '../services/invitationService';
import { toast } from 'react-toastify';

const TeamMemberForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    permission_bundle: 'maintenance',
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
    if (!isEditMode) return;

    const load = async () => {
      try {
        setFetchLoading(true);
        const data = await fetchTeamMember(id);
        setFormData({
          ...data,
          permission_bundle: data.permission_bundle || 'read_only',
          contact_details: {
            ...(data.contact_details || {}),
            email: data.email || data.contact_details?.email || '',
            phone: data.contact_details?.phone || '',
            address: data.contact_details?.address || ''
          },
          skills: Array.isArray(data.skills) ? data.skills : [],
          availability: data.availability || {}
        });
      } catch (fetchError) {
        console.error('Error fetching team member:', fetchError.message);
        setError(fetchError.message);
        toast.error(`Failed to load team member: ${fetchError.message}`);
      } finally {
        setFetchLoading(false);
      }
    };

    load();
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
      return;
    }

    setFormData((previous) => ({ ...previous, [name]: value }));
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

      const payload = {
        name: formData.name,
        email: formData.contact_details.email,
        role: 'staff',
        user_type: 'staff',
        permission_bundle: formData.permission_bundle,
        contact_details: formData.contact_details,
        skills: formData.skills,
        availability: formData.availability,
        notes: formData.notes,
        status: formData.status || 'active'
      };

      const saved = isEditMode
        ? await updateTeamMember(id, payload)
        : await createTeamMember(payload);

      if (!saved?.id) {
        throw new Error('Team member save did not return a valid identity.');
      }

      const invitationResult = await inviteUser({
        id: saved.id,
        email: saved.email || payload.email,
        name: saved.name || payload.name,
        role: 'staff'
      });

      if (!invitationResult.success) {
        throw new Error(invitationResult.error || 'Team member was saved, but the invitation email could not be sent');
      }

      if (invitationResult.simulated) {
        throw new Error('Team member was saved, but email delivery is not configured');
      }

      toast.success(`Team member ${isEditMode ? 'updated' : 'added'} and invitation email sent successfully`);
      navigate('/dashboard/team');
    } catch (saveError) {
      console.error('Error saving team member:', saveError);
      setError(saveError.message);
      toast.error(saveError.message || 'Error saving team member');
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
        Team is for staff and contractors in this organization. Tenant administrators are appointed by Platform Admin.
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
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
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
              <label htmlFor="permission_bundle" className="block text-sm font-medium text-gray-700 mb-1">Access *</label>
              <select
                id="permission_bundle"
                name="permission_bundle"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={formData.permission_bundle}
                onChange={handleChange}
              >
                <option value="property_operations">Property Operations</option>
                <option value="finance">Finance</option>
                <option value="maintenance">Maintenance</option>
                <option value="read_only">Read Only</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-medium mb-4">Contact Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
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
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
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
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">Address</label>
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
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Add a skill"
              value={skillInput}
              onChange={(event) => setSkillInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), handleAddSkill())}
            />
            <button type="button" className="ml-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" onClick={handleAddSkill}>Add</button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {formData.skills.map((skill) => (
              <button key={skill} type="button" onClick={() => handleRemoveSkill(skill)} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                {skill} ×
              </button>
            ))}
            {formData.skills.length === 0 && <div className="text-gray-500 text-sm">No skills added yet</div>}
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-medium mb-4">Availability</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2">
            {Object.entries(formData.availability).map(([day, isAvailable]) => (
              <button
                type="button"
                key={day}
                className={`p-3 rounded-md text-center ${isAvailable ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}
                onClick={() => handleAvailabilityToggle(day)}
              >
                <div className="font-medium capitalize">{day.slice(0, 3)}</div>
                <div className="text-xs mt-1">{isAvailable ? 'Available' : 'Unavailable'}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            id="notes"
            name="notes"
            rows="4"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Additional information about this team member"
          />
        </div>

        <div className="flex justify-end space-x-3">
          <button type="button" className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50" onClick={() => navigate('/dashboard/team')} disabled={loading}>Cancel</button>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" disabled={loading || Boolean(error && isEditMode)}>
            {loading ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Add Team Member')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TeamMemberForm;