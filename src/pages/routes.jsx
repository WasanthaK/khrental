import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import PublicRoute from '../components/PublicRoute';
import AccountSetup from '../pages/AccountSetup';

const RoutesComponent = () => {
  return (
    <Router>
      <Routes>
        {/* ... existing routes ... */}

        <Route
          path="account-setup"
          element={
            <PublicRoute>
              <AccountSetup />
            </PublicRoute>
          }
        />

        {/* ... existing routes ... */}
      </Routes>
    </Router>
  );
};

export default RoutesComponent; 