import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MaintenanceRequestForm from '../components/maintenance/MaintenanceRequestForm';

const MaintenanceForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;
  
  const handleSubmitSuccess = () => {
    navigate('/dashboard/maintenance');
  };
  
  const handleCancel = () => {
    navigate('/dashboard/maintenance');
  };
  
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">
        {isEditMode ? 'Edit Maintenance Request' : 'Create Maintenance Request'}
      </h1>
      
      <div className="bg-white rounded-lg shadow-md p-6">
        <MaintenanceRequestForm
          onSubmitSuccess={handleSubmitSuccess}
          onCancel={handleCancel}
          isEditMode={isEditMode}
          initialData={null}
        />
      </div>
    </div>
  );
};

export default MaintenanceForm; 