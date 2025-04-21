import React from 'react';
import DashboardLayout from '../components/layouts/DashboardLayout';
import EmailDiagnostic from '../components/diagnostics/EmailDiagnostic';

const DiagnosticsPage = () => {
  // This is a standalone page component that combines
  // the DashboardLayout with the EmailDiagnostic component
  return (
    <DashboardLayout>
      <div className="container mx-auto">
        <EmailDiagnostic />
      </div>
    </DashboardLayout>
  );
};

export default DiagnosticsPage; 