import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getDefaultLandingPath } from '../utils/accessPolicy.js';

const Unauthorized = () => {
  const { user, switchTenant, isSwitchingTenant, logout } = useAuth();
  const navigate = useNavigate();
  const [selectionError, setSelectionError] = useState(null);

  if (user?.tenantResolution === 'selection-required') {
    const selectWorkspace = async (tenantId) => {
      setSelectionError(null);
      const { data, error } = await switchTenant(tenantId);
      if (error || !data?.tenantContextVerified || !data?.membership
          || String(data.membership.tenant_id).toLowerCase() !== String(tenantId).toLowerCase()) {
        setSelectionError(error?.message || 'We could not open this organization. Please try again.');
        return;
      }
      navigate(getDefaultLandingPath({ user: data, membership: data.membership }), { replace: true });
    };

    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
        <div className="max-w-md w-full space-y-6 rounded-xl border bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm text-gray-600 break-words">{user.email}</p>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">Choose an organization</h1>
            <p className="mt-2 text-sm text-gray-600">Your account belongs to more than one organization. Choose where to continue.</p>
          </div>
          {selectionError && <p role="alert" className="text-sm text-red-700">{selectionError}</p>}
          <div className="space-y-3">
            {user.memberships.map((entry) => (
              <button key={entry.tenant_id} type="button" disabled={isSwitchingTenant}
                onClick={() => selectWorkspace(entry.tenant_id)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-left text-gray-900 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                <span className="block font-semibold">{entry.tenant?.name || 'Organization'}</span>
                <span className="block text-sm text-gray-600">{['rentee', 'tenant'].includes(entry.role) ? 'Renter' : entry.role === 'admin' ? 'Administrator' : 'Staff'}</span>
              </button>
            ))}
          </div>
          {isSwitchingTenant && <p role="status" className="text-sm text-gray-600">Opening your organization…</p>}
          <button type="button" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}
            className="text-sm text-blue-700 underline">Sign out</button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Access Denied
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            You don't have permission to access this page.
          </p>
        </div>

        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                Your current role ({user?.role || 'Unknown'}) doesn't have the necessary permissions for this action.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <Link
            to="/"
            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Unauthorized;
