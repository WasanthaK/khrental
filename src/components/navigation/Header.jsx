import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

/**
 * Header component for admin layout
 */
const Header = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };
  
  return (
    <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
      <h1 className="text-xl font-semibold text-gray-800">Admin Dashboard</h1>
      
      <div className="flex items-center space-x-4">
        {user && (
          <>
            <span className="text-sm text-gray-600">{user.email}</span>
            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 bg-gray-700 text-white text-sm rounded-md hover:bg-gray-600 transition-colors"
            >
              Sign Out
            </button>
          </>
        )}
      </div>
    </header>
  );
};

export default Header; 