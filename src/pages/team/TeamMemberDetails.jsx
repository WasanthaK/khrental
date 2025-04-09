import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchData, deleteData, updateData, supabase } from '../../services/supabaseClient';
import { formatDate } from '../../utils/helpers';
import { toast } from 'react-toastify';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import Spinner from '../../components/common/Spinner';
import InvitationStatus from '../../components/InvitationStatus';

const TeamMemberDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [teamMember, setTeamMember] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTeamMemberData = async () => {
      try {
        setLoading(true);
        
        // Fetch team member details from app_users table
        const { data: teamMemberData, error: teamMemberError } = await supabase
          .from('app_users')
          .select('*')
          .eq('id', id)
          .eq('user_type', 'staff')
          .single();

        if (teamMemberError) {
          throw teamMemberError;
        }

        if (teamMemberData) {
          setTeamMember(teamMemberData);
        } else {
          toast.error('Team member not found');
          navigate('/dashboard/team');
          return;
        }

        // Fetch assignments for this team member
        const { data: assignmentsData, error: assignmentsError } = await fetchData({
          table: 'task_assignments',
          filters: [{ column: 'teammemberid', operator: 'eq', value: id }],
          order: { column: 'createdat', ascending: false },
        });

        if (assignmentsError) {
          throw assignmentsError;
        }

        if (assignmentsData && assignmentsData.length > 0) {
          setAssignments(assignmentsData);
          
          // Get unique property IDs from assignments
          const propertyIds = [...new Set(assignmentsData.map(a => a.propertyid))];
          
          // Fetch property details
          if (propertyIds.length > 0) {
            const { data: propertiesData, error: propertiesError } = await fetchData({
              table: 'properties',
              filters: [{ column: 'id', operator: 'in', value: propertyIds }],
            });
            
            if (propertiesError) {
              throw propertiesError;
            }
            
            if (propertiesData) {
              setProperties(propertiesData);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching team member data:', error.message);
        setError(error.message);
        toast.error(`Error: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchTeamMemberData();
  }, [id, navigate]);

  const handleDeleteTeamMember = async () => {
    try {
      setDeleteLoading(true);
      
      // Delete team member from app_users table
      const { error } = await supabase
        .from('app_users')
        .delete()
        .eq('id', id);
      
      if (error) {
        throw error;
      }
      
      toast.success('Team member deleted successfully');
      navigate('/dashboard/team');
    } catch (error) {
      console.error('Error deleting team member:', error.message);
      toast.error(`Error: ${error.message}`);
    } finally {
      setDeleteLoading(false);
      setShowDeleteModal(false);
    }
  };

  const getPropertyName = (propertyId) => {
    const property = properties.find(p => p.id === propertyId);
    return property ? property.name : 'Unknown Property';
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'assigned':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <Spinner />;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {loading ? (
        <div className="flex justify-center items-center h-48">
          <Spinner size="lg" />
        </div>
      ) : !teamMember ? (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          Team member not found.
        </div>
      ) : (
        <div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">{teamMember.name}</h1>
              <p className="text-gray-600">{teamMember.role}</p>
            </div>
            <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
              <Link 
                to={`/dashboard/team/${id}/edit`}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Edit
              </Link>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium">Personal Information</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Name</h3>
                  <p className="mt-1">{teamMember.name}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Email</h3>
                  <p className="mt-1">{teamMember.email || 'Not provided'}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Phone</h3>
                  <p className="mt-1">{teamMember.phone || 'Not provided'}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Role</h3>
                  <p className="mt-1 capitalize">{teamMember.role || 'Not specified'}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Start Date</h3>
                  <p className="mt-1">{teamMember.startdate ? formatDate(teamMember.startdate) : 'Not specified'}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Status</h3>
                  <p className="mt-1 capitalize">{teamMember.status || 'Active'}</p>
                </div>
                <div className="md:col-span-2">
                  <InvitationStatus 
                    id={id}
                    type="team_member"
                    name={teamMember.name}
                    email={teamMember.email}
                    role={teamMember.role}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Skills & Specialization</h2>
            <div className="space-y-3">
              <div>
                <span className="text-gray-600 font-medium">Specialization:</span>
                <span className="ml-2">{teamMember.specialization || 'Not specified'}</span>
              </div>
              <div>
                <span className="text-gray-600 font-medium">Skills:</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {teamMember.skills && teamMember.skills.length > 0 ? (
                    teamMember.skills.map((skill, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500">No skills listed</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-gray-600 font-medium">Notes:</span>
                <p className="mt-2 text-gray-700">{teamMember.notes || 'No notes'}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Assignment History</h2>
            {assignments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Property
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Task
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {assignments.map((assignment) => (
                      <tr key={assignment.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(assignment.createdat)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {getPropertyName(assignment.propertyid)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {assignment.task}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(assignment.status)}`}>
                            {assignment.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <Link
                            to={`/dashboard/maintenance/${assignment.maintenanceid}`}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View Details
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500">No assignments found for this team member.</p>
            )}
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteTeamMember}
        title="Delete Team Member"
        message="Are you sure you want to delete this team member? This action cannot be undone."
        confirmButtonText="Delete"
        isLoading={deleteLoading}
      />
    </div>
  );
};

export default TeamMemberDetails; 