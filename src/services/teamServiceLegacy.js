import { platform as platformClient } from './platformClient';
import { notifyUser } from './notificationService';
import { toDatabaseFormat, fromDatabaseFormat } from '../utils/databaseUtils';
import { createAppUser, deleteAppUser, fetchAppUser, updateAppUser } from './appUserService';

/**
 * Create a new team member
 * @param {Object} memberData - The team member data
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const createTeamMember = async (memberData) => {
  try {
    // Convert camelCase keys to lowercase for database
    const dbData = toDatabaseFormat(memberData);
    
    // Add timestamps and user type
    dbData.createdat = new Date().toISOString();
    dbData.updatedat = new Date().toISOString();
    dbData.user_type = 'staff';
    
    const result = await createAppUser(dbData, 'staff');

    if (!result.success) {
      throw new Error(result.error);
    }
    
    // Convert database format back to camelCase for frontend
    return {
      success: true,
      data: fromDatabaseFormat(result.data),
      error: null
    };
  } catch (error) {
    console.error('Error creating team member:', error.message);
    return {
      success: false,
      data: null,
      error: error.message
    };
  }
};

/**
 * Update an existing team member
 * @param {string} id - The team member ID
 * @param {Object} memberData - The updated team member data
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const updateTeamMember = async (id, memberData) => {
  try {
    // Convert camelCase keys to lowercase for database
    const dbData = toDatabaseFormat(memberData);
    
    // Update timestamp
    dbData.updatedat = new Date().toISOString();
    
    const result = await updateAppUser(id, dbData);

    if (!result.success) {
      throw new Error(result.error);
    }
    
    // Convert database format back to camelCase for frontend
    return {
      success: true,
      data: fromDatabaseFormat(result.data),
      error: null
    };
  } catch (error) {
    console.error('Error updating team member:', error.message);
    return {
      success: false,
      data: null,
      error: error.message
    };
  }
};

/**
 * Delete a team member
 * @param {string} id - The team member ID
 * @returns {Promise<Object>} - Result object with success and error properties
 */
