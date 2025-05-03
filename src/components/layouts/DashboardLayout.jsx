import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { CogIcon, ChevronDownIcon, ChevronUpIcon, Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { USER_ROLES } from '../../utils/constants';
import { useState, useEffect } from 'react';
import NavigationRegistrar from './NavigationRegistrar';
import UserLanguageSelector from '../forms/UserLanguageSelector';
import { supabase } from '../../services/supabaseClient';
import { toast } from 'react-toastify';

const DashboardLayout = () => {
  const { user, logout, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // State for dropdown menus and mobile sidebar
  const [invoicesOpen, setInvoicesOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [invoiceHover, setInvoiceHover] = useState(false);
  const [agreementsOpen, setAgreementsOpen] = useState(false);
  const [agreementHover, setAgreementHover] = useState(false);
  
  // Check if the current route is in a specific section
  const isInvoiceRoute = location.pathname.includes('/dashboard/invoices');
  const isAgreementRoute = location.pathname.includes('/dashboard/agreements');
  
  // Force invoicesOpen state to true when on invoice routes
  useEffect(() => {
    if (isInvoiceRoute) {
      setInvoicesOpen(true);
    }
  }, [isInvoiceRoute, location.pathname]);
  
  // Force agreementsOpen state to true when on agreement routes
  useEffect(() => {
    if (isAgreementRoute) {
      setAgreementsOpen(true);
    }
  }, [isAgreementRoute, location.pathname]);
  
  // Close sidebar when route changes on mobile
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);
  
  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };
  
  const showAdminDashboard = user?.role === USER_ROLES.ADMIN;
  const showUtilities = user?.role === USER_ROLES.ADMIN || 
                         user?.role === USER_ROLES.STAFF || 
                         user?.role === USER_ROLES.MANAGER || 
                         user?.role === 'finance_staff';
  const showFinanceFeatures = user?.role === USER_ROLES.ADMIN || 
                              user?.role === USER_ROLES.MANAGER || 
                              user?.role === 'finance_staff';
  
  // Custom NavLink styling function
  const getNavLinkClass = ({ isActive }) => {
    return `flex items-center w-full px-3 py-2.5 rounded-md transition-colors text-sm font-medium no-underline ${
      isActive 
        ? 'bg-white text-blue-800 shadow-sm' 
        : 'text-white hover:bg-blue-700/50'
    }`;
  };
  
  // Dropdown item styling function
  const getDropdownItemClass = ({ isActive }) => {
    return `flex items-center w-full px-3 py-2 rounded-md transition-colors text-sm font-medium no-underline ${
      isActive 
        ? 'bg-white text-blue-800 shadow-sm' 
        : 'text-white hover:bg-blue-700/50'
    }`;
  };
  
  // Handle language change
  const handleLanguageChange = async (language) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: user.id,
          preferred_language: language,
          updated_at: new Date()
        });
        
      if (error) {
        throw error;
      }
      
      // Update local user state
      setUser({
        ...user,
        preferred_language: language
      });
      
      toast.success('Language preference updated');
    } catch (error) {
      console.error('Error updating language preference:', error);
      toast.error('Failed to update language preference');
    }
  };
  
  // Sidebar content - extracted to avoid duplication
  const SidebarContent = () => (
    <div className="flex flex-col h-full relative">
      <div className="p-4 sm:p-5 border-b border-blue-700">
        <h1 className="text-xl sm:text-2xl font-bold text-white">KH Rentals</h1>
      </div>
      
      {/* User information moved from bottom to top */}
      <div className="p-3 sm:p-4 border-b border-blue-700 bg-blue-900/50">
        <div className="flex flex-col space-y-2">
          <div className="flex items-start">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium flex-shrink-0 mr-2 sm:mr-3">
              {user?.email?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0 overflow-hidden text-left">
              <p className="text-xs text-blue-200 capitalize font-medium">{user?.role || 'User'}</p>
              <p className="font-medium text-white truncate text-xs sm:text-sm leading-tight">{user?.email}</p>
            </div>
          </div>
          
          {/* Language Selector */}
          <div className="mt-1">
            <UserLanguageSelector 
              value={user?.preferred_language || 'en'} 
              onChange={handleLanguageChange} 
            />
          </div>
          
          <button
            onClick={handleSignOut}
            className="w-full px-3 py-1.5 sm:py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-md transition-colors text-xs sm:text-sm font-medium flex items-center justify-center"
          >
            Sign Out
          </button>
        </div>
      </div>
      
      <div className="py-3 sm:py-4 px-2 sm:px-3 flex-1 overflow-y-auto">
        <nav className="space-y-1">
          <NavLink
            to="/dashboard"
            end
            className={getNavLinkClass}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/dashboard/properties"
            className={getNavLinkClass}
          >
            Properties
          </NavLink>
          <NavLink
            to="/dashboard/rentees"
            className={getNavLinkClass}
          >
            Rentees
          </NavLink>
          
          {/* Agreements dropdown */}
          <div className="relative z-20">
            <button
              onClick={() => setAgreementsOpen(!agreementsOpen)}
              onMouseEnter={() => setAgreementHover(true)}
              onMouseLeave={() => setAgreementHover(false)}
              className="flex items-center justify-between w-full px-3 py-2.5 rounded-md transition-colors text-sm font-medium text-white"
              style={{ 
                backgroundColor: (location.pathname.includes('/dashboard/agreements') || agreementsOpen) 
                  ? '#1d4ed8' 
                  : (agreementHover ? 'rgba(29, 78, 216, 0.5)' : 'transparent')
              }}
            >
              <span className="font-medium">Agreements</span>
              {agreementsOpen ? (
                <ChevronUpIcon className="w-4 h-4" />
              ) : (
                <ChevronDownIcon className="w-4 h-4" />
              )}
            </button>
            
            {agreementsOpen && (
              <div className="mt-1 ml-3 space-y-1 border-l-2 border-blue-600 pl-2 z-40 py-2 bg-blue-800">
                <NavLink
                  to="/dashboard/agreements"
                  end
                  className={getDropdownItemClass}
                >
                  All Agreements
                </NavLink>
                <NavLink
                  to="/dashboard/agreements/templates"
                  className={getDropdownItemClass}
                >
                  Templates
                </NavLink>
              </div>
            )}
          </div>
          
          {/* Invoices dropdown */}
          <div className="relative z-20">
            <button
              onClick={() => setInvoicesOpen(!invoicesOpen)}
              onMouseEnter={() => setInvoiceHover(true)}
              onMouseLeave={() => setInvoiceHover(false)}
              className="flex items-center justify-between w-full px-3 py-2.5 rounded-md transition-colors text-sm font-medium text-white"
              style={{ 
                backgroundColor: (isInvoiceRoute || invoicesOpen) 
                  ? '#1d4ed8' 
                  : (invoiceHover ? 'rgba(29, 78, 216, 0.5)' : 'transparent')
              }}
            >
              <span className="font-medium">Invoices</span>
              {invoicesOpen ? (
                <ChevronUpIcon className="w-4 h-4" />
              ) : (
                <ChevronDownIcon className="w-4 h-4" />
              )}
            </button>
            
            {invoicesOpen && (
              <div className="mt-1 ml-3 space-y-1 border-l-2 border-blue-600 pl-2 z-40 py-2 bg-blue-800">
                <NavLink
                  to="/dashboard/invoices"
                  end
                  className={getDropdownItemClass}
                >
                  All Invoices
                </NavLink>
                
                {showFinanceFeatures && (
                  <>
                    <NavLink
                      to="/dashboard/invoices/dashboard"
                      className={getDropdownItemClass}
                    >
                      Invoice Dashboard
                    </NavLink>
                    <NavLink
                      to="/dashboard/invoices/generate"
                      className={getDropdownItemClass}
                    >
                      Generate Invoices
                    </NavLink>
                    <NavLink
                      to="/dashboard/invoices/batch-generate"
                      className={getDropdownItemClass}
                    >
                      Batch Generate
                    </NavLink>
                  </>
                )}
              </div>
            )}
          </div>
          
          {showUtilities && (
            <NavLink
              to="/dashboard/utilities"
              className={getNavLinkClass}
            >
              Utility Billing
            </NavLink>
          )}
          <NavLink
            to="/dashboard/maintenance"
            className={getNavLinkClass}
          >
            Maintenance
          </NavLink>
          <NavLink
            to="/dashboard/cameras"
            className={getNavLinkClass}
          >
            Cameras
          </NavLink>
          <NavLink
            to="/dashboard/team"
            className={getNavLinkClass}
          >
            Team
          </NavLink>
          <NavLink
            to="/dashboard/settings"
            className={getNavLinkClass}
          >
            Settings
          </NavLink>
          {showAdminDashboard && (
            <NavLink
              to="/dashboard/admin-dashboard"
              className={getNavLinkClass}
            >
              Admin Dashboard
            </NavLink>
          )}
        </nav>
      </div>
    </div>
  );
  
  return (
    <>
      {/* Register navigation functions */}
      <NavigationRegistrar />
      
      <div className="flex h-screen bg-gray-100">
        {/* Mobile menu button */}
        <div className="lg:hidden fixed top-0 left-0 z-50 m-2 sm:m-4">
          <button 
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md bg-blue-800 text-white focus:outline-none focus:ring-2 focus:ring-white"
          >
            <Bars3Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
          </button>
        </div>
        
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        {/* Mobile sidebar */}
        <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-gradient-to-b from-blue-900 to-blue-800 text-white transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out lg:hidden overflow-hidden`}>
          <div className="absolute top-0 right-0 p-1 sm:p-2">
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 sm:p-2 rounded-md text-white hover:bg-blue-700 focus:outline-none"
            >
              <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="h-full overflow-hidden">
            <SidebarContent />
          </div>
        </div>
        
        {/* Desktop sidebar */}
        <div className="hidden lg:block w-64 bg-gradient-to-b from-blue-900 to-blue-800 text-white shadow-xl h-screen overflow-hidden flex-shrink-0 relative">
          <SidebarContent />
        </div>
        
        {/* Main Content */}
        <div className="flex-1 overflow-auto w-full lg:w-auto">
          <div className="p-3 sm:p-4 md:p-6 mt-10 lg:mt-0">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  );
};

export default DashboardLayout;