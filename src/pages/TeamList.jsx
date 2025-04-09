import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import TeamMemberCard from '../components/team/TeamMemberCard';
import { toast } from 'react-toastify';

const TeamList = () => {
  // State
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [invitationFilter, setInvitationFilter] = useState('all');
  
  // Function to fetch team members from app_users table
  const fetchTeamMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching team members from app_users table...');
      
      // Fetch team members from app_users table
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('user_type', 'staff');
      
      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      console.log('Fetched data from app_users:', data);
      
      // Transform the data to the expected format
      const transformedData = data.map(member => ({
        id: member.id,
        name: member.name || 'Unnamed Member',
        role: member.role || 'staff',
        contactDetails: member.contact_details || {},
        skills: member.skills || [],
        availability: member.availability || {},
        notes: member.notes || '',
        active: member.status === 'active',
        invited: member.invited,
        authId: member.auth_id,
        createdAt: member.created_at || new Date().toISOString(),
        updatedAt: member.updated_at || member.created_at || new Date().toISOString()
      }));
      
      console.log('Transformed data from app_users:', transformedData);
      setTeamMembers(transformedData);
    } catch (error) {
      console.error('Error fetching team members:', error.message);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Fetch team members on mount
  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);
  
  // Filter team members based on search term and filters
  const filteredMembers = teamMembers.filter(member => {
    // Search filter
    const matchesSearch = 
      member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.contactDetails?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.contactDetails?.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.role?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Role filter
    const matchesRole = 
      roleFilter === 'all' || 
      member.role?.toLowerCase() === roleFilter.toLowerCase();
    
    // Invitation status filter
    let matchesInvitation = true;
    if (invitationFilter === 'invited') {
      matchesInvitation = member.invited && !member.authId;
    } else if (invitationFilter === 'registered') {
      matchesInvitation = !!member.authId;
    } else if (invitationFilter === 'not_invited') {
      matchesInvitation = !member.invited;
    }
    
    return matchesSearch && matchesRole && matchesInvitation;
  });
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Team Members</h1>
        <Link
          to="/dashboard/team/new"
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors"
        >
          Add Team Member
        </Link>
      </div>
      
      <div className="mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search team members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
              <option value="maintenance">Maintenance</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <div>
            <select
              value={invitationFilter}
              onChange={(e) => setInvitationFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="invited">Invited</option>
              <option value="registered">Registered</option>
              <option value="not_invited">Not Invited</option>
            </select>
          </div>
          <div>
            <button
              onClick={fetchTeamMembers}
              className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : error ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="bg-gray-100 p-6 rounded-lg text-center">
          <p className="text-gray-600">No team members found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMembers.map(member => (
            <TeamMemberCard key={member.id} member={member} onStatusChange={fetchTeamMembers} />
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamList; 