export const deleteTeamMember = async (id) => {
  try {
    // Check if team member has assigned tasks
    const { data: assignments, error: assignmentsError } = await platformClient
      .from('task_assignments')
      .select('id')
      .eq('teammemberid', id);
    
    if (assignmentsError) {
      throw assignmentsError;
    }
    
    if (assignments && assignments.length > 0) {
      throw new Error(`Cannot delete team member with ${assignments.length} assigned tasks. Please reassign or complete these tasks first.`);
    }
    
    // Delete from database
    const result = await deleteAppUser(id);

    if (!result.success) {
      throw new Error(result.error);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting team member:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Assign a task to a team member
 * @param {Object} assignmentData - The task assignment data
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const assignTask = async (assignmentData) => {
  try {
    // Convert camelCase keys to lowercase for database
    const dbData = toDatabaseFormat(assignmentData);
    
    // Add timestamp and default status if not provided
    dbData.createdat = new Date().toISOString();
    if (!dbData.status) {
      dbData.status = 'assigned';
    }
    
    const { data, error } = await platformClient
      .from('task_assignments')
      .insert(dbData)
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    // Notify team member about the assignment
    await notifyTeamMemberAboutAssignment(data);
    
    // Convert database format back to camelCase for frontend
    return {
      success: true,
      data: fromDatabaseFormat(data),
      error: null
    };
  } catch (error) {
    console.error('Error assigning task:', error.message);
    return {
      success: false,
      data: null,
      error: error.message
    };
  }
};

/**
 * Update a task assignment
 * @param {string} id - The assignment ID
 * @param {Object} assignmentData - The updated assignment data
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const updateTaskAssignment = async (id, assignmentData) => {
  try {
    // Convert camelCase keys to lowercase for database
    const dbData = toDatabaseFormat(assignmentData);
    
    // Add update timestamp
    dbData.updatedat = new Date().toISOString();
    
    const { data, error } = await platformClient
      .from('task_assignments')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    // If task is completed and it's a maintenance task, update the maintenance request
    if (dbData.status === 'completed' && data.tasktype === 'maintenance' && data.relatedentityid) {
      try {
        await platformClient
          .from('maintenance_requests')
          .update({ 
            status: 'completed', 
            completeddate: new Date().toISOString() 
          })
          .eq('id', data.relatedentityid);
      } catch (maintenanceError) {
        console.error('Error updating maintenance request:', maintenanceError.message);
        // Don't throw here, we still want to update the assignment
      }
    }
    
    // Convert database format back to camelCase for frontend
    return {
      success: true,
      data: fromDatabaseFormat(data),
      error: null
    };
  } catch (error) {
    console.error('Error updating task assignment:', error.message);
    return {
      success: false,
      data: null,
      error: error.message
    };
  }
};

/**
 * Get team member performance metrics
 * @param {string} teamMemberId - The team member ID
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const getTeamMemberMetrics = async (teamMemberId) => {
  try {
    // Get all assignments for the team member
    const { data: assignments, error: assignmentsError } = await platformClient
      .from('task_assignments')
      .select('*')
      .eq('teammemberid', teamMemberId);
    
    if (assignmentsError) {
      throw assignmentsError;
    }
    
    // Calculate metrics
    const totalAssignments = assignments.length;
    const completedAssignments = assignments.filter(a => a.status === 'completed').length;
    const pendingAssignments = assignments.filter(a => a.status === 'assigned' || a.status === 'in_progress').length;
    const completionRate = totalAssignments > 0 ? (completedAssignments / totalAssignments) * 100 : 0;
    
    // Get recent assignments (last 5)
    const recentAssignments = [...assignments]
      .sort((a, b) => new Date(b.createdat) - new Date(a.createdat))
      .slice(0, 5);
    
    // Get task types distribution
    const taskTypes = {};
    assignments.forEach(assignment => {
      const type = assignment.tasktype || 'other';
      taskTypes[type] = (taskTypes[type] || 0) + 1;
    });
    
    // Convert database format back to camelCase for frontend
    return {
      success: true,
      data: {
        metrics: {
          totalAssignments,
          completedAssignments,
          pendingAssignments,
          completionRate
        },
        recentAssignments: recentAssignments.map(a => fromDatabaseFormat(a)),
        taskTypesDistribution: taskTypes
      },
      error: null
    };
  } catch (error) {
    console.error('Error getting team member metrics:', error.message);
    return { success: false, error: error.message };
  }
};

// Notification helper functions
const notifyTeamMemberAboutAssignment = async (assignmentData) => {
  try {
    console.log(`Notifying team member ${assignmentData.teammemberid} about new assignment`);
    
    // Get team member details
    const teamMember = await fetchAppUser(assignmentData.teammemberid);

    if (teamMember?.user_type !== 'staff') {
      throw new Error('Assigned user is not a staff member');
    }
    
    // Get task details based on task type
    let taskDetails = null;
    
    if (assignmentData.tasktype === 'maintenance' && assignmentData.relatedentityid) {
      const { data: maintenanceRequest, error: maintenanceError } = await platformClient
        .from('maintenance_requests')
        .select('*')
        .eq('id', assignmentData.relatedentityid)
        .single();
      
      if (!maintenanceError) {
        taskDetails = maintenanceRequest;
      }
    }
    
    // Prepare notification message
    const message = {
      title: `New Task Assignment: ${assignmentData.tasktype}`,
      body: `You have been assigned a new ${assignmentData.tasktype} task.`,
      details: fromDatabaseFormat(taskDetails),
      assignmentId: assignmentData.id,
    };
    
    // Send notification
    const teamMemberContactDetails = teamMember.contact_details || teamMember.contactDetails;

    if (teamMemberContactDetails?.email) {
      await notifyUser(teamMember.id, {
        message: message.body,
        title: message.title,
        type: 'team_assignment',
        data: {
          assignmentId: assignmentData.id,
          taskType: assignmentData.tasktype,
          relatedEntityId: assignmentData.relatedentityid,
          details: message.details
        }
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error notifying team member:', error.message);
    // Don't throw error, just log it
    return false;
  }
}; 