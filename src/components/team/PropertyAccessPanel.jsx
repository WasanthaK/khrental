import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import {
  assignPropertyToStaff,
  fetchData,
  listPropertyAssignments,
  updatePropertyAssignment
} from '../../services/platformClient';
import { fetchAppUser } from '../../services/appUserService';

const PropertyAccessPanel = ({ teamMemberId, teamMemberName }) => {
  const [properties, setProperties] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [teamMemberRole, setTeamMemberRole] = useState(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingAssignmentId, setChangingAssignmentId] = useState(null);
  const [error, setError] = useState(null);

  const loadPropertyAccess = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const member = await fetchAppUser(teamMemberId);
      const role = String(member?.role || '').trim().toLowerCase();
      setTeamMemberRole(role || null);

      if (role === 'admin') {
        setProperties([]);
        setAssignments([]);
        return;
      }

      const [propertyResult, assignmentResult] = await Promise.all([
        fetchData({
          table: 'properties',
          order: { column: 'name', ascending: true }
        }),
        listPropertyAssignments({ staffUserId: teamMemberId })
      ]);

      if (propertyResult.error) {
        throw propertyResult.error;
      }
      if (assignmentResult.error) {
        throw assignmentResult.error;
      }

      setProperties(propertyResult.data || []);
      setAssignments(assignmentResult.data || []);
    } catch (loadError) {
      console.error('Failed to load property access:', loadError);
      setError(loadError.message || 'Failed to load property access.');
    } finally {
      setLoading(false);
    }
  }, [teamMemberId]);

  useEffect(() => {
    loadPropertyAccess();
  }, [loadPropertyAccess]);

  const assignmentByPropertyId = useMemo(() => {
    return new Map(assignments.map((assignment) => [String(assignment.propertyid), assignment]));
  }, [assignments]);

  const availableProperties = useMemo(() => {
    return properties.filter((property) => {
      const assignment = assignmentByPropertyId.get(String(property.id));
      return !assignment || String(assignment.status || '').toLowerCase() !== 'active';
    });
  }, [assignmentByPropertyId, properties]);

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => String(assignment.status || '').toLowerCase() === 'active'),
    [assignments]
  );

  const inactiveAssignments = useMemo(
    () => assignments.filter((assignment) => String(assignment.status || '').toLowerCase() !== 'active'),
    [assignments]
  );

  const handleAssignProperty = async (event) => {
    event.preventDefault();
    if (!selectedPropertyId) {
      toast.error('Select a property first.');
      return;
    }

    try {
      setSaving(true);
      const result = await assignPropertyToStaff({
        staffUserId: teamMemberId,
        propertyId: selectedPropertyId,
        notes: notes.trim() || null
      });

      if (result.error) {
        throw result.error;
      }

      toast.success('Property access assigned.');
      setSelectedPropertyId('');
      setNotes('');
      await loadPropertyAccess();
    } catch (saveError) {
      console.error('Failed to assign property access:', saveError);
      toast.error(saveError.message || 'Failed to assign property access.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (assignment, status) => {
    try {
      setChangingAssignmentId(assignment.id);
      const result = await updatePropertyAssignment(assignment.id, { status });
      if (result.error) {
        throw result.error;
      }
      toast.success(status === 'active' ? 'Property access restored.' : 'Property access removed.');
      await loadPropertyAccess();
    } catch (updateError) {
      console.error('Failed to update property assignment:', updateError);
      toast.error(updateError.message || 'Failed to update property access.');
    } finally {
      setChangingAssignmentId(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-gray-600">Loading property access...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
          <p className="font-medium">Property access could not be loaded.</p>
          <p className="mt-1 text-sm">{error}</p>
          <button
            type="button"
            className="mt-3 rounded-md border border-red-300 px-3 py-2 text-sm font-medium hover:bg-red-100"
            onClick={loadPropertyAccess}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (teamMemberRole === 'admin') {
    return (
      <div className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Property Access</h2>
          <p className="mt-1 text-sm text-gray-600">
            Administrators have tenant-wide access and do not use individual property assignments.
          </p>
        </div>
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          {teamMemberName} is an administrator and can access all properties in this tenant. No property assignment is required.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Property Access</h2>
        <p className="mt-1 text-sm text-gray-600">
          Control which properties {teamMemberName} can access. Role permissions still determine what actions are allowed within those properties.
        </p>
      </div>

      <form onSubmit={handleAssignProperty} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="font-medium text-gray-900">Assign another property</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="property-access-property" className="block text-sm font-medium text-gray-700">
              Property
            </label>
            <select
              id="property-access-property"
              value={selectedPropertyId}
              onChange={(event) => setSelectedPropertyId(event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2"
              disabled={saving || availableProperties.length === 0}
            >
              <option value="">Select a property</option>
              {availableProperties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name || property.address || property.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="property-access-notes" className="block text-sm font-medium text-gray-700">
              Notes (optional)
            </label>
            <input
              id="property-access-notes"
              type="text"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2"
              placeholder="Reason, scope, or handover note"
              disabled={saving}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-xs text-gray-500">
            {availableProperties.length === 0
              ? 'All available properties are already assigned.'
              : `${availableProperties.length} propert${availableProperties.length === 1 ? 'y' : 'ies'} available to assign.`}
          </p>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={saving || !selectedPropertyId}
          >
            {saving ? 'Assigning...' : 'Assign Property'}
          </button>
        </div>
      </form>

      <div>
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">Active property access</h3>
          <span className="text-sm text-gray-500">{activeAssignments.length} active</span>
        </div>
        {activeAssignments.length === 0 ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            This team member currently has no property-scoped access.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Property</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Assigned</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Notes</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {activeAssignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{assignment.property_name || assignment.propertyid}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {assignment.assignedat ? new Date(assignment.assignedat).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{assignment.notes || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                        onClick={() => handleStatusChange(assignment, 'inactive')}
                        disabled={changingAssignmentId === assignment.id}
                      >
                        {changingAssignmentId === assignment.id ? 'Updating...' : 'Remove access'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {inactiveAssignments.length > 0 && (
        <div>
          <h3 className="font-medium text-gray-900">Previous property access</h3>
          <div className="mt-3 space-y-2">
            {inactiveAssignments.map((assignment) => (
              <div key={assignment.id} className="flex flex-col gap-3 rounded-md border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-gray-800">{assignment.property_name || assignment.propertyid}</p>
                  <p className="text-sm text-gray-500">
                    Access removed{assignment.endedat ? ` ${new Date(assignment.endedat).toLocaleDateString()}` : ''}
                    {assignment.notes ? ` · ${assignment.notes}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-blue-300 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  onClick={() => handleStatusChange(assignment, 'active')}
                  disabled={changingAssignmentId === assignment.id}
                >
                  {changingAssignmentId === assignment.id ? 'Updating...' : 'Restore access'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertyAccessPanel;
