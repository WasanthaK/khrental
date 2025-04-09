import React from 'react';
import { useAuth } from '../../hooks/useAuth';

const RenteeProfile = () => {
  const { user } = useAuth();
  
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">My Profile</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-4">
          <h2 className="text-lg font-medium mb-2">Account Information</h2>
          <p><strong>Email:</strong> {user?.email || 'Not available'}</p>
        </div>
        <p>Profile page is under development.</p>
      </div>
    </div>
  );
};

export default RenteeProfile; 