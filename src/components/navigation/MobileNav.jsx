import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  WrenchScrewdriverIcon,
  UserIcon,
  BuildingOffice2Icon
} from '@heroicons/react/24/outline';
import { useAuth } from '../../hooks/useAuth';
import { WORKSPACE_SECTIONS, canAccessWorkspaceSection } from '../../utils/navigationPolicy.js';

const MobileNav = ({ isRenteePortal = false }) => {
  const location = useLocation();
  const { user, membership } = useAuth();
  const subject = { user, membership: membership || user?.membership || null };

  const tenantClass = ({ isActive }) => `flex flex-col items-center justify-center px-2 py-1 text-xs ${
    isActive ? 'text-green-600' : 'text-gray-600'
  }`;

  const workspaceClass = ({ isActive }) => `flex flex-col items-center justify-center px-2 py-1 text-xs ${
    isActive ? 'text-blue-600' : 'text-gray-600'
  }`;

  if (isRenteePortal) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white shadow-lg md:hidden">
        <div className="grid h-16 grid-cols-5">
          <NavLink to="/rentee" end className={tenantClass}>
            <HomeIcon className="mb-1 h-6 w-6" />
            <span>Home</span>
          </NavLink>
          <NavLink to="/rentee/invoices" className={tenantClass}>
            <CurrencyDollarIcon className="mb-1 h-6 w-6" />
            <span>Invoices</span>
          </NavLink>
          <NavLink to="/rentee/utilities" className={tenantClass}>
            <DocumentTextIcon className="mb-1 h-6 w-6" />
            <span>Utilities</span>
          </NavLink>
          <NavLink to="/rentee/maintenance" className={tenantClass}>
            <WrenchScrewdriverIcon className="mb-1 h-6 w-6" />
            <span>Maintenance</span>
          </NavLink>
          <NavLink to="/rentee/profile" className={tenantClass}>
            <UserIcon className="mb-1 h-6 w-6" />
            <span>Profile</span>
          </NavLink>
        </div>
      </div>
    );
  }

  const showProperties = canAccessWorkspaceSection(subject, WORKSPACE_SECTIONS.PROPERTIES);
  const showInvoices = canAccessWorkspaceSection(subject, WORKSPACE_SECTIONS.INVOICES);
  const showUtilities = canAccessWorkspaceSection(subject, WORKSPACE_SECTIONS.UTILITIES);
  const showMaintenance = canAccessWorkspaceSection(subject, WORKSPACE_SECTIONS.MAINTENANCE);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white shadow-lg md:hidden">
      <div className="grid h-16 grid-cols-5">
        <NavLink to="/dashboard" end className={workspaceClass}>
          <HomeIcon className="mb-1 h-6 w-6" />
          <span>Home</span>
        </NavLink>

        {showProperties && (
          <NavLink to="/dashboard/properties" className={workspaceClass}>
            <BuildingOffice2Icon className="mb-1 h-6 w-6" />
            <span>Properties</span>
          </NavLink>
        )}

        {showInvoices && (
          <NavLink
            to="/dashboard/invoices"
            className={({ isActive }) => `flex flex-col items-center justify-center px-2 py-1 text-xs ${
              isActive || location.pathname.includes('/dashboard/invoices') ? 'text-blue-600' : 'text-gray-600'
            }`}
          >
            <CurrencyDollarIcon className="mb-1 h-6 w-6" />
            <span>Invoices</span>
          </NavLink>
        )}

        {showUtilities && (
          <NavLink to="/dashboard/utilities" className={workspaceClass}>
            <DocumentTextIcon className="mb-1 h-6 w-6" />
            <span>Utilities</span>
          </NavLink>
        )}

        {showMaintenance && (
          <NavLink to="/dashboard/maintenance" className={workspaceClass}>
            <WrenchScrewdriverIcon className="mb-1 h-6 w-6" />
            <span>Maintenance</span>
          </NavLink>
        )}
      </div>
    </div>
  );
};

export default MobileNav;
