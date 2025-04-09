import React, { useState, useEffect } from 'react';
import { fetchData } from '../../services/supabaseClient';
import { formatDate } from '../../utils/helpers';

const TaskAssignment = ({ 
  teamMemberId, 
  onAssign, 
  currentAssignments = [], 
  readOnly = false 
}) => {
  // State
  const [availableTasks, setAvailableTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Fetch available tasks
  useEffect(() => {
    const fetchAvailableTasks = async () => {
      try {
        setLoading(true);
        
        // Fetch maintenance tasks that need assignment
        const { data: maintenanceTasks, error: maintenanceError } = await fetchData('maintenance_requests', {
          filters: [{ column: 'status', operator: 'eq', value: 'pending' }],
        });
        
        if (maintenanceError) {
          throw maintenanceError;
        }
        
        // Format tasks for display
        const formattedTasks = (maintenanceTasks || []).map(task => ({
          id: task.id,
          type: 'maintenance',
          title: task.title || `Maintenance Request #${task.id}`,
          description: task.description,
         duedate: task.scheduledDate,
          priority: task.priority
        }));
        
        setAvailableTasks(formattedTasks);
      } catch (error) {
        console.error('Error fetching available tasks:', error.message);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    
    if (!readOnly) {
      fetchAvailableTasks();
    }
  }, [readOnly]);
  
  // Handle task selection
  const handleTaskChange = (e) => {
    setSelectedTaskId(e.target.value);
  };
  
  // Handle notes change
  const handleNotesChange = (e) => {
    setNotes(e.target.value);
  };
  
  // Handle assignment submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedTaskId) {
      setError('Please select a task to assign.');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Find the selected task
      const task = availableTasks.find(task => task.id === selectedTaskId);
      
      if (!task) {
        throw new Error('Selected task not found.');
      }
      
      // Create assignment data
      const assignmentData = {
        team_member_id: teamMemberId,
        task_type: 'maintenance',
        related_entity_id: selectedTaskId,
        priority: task.priority,
        due_date: task.dueDate,
        notes: notes.trim() || null,
        status: 'pending',
      };
      
      // Call the onAssign callback
      await onAssign(assignmentData);
      
      // Reset form
      setSelectedTaskId('');
      setNotes('');
    } catch (error) {
      console.error('Error assigning task:', error.message);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // If read-only, just display current assignments
  if (readOnly) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Current Assignments</h3>
        
        {currentAssignments.length === 0 ? (
          <p className="text-gray-500">No tasks currently assigned.</p>
        ) : (
          <div className="space-y-3">
            {currentAssignments.map((assignment, index) => (
              <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{assignment.taskTitle}</h4>
                    <p className="text-sm text-gray-600">
                      {assignment.taskType.charAt(0).toUpperCase() + assignment.taskType.slice(1)} Task
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    assignment.status === 'completed' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {assignment.status}
                  </span>
                </div>
                
                {assignment.duedate&& (
                  <div className="mt-2 text-sm">
                    <span className="text-gray-600">Due: </span>
                    <span className="font-medium">{formatDate(assignment.dueDate)}</span>
                  </div>
                )}
                
                {assignment.notes && (
                  <div className="mt-2 text-sm text-gray-700">
                    {assignment.notes}
                  </div>
                )}
                
                <div className="mt-2 text-xs text-gray-500">
                  Assigned on {formatDate(assignment.assignmentDate)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Current Assignments */}
      {currentAssignments.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Current Assignments</h3>
          
          <div className="space-y-3">
            {currentAssignments.map((assignment, index) => (
              <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{assignment.taskTitle}</h4>
                    <p className="text-sm text-gray-600">
                      {assignment.taskType.charAt(0).toUpperCase() + assignment.taskType.slice(1)} Task
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    assignment.status === 'completed' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {assignment.status}
                  </span>
                </div>
                
                {assignment.duedate&& (
                  <div className="mt-2 text-sm">
                    <span className="text-gray-600">Due: </span>
                    <span className="font-medium">{formatDate(assignment.dueDate)}</span>
                  </div>
                )}
                
                {assignment.notes && (
                  <div className="mt-2 text-sm text-gray-700">
                    {assignment.notes}
                  </div>
                )}
                
                <div className="mt-2 text-xs text-gray-500">
                  Assigned on {formatDate(assignment.assignmentDate)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Assign New Task */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Assign New Task</h3>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="taskId" className="block text-sm font-medium text-gray-700 mb-1">
              Select Task
            </label>
            <select
              id="taskId"
              value={selectedTaskId}
              onChange={handleTaskChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              disabled={loading || availableTasks.length === 0}
            >
              <option value="">Select a task to assign</option>
              {availableTasks.map(task => (
                <option key={task.id} value={task.id}>
                  {task.title} {task.priority && `(${task.priority})`}
                </option>
              ))}
            </select>
            
            {availableTasks.length === 0 && !loading && (
              <p className="mt-1 text-sm text-gray-500">
                No tasks available for assignment.
              </p>
            )}
          </div>
          
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Assignment Notes (Optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={handleNotesChange}
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Add any notes or instructions for this assignment"
              disabled={loading}
            ></textarea>
          </div>
          
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              disabled={loading || availableTasks.length === 0}
            >
              {loading ? 'Assigning...' : 'Assign Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskAssignment; 