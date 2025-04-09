import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchData } from '../services/supabaseClient';
import { deleteTeamMember } from '../services/teamService';
import { toast } from 'react-toastify';
import TaskAssignment from '../components/team/TaskAssignment';
import PerformanceMetrics from '../components/team/PerformanceMetrics';

const TeamMemberDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // State
  const [teamMember, setTeamMember] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  
  // Fetch team member data
  useEffect(() => {
    const fetchTeamMemberData = async () => {
      try {
        setLoading(true);
        
        // Fetch team member
        const { data: memberData, error: memberError } = await fetchData({
          table: 'app_users',
          filters: [
            { column: 'id', operator: 'eq', value: id },
            { column: 'user_type', operator: 'eq', value: 'staff' }
          ]
        });
        
        if (memberError) {
          throw memberError;
        }
        
        if (!memberData || memberData.length === 0) {
          throw new Error('Team member not found');
        }
        
        // Get the first item from the array response
        const teamMemberData = Array.isArray(memberData) ? memberData[0] : memberData;
        
        // Transform the data to match frontend expectations
        setTeamMember({
          id: teamMemberData.id,
          name: teamMemberData.name || 'Unnamed Member',
          role: teamMemberData.role || 'staff',
          contactDetails: teamMemberData.contact_details || {},
          skills: teamMemberData.skills || [],
          availability: teamMemberData.availability || {},
          notes: teamMemberData.notes || '',
          createdAt: teamMemberData.created_at || new Date().toISOString(),
          updatedAt: teamMemberData.updated_at || teamMemberData.created_at || new Date().toISOString()
        });
        
        // Fetch assignments
        const { data: assignmentsData, error: assignmentsError } = await fetchData({
          table: 'task_assignments',
          filters: [{ column: 'teammemberid', operator: 'eq', value: id }],
          order: { column: 'createdat', ascending: false },
        });
        
        if (assignmentsError) {
          throw assignmentsError;
        }
        
        setAssignments(assignmentsData || []);
      } catch (error) {
        console.error('Error fetching team member data:', error.message);
        setError(error.message);
        toast.error(`Failed to load team member: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTeamMemberData();
  }, [id]);
  
  // Handle delete team member
  const handleDeleteTeamMember = async () => {
    try {
      setDeleteLoading(true);
      
      const result = await deleteTeamMember(id);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete team member');
      }
      
      toast.success('Team member deleted successfully!');
      navigate('/dashboard/team');
    } catch (error) {
      console.error('Error deleting team member:', error.message);
      toast.error(`Failed to delete team member: ${error.message}`);
      setDeleteConfirmOpen(false);
    } finally {
      setDeleteLoading(false);
    }
  };
  
  // Render loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading team member data...</div>
      </div>
    );
  }
  
  // Render error state
  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error}</span>
        <div className="mt-4">
          <button
            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            onClick={() => navigate('/dashboard/team')}
          >
            Back to Team List
          </button>
        </div>
      </div>
    );
  }
  
  // Render team member details
  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{teamMember.name}</h1>
          <p className="text-gray-600 capitalize">{teamMember.role}</p>
        </div>
        <div className="flex space-x-2 mt-4 md:mt-0">
          <Link
            to={`/dashboard/team/${id}/edit`}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
            Edit
          </Link>
          <button
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Delete
          </button>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'details'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('details')}
          >
            Details
          </button>
          <button
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'tasks'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('tasks')}
          >
            Task Assignment
          </button>
          <button
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'performance'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('performance')}
          >
            Performance
          </button>
        </nav>
      </div>
      
      {/* Tab Content */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contact Information */}
              <div>
                <h2 className="text-lg font-medium mb-4">Contact Information</h2>
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-500">Email:</span>
                    <div className="font-medium">{teamMember.contactDetails?.email || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Phone:</span>
                    <div className="font-medium">{teamMember.contactDetails?.phone || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Address:</span>
                    <div className="font-medium">{teamMember.contactDetails?.address || 'N/A'}</div>
                  </div>
                </div>
              </div>
              
              {/* Skills */}
              <div>
                <h2 className="text-lg font-medium mb-4">Skills</h2>
                {teamMember.skills && teamMember.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {teamMember.skills.map((skill, index) => (
                      <span key={index} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No skills listed</p>
                )}
              </div>
              
              {/* Availability */}
              <div>
                <h2 className="text-lg font-medium mb-4">Availability</h2>
                <div className="grid grid-cols-7 gap-2">
                  {teamMember.availability && Object.entries(teamMember.availability).map(([day, isAvailable]) => (
                    <div
                      key={day}
                      className={`p-3 rounded-md text-center ${
                        isAvailable ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <div className="font-medium capitalize">{day.slice(0, 3)}</div>
                      <div className="text-xs mt-1">{isAvailable ? 'Available' : 'Unavailable'}</div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Notes */}
              <div>
                <h2 className="text-lg font-medium mb-4">Notes</h2>
                <div className="bg-gray-50 p-4 rounded-md">
                  {teamMember.notes ? (
                    <p className="whitespace-pre-line">{teamMember.notes}</p>
                  ) : (
                    <p className="text-gray-500">No notes available</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Task Assignment Tab */}
        {activeTab === 'tasks' && (
          <div className="p-6">
            <TaskAssignment 
              teamMemberId={id} 
              teamMemberName={teamMember.name}
              teamMemberRole={teamMember.role}
              onAssignmentCreated={(newAssignment) => {
                setAssignments(prev => [...prev, newAssignment]);
              }}
            />
            
            <div className="mt-8">
              <h3 className="text-lg font-medium mb-4">Current Assignments</h3>
              {assignments.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Task
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Assigned Date
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Due Date
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {assignments.map((assignment) => (
                        <tr key={assignment.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{assignment.taskTitle}</div>
                            <div className="text-sm text-gray-500">{assignment.taskDescription?.substring(0, 50)}{assignment.taskDescription?.length > 50 ? '...' : ''}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                              {assignment.taskType}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(assignment.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {assignment.duedate? new Date(assignment.dueDate).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              assignment.status === 'completed' 
                                ? 'bg-green-100 text-green-800' 
                                : assignment.status === 'in_progress' 
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {assignment.status === 'in_progress' ? 'In Progress' : 
                               assignment.status === 'completed' ? 'Completed' : 'Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-gray-50 p-6 rounded-lg text-center">
                  <p className="text-gray-600">No assignments found for this team member.</p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Performance Tab */}
        {activeTab === 'performance' && (
          <div className="p-6">
            <PerformanceMetrics teamMemberId={id} assignments={assignments} />
          </div>
        )}
      </div>
      
      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">Confirm Delete</h3>
            <p className="mb-6">
              Are you sure you want to delete {teamMember.name}? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center"
                onClick={handleDeleteTeamMember}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deleting...
                  </>
                ) : (
                  <>Delete</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamMemberDetails; 