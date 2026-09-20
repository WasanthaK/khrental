import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { ChevronDownIcon, ChevronUpIcon, Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth';
import usePlatformAdminStatus from '../../hooks/usePlatformAdminStatus';
import { getPortalLabel } from '../../utils/accessPolicy.js';
import {
  WORKSPACE_SECTIONS,
  canAccessWorkspaceSection,
  canManageInvoices
} from '../../utils/navigationPolicy.js';
import NavigationRegistrar from './NavigationRegistrar';
import UserLanguageSelector from '../forms/UserLanguageSelector';
import TenantSwitcher from '../common/TenantSwitcher';
import { setStoredPreferredLanguage } from '../../utils/userPreferences';

const DashboardLayout = () => {
  const { user, membership, logout, setUser } = useAuth();
  const { isPlatformAdmin, loading: platformAdminLoading } = usePlatformAdminStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const subject = { user, membership: membership || user?.membership || null };

  const [invoicesOpen, setInvoicesOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [invoiceHover, setInvoiceHover] = useState(false);
  const [agreementsOpen, setAgreementsOpen] = useState(false);
  const [agreementHover, setAgreementHover] = useState(false);

  const isInvoiceRoute = location.pathname.includes('/dashboard/invoices');
  const isAgreementRoute = location.pathname.includes('/dashboard/agreements');
  const showTenantWorkspace = !platformAdminLoading && !isPlatformAdmin;

  const showProperties = showTenantWorkspace && canAccessWorkspaceSection(subject, WORKSPACE_SECTIONS.PROPERTIES);
  const showRentees = showTenantWorkspace && canAccessWorkspaceSection(subject, WORKSPACE_SECTIONS.RENTEES);
  const showAgreements = showTenantWorkspace && canAccessWorkspaceSection(subject, WORKSPACE_SECTIONS.AGREEMENTS);
  const showInvoices = showTenantWorkspace && canAccessWorkspaceSection(subject, WORKSPACE_SECTIONS.INVOICES);
  const showUtilities = showTenantWorkspace && canAccessWorkspaceSection(subject, WORKSPACE_SECTIONS.UTILITIES);
  const showMaintenance = showTenantWorkspace && canAccessWorkspaceSection(subject, WORKSPACE_SECTIONS.MAINTENANCE);
  const showCameras = showTenantWorkspace && canAccessWorkspaceSection(subject, WORKSPACE_SECTIONS.CAMERAS);
  const showTeam = showTenantWorkspace && canAccessWorkspaceSection(subject, WORKSPACE_SECTIONS.TEAM);
  const showSettings = showTenantWorkspace && canAccessWorkspaceSection(subject, WORKSPACE_SECTIONS.SETTINGS);
  const showInvoiceManagement = showTenantWorkspace && canManageInvoices(subject);
  const portalLabel = isPlatformAdmin ? 'Platform Administrator' : getPortalLabel(subject);

  useEffect(() => {
    if (isInvoiceRoute) {
      setInvoicesOpen(true);
    }
  }, [isInvoiceRoute]);

  useEffect(() => {
    if (isAgreementRoute) {
      setAgreementsOpen(true);
    }
  }, [isAgreementRoute]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (platformAdminLoading || !isPlatformAdmin) {
      return;
    }

    if (location.pathname !== '/dashboard/tenant-admin') {
      navigate('/dashboard/tenant-admin', { replace: true });
    }
  }, [isPlatformAdmin, platformAdminLoading, location.pathname, navigate]);

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  const getNavLinkClass = ({ isActive }) => `flex items-center w-full rounded-2xl px-3 py-2.5 text-sm font-medium no-underline transition ${
    isActive
      ? 'bg-white text-slate-950 shadow-sm shadow-slate-950/5'
      : 'text-slate-200 hover:bg-white/10 hover:text-white'
  }`;

  const getDropdownItemClass = ({ isActive }) => `flex items-center w-full rounded-2xl px-3 py-2 text-sm font-medium no-underline transition ${
    isActive
      ? 'bg-white text-slate-950 shadow-sm shadow-slate-950/5'
      : 'text-slate-200 hover:bg-white/10 hover:text-white'
  }`;

  const getSectionToggleClass = (isOpen, isHovered) => `flex items-center justify-between w-full rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
    isOpen
      ? 'bg-white/12 text-white shadow-inner'
      : isHovered
        ? 'bg-white/8 text-white'
        : 'text-slate-200 hover:bg-white/8 hover:text-white'
  }`;

  const handleLanguageChange = async (language) => {
    try {
      setStoredPreferredLanguage(user?.id, language);
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

  const SidebarContent = () => (
    <div className="relative flex h-full flex-col">
      <div className="border-b border-white/10 p-4 sm:p-5">
        <p className="text-[11px] uppercase tracking-[0.28em] text-sky-200">Workspace</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">KH Rentals</h1>
      </div>

      <div className="border-b border-white/10 bg-white/5 p-3 backdrop-blur-sm sm:p-4">
        <div className="flex flex-col space-y-2">
          <div className="flex items-start">
            <div className="mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-400/20 text-sm font-semibold text-white sm:mr-3 sm:h-9 sm:w-9">
              {user?.email?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden text-left">
              <p className="text-xs font-medium text-sky-200">{portalLabel}</p>
              <p className="truncate text-xs font-medium leading-tight text-white sm:text-sm">{user?.email}</p>
            </div>
          </div>

          {!isPlatformAdmin && (
            <>
              <div className="mt-1">
                <UserLanguageSelector
                  value={user?.preferred_language || 'en'}
                  onChange={handleLanguageChange}
                />
              </div>
              <TenantSwitcher />
            </>
          )}

          <button
            onClick={handleSignOut}
            className="flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/8 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/14 sm:text-sm"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 sm:px-3 sm:py-4">
        <nav className="space-y-1">
          {showTenantWorkspace && (
            <NavLink to="/dashboard" end className={getNavLinkClass}>
              Dashboard
            </NavLink>
          )}

          {showProperties && (
            <NavLink to="/dashboard/properties" className={getNavLinkClass}>
              Properties
            </NavLink>
          )}

          {showRentees && (
            <NavLink to="/dashboard/rentees" className={getNavLinkClass}>
              Tenants
            </NavLink>
          )}

          {showAgreements && (
            <div className="relative z-20">
              <button
                onClick={() => setAgreementsOpen(!agreementsOpen)}
                onMouseEnter={() => setAgreementHover(true)}
                onMouseLeave={() => setAgreementHover(false)}
                className={getSectionToggleClass(isAgreementRoute || agreementsOpen, agreementHover)}
              >
                <span className="font-medium">Agreements</span>
                {agreementsOpen ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
              </button>

              {agreementsOpen && (
                <div className="z-40 ml-3 mt-2 space-y-1 border-l border-white/15 py-1 pl-3">
                  <NavLink to="/dashboard/agreements" end className={getDropdownItemClass}>
                    All Agreements
                  </NavLink>
                  <NavLink to="/dashboard/agreements/templates" className={getDropdownItemClass}>
                    Templates
                  </NavLink>
                </div>
              )}
            </div>
          )}

          {showInvoices && (
            <div className="relative z-20">
              <button
                onClick={() => setInvoicesOpen(!invoicesOpen)}
                onMouseEnter={() => setInvoiceHover(true)}
                onMouseLeave={() => setInvoiceHover(false)}
                className={getSectionToggleClass(isInvoiceRoute || invoicesOpen, invoiceHover)}
              >
                <span className="font-medium">Invoices</span>
                {invoicesOpen ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
              </button>

              {invoicesOpen && (
                <div className="z-40 ml-3 mt-2 space-y-1 border-l border-white/15 py-1 pl-3">
                  <NavLink to="/dashboard/invoices" end className={getDropdownItemClass}>
                    All Invoices
                  </NavLink>
                  {showInvoiceManagement && (
                    <>
                      <NavLink to="/dashboard/invoices/dashboard" className={getDropdownItemClass}>
                        Invoice Dashboard
                      </NavLink>
                      <NavLink to="/dashboard/invoices/generate" className={getDropdownItemClass}>
                        Generate Invoices
                      </NavLink>
                      <NavLink to="/dashboard/invoices/batch-generate" className={getDropdownItemClass}>
                        Batch Generate
                      </NavLink>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {showUtilities && (
            <NavLink to="/dashboard/utilities" className={getNavLinkClass}>
              Utility Billing
            </NavLink>
          )}

          {showMaintenance && (
            <NavLink to="/dashboard/maintenance" className={getNavLinkClass}>
              Maintenance
            </NavLink>
          )}

          {showCameras && (
            <NavLink to="/dashboard/cameras" className={getNavLinkClass}>
              Cameras
            </NavLink>
          )}

          {showTeam && (
            <NavLink to="/dashboard/team" className={getNavLinkClass}>
              Team
            </NavLink>
          )}

          {showSettings && (
            <NavLink to="/dashboard/settings" className={getNavLinkClass}>
              Settings
            </NavLink>
          )}

          {isPlatformAdmin && (
            <NavLink to="/dashboard/tenant-admin" className={getNavLinkClass}>
              Platform Admin
            </NavLink>
          )}
        </nav>
      </div>
    </div>
  );

  return (
    <>
      <NavigationRegistrar />

      <div className="flex min-h-screen bg-transparent">
        <div className="fixed left-0 top-0 z-50 m-2 lg:hidden sm:m-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-100"
            aria-label="Open navigation"
          >
            <Bars3Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
          </button>
        </div>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <div className={`fixed inset-y-0 left-0 z-50 w-72 transform overflow-hidden bg-gradient-to-b from-slate-950 via-sky-950 to-blue-900 text-white transition-transform duration-300 ease-in-out lg:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="absolute right-0 top-0 p-1 sm:p-2">
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-2xl p-1.5 text-white hover:bg-white/10 focus:outline-none sm:p-2"
              aria-label="Close navigation"
            >
              <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="h-full overflow-hidden">
            <SidebarContent />
          </div>
        </div>

        <div className="relative hidden h-screen w-72 flex-shrink-0 overflow-hidden bg-gradient-to-b from-slate-950 via-sky-950 to-blue-900 text-white shadow-2xl shadow-sky-950/10 lg:block">
          <SidebarContent />
        </div>

        <div className="w-full flex-1 overflow-auto lg:w-auto">
          <div className="mt-10 p-3 sm:p-4 md:p-6 lg:mt-0 lg:p-8">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  );
};

export default DashboardLayout;