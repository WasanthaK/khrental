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
import { USER_ROLES } from '../../utils/constants';

/**
 * Mobile bottom navigation component - shows a simplified navigation
 * for mobile devices with large touch targets at the bottom of the screen
 * 
 * @param {Object} props
 * @param {string} props.userRole - The user's role to determine which navigation items to show
 * @param {boolean} props.isRenteePortal - Whether this is for the rentee portal or admin dashboard
 */
const MobileNav = ({ userRole, isRenteePortal = false }) => {
  const location = useLocation();
  
  // Define navigation items based on portal type
  const renderNavItems = () => {
    if (isRenteePortal) {
      // Rentee portal navigation
      return (
        <>
          <NavLink 
            to="/rentee" 
            end
            className={({ isActive }) => 
              `flex flex-col items-center justify-center px-2 py-1 text-xs ${
                isActive ? 'text-green-600' : 'text-gray-600'
              }`
            }
          >
            <HomeIcon className="w-6 h-6 mb-1" />
            <span>Home</span>
          </NavLink>
          
          <NavLink 
            to="/rentee/invoices" 
            className={({ isActive }) => 
              `flex flex-col items-center justify-center px-2 py-1 text-xs ${
                isActive ? 'text-green-600' : 'text-gray-600'
              }`
            }
          >
            <CurrencyDollarIcon className="w-6 h-6 mb-1" />
            <span>Invoices</span>
          </NavLink>
          
          <NavLink 
            to="/rentee/utilities" 
            className={({ isActive }) => 
              `flex flex-col items-center justify-center px-2 py-1 text-xs ${
                isActive ? 'text-green-600' : 'text-gray-600'
              }`
            }
          >
            <DocumentTextIcon className="w-6 h-6 mb-1" />
            <span>Utilities</span>
          </NavLink>
          
          <NavLink 
            to="/rentee/maintenance" 
            className={({ isActive }) => 
              `flex flex-col items-center justify-center px-2 py-1 text-xs ${
                isActive ? 'text-green-600' : 'text-gray-600'
              }`
            }
          >
            <WrenchScrewdriverIcon className="w-6 h-6 mb-1" />
            <span>Maintenance</span>
          </NavLink>
          
          <NavLink 
            to="/rentee/profile" 
            className={({ isActive }) => 
              `flex flex-col items-center justify-center px-2 py-1 text-xs ${
                isActive ? 'text-green-600' : 'text-gray-600'
              }`
            }
          >
            <UserIcon className="w-6 h-6 mb-1" />
            <span>Profile</span>
          </NavLink>
        </>
      );
    } else {
      // Admin/Dashboard navigation - simplified for mobile
      return (
        <>
          <NavLink 
            to="/dashboard" 
            end
            className={({ isActive }) => 
              `flex flex-col items-center justify-center px-2 py-1 text-xs ${
                isActive ? 'text-blue-600' : 'text-gray-600'
              }`
            }
          >
            <HomeIcon className="w-6 h-6 mb-1" />
            <span>Home</span>
          </NavLink>
          
          <NavLink 
            to="/dashboard/properties" 
            className={({ isActive }) => 
              `flex flex-col items-center justify-center px-2 py-1 text-xs ${
                isActive ? 'text-blue-600' : 'text-gray-600'
              }`
            }
          >
            <BuildingOffice2Icon className="w-6 h-6 mb-1" />
            <span>Properties</span>
          </NavLink>
          
          <NavLink 
            to="/dashboard/invoices" 
            className={({ isActive }) => 
              `flex flex-col items-center justify-center px-2 py-1 text-xs ${
                isActive || location.pathname.includes('/dashboard/invoices') 
                  ? 'text-blue-600' 
                  : 'text-gray-600'
              }`
            }
          >
            <CurrencyDollarIcon className="w-6 h-6 mb-1" />
            <span>Invoices</span>
          </NavLink>
          
          {(userRole === USER_ROLES.ADMIN || 
            userRole === USER_ROLES.STAFF || 
            userRole === USER_ROLES.MANAGER || 
            userRole === 'finance_staff') && (
            <NavLink 
              to="/dashboard/utilities" 
              className={({ isActive }) => 
                `flex flex-col items-center justify-center px-2 py-1 text-xs ${
                  isActive ? 'text-blue-600' : 'text-gray-600'
                }`
              }
            >
              <DocumentTextIcon className="w-6 h-6 mb-1" />
              <span>Utilities</span>
            </NavLink>
          )}
          
          <NavLink 
            to="/dashboard/maintenance" 
            className={({ isActive }) => 
              `flex flex-col items-center justify-center px-2 py-1 text-xs ${
                isActive ? 'text-blue-600' : 'text-gray-600'
              }`
            }
          >
            <WrenchScrewdriverIcon className="w-6 h-6 mb-1" />
            <span>Maintenance</span>
          </NavLink>
        </>
      );
    }
  };
  
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 md:hidden">
      <div className="grid grid-cols-5 h-16">
        {renderNavItems()}
      </div>
    </div>
  );
};

export default MobileNav; 