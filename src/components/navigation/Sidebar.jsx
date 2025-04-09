import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

/**
 * Sidebar navigation component for admin layout
 */
const Sidebar = () => {
  const location = useLocation();
  
  // State for dropdown menus - default to open
  const [invoicesOpen, setInvoicesOpen] = useState(true);
  
  // Check if the current route is in a specific section
  const isInvoiceRoute = location.pathname.includes('/admin/invoices');
  
  // Open dropdown if the current route is within that section
  useEffect(() => {
    if (isInvoiceRoute) {
      setInvoicesOpen(true);
    }
  }, [isInvoiceRoute]);
  
  // Custom NavLink styling function
  const getNavLinkClass = ({ isActive }) => {
    return `flex items-center w-full px-3 py-2.5 rounded-md transition-colors text-sm font-medium no-underline ${
      isActive 
        ? 'bg-white text-gray-800 shadow-sm' 
        : 'text-white hover:bg-gray-700/50'
    }`;
  };
  
  // Dropdown item styling function
  const getDropdownItemClass = ({ isActive }) => {
    return `flex items-center w-full px-3 py-2 rounded-md transition-colors text-sm font-medium no-underline ${
      isActive 
        ? 'bg-white text-gray-800 shadow-sm' 
        : 'text-white hover:bg-gray-700/50'
    }`;
  };
  
  return (
    <div className="w-64 bg-gradient-to-b from-gray-900 to-gray-800 text-white shadow-xl h-full overflow-y-auto">
      <div className="p-5 border-b border-gray-700">
        <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
      </div>
      <div className="py-4 px-3">
        <nav className="space-y-1.5">
          <NavLink
            to="/admin"
            end
            className={getNavLinkClass}
          >
            Dashboard
          </NavLink>
          
          <NavLink
            to="/admin/rentees"
            className={getNavLinkClass}
          >
            Rentees
          </NavLink>
          
          <NavLink
            to="/admin/agreements"
            className={getNavLinkClass}
          >
            Agreements
          </NavLink>
          
          {/* Invoices dropdown */}
          <div className="relative z-10">
            <button
              onClick={() => setInvoicesOpen(!invoicesOpen)}
              className={`flex items-center justify-between w-full px-3 py-2.5 rounded-md transition-colors text-sm font-medium ${
                isInvoiceRoute 
                  ? 'bg-white text-gray-800 shadow-sm' 
                  : 'text-white hover:bg-gray-700/50'
              }`}
            >
              <span className="font-semibold">Invoices</span>
              {invoicesOpen ? (
                <ChevronUpIcon className="w-4 h-4" />
              ) : (
                <ChevronDownIcon className="w-4 h-4" />
              )}
            </button>
            
            {invoicesOpen && (
              <div className="mt-1 ml-3 space-y-1 border-l-2 border-gray-600 pl-2">
                <NavLink
                  to="/admin/invoices"
                  end
                  className={getDropdownItemClass}
                >
                  All Invoices
                </NavLink>
                <NavLink
                  to="/admin/invoices/dashboard"
                  className={getDropdownItemClass}
                >
                  Invoice Dashboard
                </NavLink>
                <NavLink
                  to="/admin/invoices/batch-generate"
                  className={getDropdownItemClass}
                >
                  Generate Invoices
                </NavLink>
              </div>
            )}
          </div>
          
          <NavLink
            to="/admin/users"
            className={getNavLinkClass}
          >
            Users
          </NavLink>
          
          <NavLink
            to="/admin/settings"
            className={getNavLinkClass}
          >
            Settings
          </NavLink>
        </nav>
      </div>
    </div>
  );
};

export default Sidebar; 