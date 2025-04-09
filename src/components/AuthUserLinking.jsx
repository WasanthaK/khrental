import { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { linkUserRecord } from '../services/userService';
import { toast } from 'react-toastify';

const AuthUserLinking = () => {
  const [loading, setLoading] = useState(false);
  const [authUsers, setAuthUsers] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedAuthId, setSelectedAuthId] = useState('');
  const [selectedTeamMemberId, setSelectedTeamMemberId] = useState('');
  const [error, setError] = useState(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const handleLoadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch team members from app_users table
      const { data: teamMembers, error: teamError } = await supabase
        .from('app_users')
        .select('id, name, contact_details, auth_id, role')
        .eq('user_type', 'staff');
      
      if (teamError) {
        throw new Error(`Error fetching team members: ${teamError.message}`);
      }
      
      // Format team members data
      const formattedTeamMembers = teamMembers.map(member => ({
        id: member.id,
        name: member.name,
        contactDetails: member.contact_details,
        authId: member.auth_id,
        role: member.role
      }));
      
      setTeamMembers(formattedTeamMembers);

      // Manual auth users list
      const manualAuthUsers = [
        { 
          id: '43fc66a0-e31c-442d-83c7-255bc139c16a', 
          email: 'wweerakoone@gmail.com',
          user_metadata: { name: 'Wasantha Weerakoone' } 
        },
        { 
          id: '05ea8a5d-f102-40df-9579-7f7c9c3476a1', 
          email: 'wweerakoone@gmail.com',
          user_metadata: { name: 'Wasantha Weerakoone' } 
        },
        { 
          id: 'b8baac5e-f16b-4cb5-95ef-391bafd67555', 
          email: 'madhu@kubeira.com',
          user_metadata: { name: 'Madhu' } 
        }
      ];
      
      setAuthUsers(manualAuthUsers);
      setIsDataLoaded(true);
      toast.success('Users loaded successfully');
    } catch (error) {
      console.error('Error loading users for linking:', error);
      setError(error.message);
      toast.error(`Error loading users: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  const handleLinkUser = async () => {
    try {
      if (!selectedAuthId || !selectedTeamMemberId) {
        toast.error('Please select both an auth user and a team member');
        return;
      }
      
      setLoading(true);
      setError(null);
      
      // Update the app_users record with the auth ID
      const { error } = await supabase
        .from('app_users')
        .update({ auth_id: selectedAuthId, invited: true })
        .eq('id', selectedTeamMemberId);
      
      if (error) {
        throw new Error(`Error linking user: ${error.message}`);
      }
      
      // Update the local state to reflect the change
      setTeamMembers(prev => 
        prev.map(tm => 
          tm.id === selectedTeamMemberId 
            ? { ...tm, authId: selectedAuthId }
            : tm
        )
      );
      
      toast.success('User linked successfully');
      
      // Reset selections
      setSelectedAuthId('');
      setSelectedTeamMemberId('');
    } catch (error) {
      console.error('Error linking user:', error);
      setError(error.message);
      toast.error(`Error linking user: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-xl font-medium mb-4">Auth User Linking Tool</h2>
      <p className="mb-4 text-gray-600">
        This tool helps you manually link Supabase Auth users to team members or rentees. 
        This is useful if you're having login issues or need to fix auth connections.
      </p>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline ml-2">{error}</span>
        </div>
      )}
      
      <div className="grid grid-cols-1 gap-4 mb-4">
        <button
          onClick={handleLoadUsers}
          disabled={loading}
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-purple-300"
        >
          {loading ? 'Loading Users...' : 'Load Users for Linking'}
        </button>
        
        {isDataLoaded && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="authUser" className="block text-sm font-medium text-gray-700 mb-1">
                  Auth User
                </label>
                <select
                  id="authUser"
                  value={selectedAuthId}
                  onChange={(e) => setSelectedAuthId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Select Auth User --</option>
                  {authUsers.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.email} ({user.id.substring(0, 8)}...)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="teamMember" className="block text-sm font-medium text-gray-700 mb-1">
                  Team Member
                </label>
                <select
                  id="teamMember"
                  value={selectedTeamMemberId}
                  onChange={(e) => setSelectedTeamMemberId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Select Team Member --</option>
                  {teamMembers.map(tm => (
                    <option key={tm.id} value={tm.id}>
                      {tm.name} {tm.authId ? '(Already linked)' : '(Not linked)'} 
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <button
              onClick={handleLinkUser}
              disabled={loading || !selectedAuthId || !selectedTeamMemberId}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-300"
            >
              {loading ? 'Linking...' : 'Link User'}
            </button>
          </div>
        )}
      </div>
      
      <div className="mt-4 text-sm text-gray-500">
        <p>Note: To properly link a user, the email addresses should match. If you see "Auth session missing" errors, linking users here can fix it.</p>
      </div>
    </div>
  );
};

export default AuthUserLinking; 