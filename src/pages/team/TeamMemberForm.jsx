import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { toast } from 'react-toastify';

const TeamMemberForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    role: 'staff',
    contactDetails: {
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Fetch team member data if in edit mode
  useEffect(() => {
    if (isEditMode) {
      fetchTeamMember();
    }
  }, [id, isEditMode]);
  
  const fetchTeamMember = async () => {
    try {
      setLoading(true);
      
      // Fetch team member from app_users table
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('id', id)
        .eq('user_type', 'staff')
        .single();
      
      if (error) {
        throw error;
      }
      
      if (data) {
        setFormData({
          name: data.name || '',
          role: data.role || 'staff',
          contactDetails: data.contact_details || { email: '', phone: '' },
          skills: data.skills || [],
          availability: data.availability || {},
          notes: data.notes || '',
          status: data.status || 'active'
        });
      } else {
        throw new Error('Team member not found');
      }
    } catch (error) {
      console.error('Error fetching team member:', error.message);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle form input changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (type === 'checkbox') {
      if (name.startsWith('availability.')) {
        const day = name.split('.')[1];
        setFormData(prev => ({
          ...prev,
          availability: {
            ...prev.availability,
            [day]: checked
          }
        }));
      } else {
        setFormData(prev => ({ ...prev, [name]: checked }));
      }
    } else {
      if (name.startsWith('contactDetails.')) {
        const field = name.split('.')[1];
        setFormData(prev => ({
          ...prev,
          contactDetails: {
            ...prev.contactDetails,
            [field]: value
          }
        }));
      } else {
        setFormData(prev => ({ ...prev, [name]: value }));
      }
    }
  };
  
  // Handle skills input (comma separated)
  const handleSkillsChange = (e) => {
    const skills = e.target.value.split(',')
      .map(skill => skill.trim())
      .filter(skill => skill !== '');
    
    setFormData(prev => ({ ...prev, skills }));
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setIsSubmitting(true);
      
      // Validate form data
      if (!formData.name || !formData.role) {
        throw new Error('Name and role are required');
      }
      
      if (!formData.contactDetails.email) {
        throw new Error('Email is required');
      }
      
      // Format data for database
      const teamMemberData = {
        name: formData.name,
        role: formData.role,
        contact_details: formData.contactDetails,
        email: formData.contactDetails.email,
        skills: formData.skills,
        availability: formData.availability,
        notes: formData.notes,
        status: formData.status,
        user_type: 'staff'
      };
      
      let result;
      
      if (isEditMode) {
        // Update existing team member
        result = await supabase
          .from('app_users')
          .update(teamMemberData)
          .eq('id', id)
          .select();
      } else {
        // Create new team member
        result = await supabase
          .from('app_users')
          .insert(teamMemberData)
          .select();
      }
      
      if (result.error) {
        throw result.error;
      }
      
      // Navigate back to team list
      navigate('/dashboard/team');
    } catch (error) {
      console.error('Error saving team member:', error.message);
      setError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading team member data...</div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center mb-6">
        <Link to="/dashboard/team" className="mr-4">
          <span className="text-gray-600 hover:text-gray-900">← Back</span>
        </Link>
        <h1 className="text-2xl font-bold">{isEditMode ? 'Edit Team Member' : 'Add Team Member'}</h1>
      </div>
      
      <div className="bg-white rounded-lg shadow-md p-6">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                  Role
                </label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="supervisor">Supervisor</option>
                </select>
              </div>
              
              <div>
                <label htmlFor="contactDetails.email" className="block text-sm font-medium text-gray-700">
                  Email *
                </label>
                <input
                  type="email"
                  id="contactDetails.email"
                  name="contactDetails.email"
                  value={formData.contactDetails.email}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="contactDetails.phone" className="block text-sm font-medium text-gray-700">
                  Phone
                </label>
                <input
                  type="tel"
                  id="contactDetails.phone"
                  name="contactDetails.phone"
                  value={formData.contactDetails.phone}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label htmlFor="contactDetails.address" className="block text-sm font-medium text-gray-700">
                  Address
                </label>
                <input
                  type="text"
                  id="contactDetails.address"
                  name="contactDetails.address"
                  value={formData.contactDetails.address}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="skills" className="block text-sm font-medium text-gray-700">
                  Skills (comma separated)
                </label>
                <input
                  type="text"
                  id="skills"
                  name="skills"
                  value={formData.skills.join(', ')}
                  onChange={handleSkillsChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="e.g. Plumbing, Electrical, Carpentry"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Availability
                </label>
                <div className="space-y-2">
                  {Object.keys(formData.availability).map(day => (
                    <div key={day} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`availability.${day}`}
                        name={`availability.${day}`}
                        checked={formData.availability[day]}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor={`availability.${day}`} className="ml-2 block text-sm text-gray-700 capitalize">
                        {day}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows="4"
                  value={formData.notes}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                ></textarea>
              </div>
            </div>
          </div>
          
          <div className="mt-6 flex justify-end space-x-3">
            <Link
              to="/dashboard/team"
              className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isSubmitting ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TeamMemberForm; 