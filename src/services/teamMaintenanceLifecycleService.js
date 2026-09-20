import { platform as platformClient } from './platformClient';
import { toDatabaseFormat, fromDatabaseFormat } from '../utils/databaseUtils';
import { completeMaintenanceRequest } from './maintenanceLifecycleService';
import {
  canCompleteTaskForMaintenanceStatus,
  isLinkedMaintenanceCompletion,
  requiresMaintenanceCompletion
} from './teamMaintenanceLifecyclePolicy';

export const updateTaskAssignment = async (id, assignmentData = {}) => {
  try {
    const { data: currentAssignment, error: currentError } = await platformClient
      .from('task_assignments')
      .select('*')
      .eq('id', id)
      .single();

    if (currentError) throw currentError;
    if (!currentAssignment) throw new Error('Task assignment not found');

    const dbData = toDatabaseFormat(assignmentData);
    dbData.updatedat = new Date().toISOString();

    const completingMaintenance = isLinkedMaintenanceCompletion({
      status: dbData.status,
      taskType: currentAssignment.tasktype,
      relatedEntityId: currentAssignment.relatedentityid
    });

    if (completingMaintenance) {
      const { data: maintenanceRequest, error: maintenanceReadError } = await platformClient
        .from('maintenance_requests')
        .select('id,status,notes')
        .eq('id', currentAssignment.relatedentityid)
        .single();

      if (maintenanceReadError) throw maintenanceReadError;
      if (!maintenanceRequest) throw new Error('Linked maintenance request not found');

      if (!canCompleteTaskForMaintenanceStatus(maintenanceRequest.status)) {
        throw new Error(`Linked maintenance request must be in progress before the task can be completed. Current status: ${maintenanceRequest.status || 'unknown'}.`);
      }

      if (requiresMaintenanceCompletion(maintenanceRequest.status)) {
        const completion = await completeMaintenanceRequest(currentAssignment.relatedentityid, {
          notes: dbData.notes || currentAssignment.notes || maintenanceRequest.notes || 'Completed from linked task assignment'
        });
        if (!completion.success) {
          throw new Error(completion.error || 'Failed to complete linked maintenance request');
        }
      }
    }

    const { data, error } = await platformClient
      .from('task_assignments')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data: fromDatabaseFormat(data),
      error: null
    };
  } catch (error) {
    console.error('Error updating task assignment:', error.message || error);
    return {
      success: false,
      data: null,
      error: error.message || 'Failed to update task assignment'
    };
  }
};
