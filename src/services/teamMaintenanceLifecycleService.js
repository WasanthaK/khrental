import { platform as platformClient } from './platformClient';
import { toDatabaseFormat, fromDatabaseFormat } from '../utils/databaseUtils';
import { completeMaintenanceRequest } from './maintenanceLifecycleService';

const normalize = (value) => String(value || '').trim().toLowerCase();

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

    const completingMaintenance = normalize(dbData.status) === 'completed'
      && normalize(currentAssignment.tasktype) === 'maintenance'
      && currentAssignment.relatedentityid;

    if (completingMaintenance) {
      const { data: maintenanceRequest, error: maintenanceReadError } = await platformClient
        .from('maintenance_requests')
        .select('id,status,notes')
        .eq('id', currentAssignment.relatedentityid)
        .single();

      if (maintenanceReadError) throw maintenanceReadError;
      if (!maintenanceRequest) throw new Error('Linked maintenance request not found');

      const maintenanceStatus = normalize(maintenanceRequest.status);
      if (maintenanceStatus !== 'completed') {
        if (maintenanceStatus !== 'in_progress') {
          throw new Error(`Linked maintenance request must be in progress before the task can be completed. Current status: ${maintenanceRequest.status || 'unknown'}.`);
        }

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
