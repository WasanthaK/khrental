import { Outlet, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { CogIcon, ChevronDownIcon, ChevronUpIcon, Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { USER_ROLES } from '../../utils/constants';
import { useState, useEffect } from 'react';
import NavigationRegistrar from './NavigationRegistrar';
import UserLanguageSelector from '../forms/UserLanguageSelector';
import { toast } from 'react-toastify';
import TenantSwitcher from '../common/TenantSwitcher';
import { setStoredPreferredLanguage } from '../../utils/userPreferences';

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
  const isTeamRoute = location.pathname === '/dashboard/team' || location.pathname.startsWith('/dashboard/team/');
  
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
  const showTeamAdministration = user?.role === USER_ROLES.ADMIN;
  const showUtilities = user?.role === USER_ROLES.ADMIN || 
                         user?.role === USER_ROLES.STAFF || 
                         user?.role === USER_ROLES.MANAGER || 
                         user?.role === 'finance_staff';
  const showFinanceFeatures = user?.role === USER_ROLES.ADMIN || 
                              user?.role === USER_ROLES.MANAGER || 
                              user?.role === 'finance_staff';
  
  // Custom NavLink styling function
  const getNavLinkClass = ({ isActive }) => {
    return `flex items-center w-full rounded-2xl px-3 py-2.5 text-sm font-medium no-underline transition ${
      isActive 
        ? 'bg-white text-slate-950 shadow-sm shadow-slate-950/5' 
        : 'text-slate-200 hover:bg-white/10 hover:text-white'
    }`;
  };
  
  // Dropdown item styling function
  const getDropdownItemClass = ({ isActive }) => {
    return `flex items-center w-full rounded-2xl px-3 py-2 text-sm font-medium no-underline transition ${
      isActive 
        ? 'bg-white text-slate-950 shadow-sm shadow-slate-950/5' 
        : 'text-slate-200 hover:bg-white/10 hover:text-white'
    }`;
  };

  const getSectionToggleClass = (isOpen, isHovered) => `flex items-center justify-between w-full rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
    isOpen
      ? 'bg-white/12 text-white shadow-inner'
      : isHovered
        ? 'bg-white/8 text-white'
        : 'text-slate-200 hover:bg-white/8 hover:text-white'
  }`;
  
  // Handle language change
  const handleLanguageChange = async (language) => {
    try {
      setStoredPreferredLanguage(user?.id, language);

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
      <div className="border-b border-white/10 p-4 sm:p-5">
        <p className="text-[11px] uppercase tracking-[0.28em] text-sky-200">Workspace</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">KH Rentals</h1>
      </div>
      
      {/* User information moved from bottom to top */}
      <div className="border-b border-white/10 bg-white/5 p-3 sm:p-4 backdrop-blur-sm">
        <div className="flex flex-col space-y-2">
          <div className="flex items-start">
            <div className="mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-400/20 text-sm font-semibold text-white sm:mr-3 sm:h-9 sm:w-9">
              {user?.email?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0 overflow-hidden text-left">
              <p className="text-xs font-medium capitalize text-sky-200">{user?.role || 'User'}</p>
              <p className="truncate text-xs font-medium leading-tight text-white sm:text-sm">{user?.email}</p>
            </div>
          </div>
          
          {/* Language Selector */}
          <div className="mt-1">
            <UserLanguageSelector 
              value={user?.preferred_language || 'en'} 
              onChange={handleLanguageChange} 
            />
          </div>

          <TenantSwitcher />
          
          <button
            onClick={handleSignOut}
            className="flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/8 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/14 sm:text-sm"
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
              className={getSectionToggleClass(location.pathname.includes('/dashboard/agreements') || agreementsOpen, agreementHover)}
            >
              <span className="font-medium">Agreements</span>
              {agreementsOpen ? (
                <ChevronUpIcon className="w-4 h-4" />
              ) : (
                <ChevronDownIcon className="w-4 h-4" />
              )}
            </button>
            
            {agreementsOpen && (
              <div className="z-40 mt-2 ml-3 space-y-1 border-l border-white/15 pl-3 py-1">
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
              className={getSectionToggleClass(isInvoiceRoute || invoicesOpen, invoiceHover)}
            >
              <span className="font-medium">Invoices</span>
              {invoicesOpen ? (
                <ChevronUpIcon className="w-4 h-4" />
              ) : (
                <ChevronDownIcon className="w-4 h-4" />
              )}
            </button>
            
            {invoicesOpen && (
              <div className="z-40 mt-2 ml-3 space-y-1 border-l border-white/15 pl-3 py-1">
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
          {showTeamAdministration && (
            <NavLink
              to="/dashboard/team"
              className={getNavLinkClass}
            >
              Team
            </NavLink>
          )}
          <NavLink
            to="/dashboard/settings"
            className={getNavLinkClass}
          >
            Settings
          </NavLink>
          {showAdminDashboard && (
            <>
              <NavLink
                to="/dashboard/tenant-admin"
                className={getNavLinkClass}
              >
                Tenant Admin
              </NavLink>
              <NavLink
                to="/dashboard/admin-dashboard"
                className={getNavLinkClass}
              >
                Admin Dashboard
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </div>
  );

  if (isTeamRoute && !showTeamAdministration) {
    return <Navigate to="/unauthorized" replace />;
  }
  
  return (
    <>
      {/* Register navigation functions */}
      <NavigationRegistrar />
      
      <div className="flex min-h-screen bg-transparent">
        {/* Mobile menu button */}
        <div className="lg:hidden fixed top-0 left-0 z-50 m-2 sm:m-4">
          <button 
            onClick={() => setSidebarOpen(true)}
            className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-100"
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
        <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-slate-950 via-sky-950 to-blue-900 text-white transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out lg:hidden overflow-hidden`}>
          <div className="absolute top-0 right-0 p-1 sm:p-2">
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-2xl p-1.5 text-white hover:bg-white/10 focus:outline-none sm:p-2"
            >
              <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="h-full overflow-hidden">
            <SidebarContent />
          </div>
        </div>
        
        {/* Desktop sidebar */}
        <div className="relative hidden h-screen w-72 flex-shrink-0 overflow-hidden bg-gradient-to-b from-slate-950 via-sky-950 to-blue-900 text-white shadow-2xl shadow-sky-950/10 lg:block">
          <SidebarContent />
        </div>
        
        {/* Main Content */}
        <div className="flex-1 overflow-auto w-full lg:w-auto">
          <div className="mt-10 p-3 sm:p-4 md:p-6 lg:mt-0 lg:p-8">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  );
};

export default DashboardLayout;