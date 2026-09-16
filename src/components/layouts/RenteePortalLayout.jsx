import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getPortalLabel } from '../../utils/accessPolicy.js';
import NavigationRegistrar from './NavigationRegistrar';
import { useState, useEffect } from 'react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import MobileNav from '../navigation/MobileNav';
import TenantSwitcher from '../common/TenantSwitcher';

const RenteePortalLayout = () => {
  const { user, membership, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const subject = { user, membership: membership || user?.membership || null };
  const portalLabel = getPortalLabel(subject);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getNavLinkClass = ({ isActive }) => {
    return `flex items-center w-full px-3 py-2.5 rounded-md transition-colors text-sm font-medium no-underline ${
      isActive
        ? 'bg-white text-green-800 shadow-sm'
        : 'text-white hover:bg-green-700/50'
    }`;
  };

  const navigationContent = (
    <nav className="space-y-1.5">
      <NavLink to="/rentee" end className={getNavLinkClass}>
        Dashboard
      </NavLink>
      <NavLink to="/rentee/profile" className={getNavLinkClass}>
        My Profile
      </NavLink>
      <NavLink to="/rentee/invoices" className={getNavLinkClass}>
        Invoices & Payments
      </NavLink>
      <NavLink to="/rentee/agreements" className={getNavLinkClass}>
        Agreements
      </NavLink>
      <NavLink to="/rentee/maintenance" className={getNavLinkClass}>
        Maintenance Requests
      </NavLink>
      <NavLink to="/rentee/utilities" className={getNavLinkClass}>
        Utility Readings
      </NavLink>
    </nav>
  );

  return (
    <>
      <NavigationRegistrar />

      <div className="flex flex-col h-screen bg-gray-100 md:flex-row">
        <header className="bg-green-900 text-white p-4 flex justify-between items-center md:hidden">
          <h1 className="text-xl font-bold">KH Rentals Tenant Portal</h1>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-md bg-green-800 hover:bg-green-700"
          >
            {mobileMenuOpen ? (
              <XMarkIcon className="w-6 h-6" />
            ) : (
              <Bars3Icon className="w-6 h-6" />
            )}
          </button>
        </header>

        {mobileMenuOpen && (
          <div className="bg-gradient-to-b from-green-900 to-green-800 text-white w-full h-full fixed top-16 left-0 z-40 overflow-y-auto md:hidden pb-20">
            <div className="py-4 px-3">
              {navigationContent}
            </div>
            <div className="absolute bottom-0 w-full border-t border-green-700 p-4 bg-green-900/50">
              <div className="space-y-3">
                <TenantSwitcher />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white truncate">{user?.email}</p>
                    <p className="text-xs text-green-100 mt-0.5">{portalLabel}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded-md transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="hidden md:block w-64 bg-gradient-to-b from-green-900 to-green-800 text-white shadow-xl h-screen overflow-y-auto flex-shrink-0">
          <div className="p-5 border-b border-green-700">
            <h1 className="text-2xl font-bold text-white">KH Rentals Tenant Portal</h1>
          </div>
          <div className="py-4 px-3">
            {navigationContent}
          </div>
          <div className="absolute bottom-0 w-64 border-t border-green-700 p-4 bg-green-900/50">
            <div className="space-y-3">
              <TenantSwitcher />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white truncate">{user?.email}</p>
                  <p className="text-xs text-green-100 mt-0.5">{portalLabel}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded-md transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="bg-white shadow-sm p-4 hidden md:flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-800">Tenant Portal</h1>
            <div className="flex items-center space-x-4">
              <TenantSwitcher compact />
              <span className="text-sm text-gray-600">{user?.email}</span>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-6 pb-20 md:pb-6">
            <Outlet />
          </main>
        </div>

        <MobileNav isTenantPortal={true} />
      </div>
    </>
  );
};

export default RenteePortalLayout;
