import { createBrowserRouter, Navigate, useLocation, useNavigate, useParams, RouterProvider } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/common/ProtectedRoute';
import { PORTAL_TYPES } from './utils/accessModel.js';
import { PERMISSIONS, getDefaultLandingPath } from './utils/accessPolicy.js';
import { resolveLegacyAdminPath, resolveLegacyTenantPath } from './utils/routePolicy.js';
import NotFound from './pages/NotFound';

// Layout components
import RootLayout from './components/layouts/RootLayout';
import DashboardLayout from './components/layouts/DashboardLayout';
import RenteePortalLayout from './components/layouts/RenteePortalLayout';

// Auth pages
import Login from './pages/Login';
import Register from './pages/Register';
import AuthCallback from './pages/AuthCallback';
import ResetPassword from './pages/ResetPassword';
import UpdatePassword from './pages/UpdatePassword';
import EviaAuthCallback from './pages/EviaAuthCallback';
import AuthDebug from './pages/AuthDebug';
import AccountSetup from './pages/AccountSetup';
import AcceptInvite from './pages/AcceptInvite';
import SetupAccount from './pages/setup-account';

// Workspace pages
import Dashboard from './pages/Dashboard';
import PropertyList from './pages/PropertyList';
import PropertyForm from './pages/PropertyForm';
import PropertyDetails from './pages/PropertyDetails';
import RenteeList from './pages/RenteeList';
import RenteeForm from './pages/RenteeForm';
import RenteeDetails from './pages/RenteeDetails';
import AgreementList from './pages/AgreementList';
import AgreementFormPage from './pages/AgreementFormPage';
import AgreementTemplateList from './pages/AgreementTemplateList';
import AgreementTemplateForm from './pages/AgreementTemplateForm';
import InvoiceList from './pages/InvoiceList';
import InvoiceForm from './pages/InvoiceForm';
import InvoiceDetails from './pages/InvoiceDetails';
import MaintenanceList from './pages/MaintenanceList';
import MaintenanceForm from './pages/MaintenanceForm';
import MaintenanceDetails from './pages/MaintenanceDetails';
import CameraList from './pages/CameraList';
import CameraForm from './pages/CameraForm';
import CameraDetails from './pages/CameraDetails';
import TeamList from './pages/TeamList';
import TeamMemberForm from './pages/TeamMemberForm';
import TeamMemberDetails from './pages/TeamMemberDetails';
import Settings from './pages/Settings';
import TenantAdmin from './pages/TenantAdmin';
import AdminTools from './pages/AdminTools';
import FileUploadTest from './pages/FileUploadTest';
import AdminDashboard from './pages/AdminDashboard';
import DigitalSignatureForm from './pages/DigitalSignatureForm';
import SignatureProgressDemo from './components/agreements/SignatureProgressDemo';
import UtilityBillingReview from './pages/UtilityBillingReview';
import UtilityBillingInvoice from './pages/UtilityBillingInvoice';
import UtilityReadingsReview from './pages/staff/UtilityReadingsReview';

// Tenant portal pages
import RenteePortal from './pages/rentee/RenteePortal';
import RenteeProfile from './pages/rentee/RenteeProfile';
import RenteeInvoices from './pages/rentee/RenteeInvoices';
import RenteeAgreements from './pages/rentee/RenteeAgreements';
import RenteeMaintenance from './pages/rentee/RenteeMaintenance';
import RenteeUtilities from './pages/rentee/RenteeUtilities';
import RenteeMaintenanceDetails from './pages/rentee/RenteeMaintenanceDetails';
import UtilityReadingForm from './pages/rentee/UtilityReadingForm';
import UtilityHistory from './pages/rentee/UtilityHistory';

import Unauthorized from './pages/Unauthorized';
import EmailDiagnostic from './components/diagnostics/EmailDiagnostic';

const BatchInvoiceGeneration = lazy(() => import('./pages/BatchInvoiceGeneration'));

const LoadingScreen = ({ message = 'Loading...' }) => (
  <div className="flex h-screen items-center justify-center">{message}</div>
);

const PublicRoute = ({ children }) => {
  const { loading, isAuthenticated, user, membership } = useAuth();

  if (loading) {
    return <LoadingScreen message="Loading..." />;
  }

  if (isAuthenticated && user) {
    return (
      <Navigate
        to={getDefaultLandingPath({ user, membership: membership || user.membership || null })}
        replace
      />
    );
  }

  return children;
};

const UuidGuard = ({ children }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!id) {
      setIsValid(true);
      return;
    }

    if (!uuidV4Regex.test(id)) {
      navigate('/dashboard/agreements/templates', {
        replace: true,
        state: { error: `Invalid template ID format: ${id}. Expected a valid UUID v4.` }
      });
      return;
    }

    setIsValid(true);
  }, [id, navigate]);

  return isValid ? children : <LoadingScreen message="Validating..." />;
};

const LegacyRouteRedirect = ({ resolver }) => {
  const location = useLocation();
  const targetPath = resolver(location.pathname);
  return <Navigate to={`${targetPath}${location.search || ''}${location.hash || ''}`} replace />;
};

const permissionRoute = (permissions, element, requireAll = false) => (
  <ProtectedRoute requiredPermissions={permissions} requireAll={requireAll}>
    {element}
  </ProtectedRoute>
);

const adminRoute = (element) => (
  <ProtectedRoute requiredPortalTypes={[PORTAL_TYPES.ADMIN]}>
    {element}
  </ProtectedRoute>
);

const tenantPortalChildren = [
  { index: true, element: <RenteePortal /> },
  {
    path: 'profile',
    element: permissionRoute([PERMISSIONS.PROFILE_READ_SELF], <RenteeProfile />)
  },
  {
    path: 'invoices',
    element: permissionRoute([PERMISSIONS.INVOICES_READ], <RenteeInvoices />)
  },
  {
    path: 'agreements',
    element: permissionRoute([PERMISSIONS.AGREEMENTS_READ], <RenteeAgreements />)
  },
  {
    path: 'maintenance',
    children: [
      { index: true, element: <RenteeMaintenance /> },
      { path: ':id', element: <RenteeMaintenanceDetails /> }
    ]
  },
  {
    path: 'utilities',
    element: permissionRoute([PERMISSIONS.UTILITIES_READ], <RenteeUtilities />)
  },
  {
    path: 'utilities/submit',
    element: permissionRoute([PERMISSIONS.UTILITIES_READ], <UtilityReadingForm />)
  },
  {
    path: 'utilities/history',
    element: permissionRoute([PERMISSIONS.UTILITIES_READ], <UtilityHistory />)
  }
];

const routes = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <NotFound />,
    children: [
      { index: true, element: <Navigate to="/login" replace /> },
      { path: 'login', element: <PublicRoute><Login /></PublicRoute> },
      { path: 'register', element: <PublicRoute><Register /></PublicRoute> },
      { path: 'reset-password', element: <ResetPassword /> },
      { path: 'setup-account', element: <PublicRoute><SetupAccount /></PublicRoute> },
      { path: 'accept-invite', element: <PublicRoute><AcceptInvite /></PublicRoute> },
      { path: 'update-password', element: <PublicRoute><UpdatePassword /></PublicRoute> },
      { path: 'account-setup', element: <PublicRoute><AccountSetup /></PublicRoute> },
      { path: 'auth/callback', element: <AuthCallback /> },
      { path: 'auth/evia-callback', element: <EviaAuthCallback /> },
      { path: 'unauthorized', element: <Unauthorized /> },
      { path: 'auth-debug', element: adminRoute(<AuthDebug />) },
      { path: 'digital-signature-test', element: adminRoute(<DigitalSignatureForm />) },
      {
        path: 'dashboard',
        element: (
          <ProtectedRoute requiredPortalTypes={[PORTAL_TYPES.ADMIN, PORTAL_TYPES.STAFF]}>
            <DashboardLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <Dashboard /> },
          {
            path: 'properties',
            children: [
              {
                index: true,
                element: permissionRoute([PERMISSIONS.PROPERTIES_READ], <PropertyList />)
              },
              { path: 'new', element: adminRoute(<PropertyForm />) },
              {
                path: ':id',
                element: permissionRoute([PERMISSIONS.PROPERTIES_READ], <PropertyDetails />)
              },
              {
                path: ':id/edit',
                element: permissionRoute([PERMISSIONS.PROPERTIES_MANAGE], <PropertyForm />)
              }
            ]
          },
          {
            path: 'rentees',
            children: [
              {
                index: true,
                element: permissionRoute([PERMISSIONS.RENTEES_READ], <RenteeList />)
              },
              {
                path: 'new',
                element: permissionRoute([PERMISSIONS.RENTEES_MANAGE], <RenteeForm />)
              },
              {
                path: ':id',
                element: permissionRoute([PERMISSIONS.RENTEES_READ], <RenteeDetails />)
              },
              {
                path: ':id/edit',
                element: permissionRoute([PERMISSIONS.RENTEES_MANAGE], <RenteeForm />)
              }
            ]
          },
          {
            path: 'agreements',
            children: [
              {
                index: true,
                element: permissionRoute([PERMISSIONS.AGREEMENTS_READ], <AgreementList />)
              },
              {
                path: 'new',
                element: permissionRoute([PERMISSIONS.AGREEMENTS_MANAGE], <AgreementFormPage />)
              },
              {
                path: ':id',
                element: permissionRoute([PERMISSIONS.AGREEMENTS_MANAGE], <AgreementFormPage />)
              },
              {
                path: 'templates',
                children: [
                  {
                    index: true,
                    element: permissionRoute([PERMISSIONS.AGREEMENTS_READ], <AgreementTemplateList />)
                  },
                  {
                    path: 'new',
                    element: permissionRoute([PERMISSIONS.AGREEMENTS_MANAGE], <AgreementTemplateForm />)
                  },
                  {
                    path: ':id',
                    element: permissionRoute(
                      [PERMISSIONS.AGREEMENTS_MANAGE],
                      <UuidGuard><AgreementTemplateForm /></UuidGuard>
                    )
                  },
                  {
                    path: ':id/edit',
                    element: permissionRoute(
                      [PERMISSIONS.AGREEMENTS_MANAGE],
                      <UuidGuard><AgreementTemplateForm /></UuidGuard>
                    )
                  }
                ]
              }
            ]
          },
          {
            path: 'invoices',
            children: [
              {
                index: true,
                element: permissionRoute([PERMISSIONS.INVOICES_READ], <InvoiceList />)
              },
              {
                path: 'new',
                element: permissionRoute([PERMISSIONS.INVOICES_MANAGE], <InvoiceForm />)
              },
              {
                path: 'generate',
                element: permissionRoute([PERMISSIONS.INVOICES_MANAGE], <InvoiceForm />)
              },
              {
                path: 'dashboard',
                element: permissionRoute([PERMISSIONS.INVOICES_MANAGE], <InvoiceList />)
              },
              {
                path: 'batch-generate',
                element: permissionRoute(
                  [PERMISSIONS.INVOICES_MANAGE],
                  <Suspense fallback={<LoadingScreen message="Loading..." />}>
                    <BatchInvoiceGeneration />
                  </Suspense>
                )
              },
              {
                path: ':id',
                element: permissionRoute([PERMISSIONS.INVOICES_READ], <InvoiceDetails />)
              }
            ]
          },
          {
            path: 'maintenance',
            children: [
              {
                index: true,
                element: permissionRoute(
                  [PERMISSIONS.MAINTENANCE_MANAGE, PERMISSIONS.MAINTENANCE_READ_ASSIGNED],
                  <MaintenanceList />
                )
              },
              { path: 'new', element: adminRoute(<MaintenanceForm />) },
              {
                path: ':id',
                element: permissionRoute(
                  [PERMISSIONS.MAINTENANCE_MANAGE, PERMISSIONS.MAINTENANCE_READ_ASSIGNED],
                  <MaintenanceDetails />
                )
              }
            ]
          },
          {
            path: 'utilities',
            children: [
              {
                index: true,
                element: permissionRoute([PERMISSIONS.UTILITIES_REVIEW], <UtilityBillingReview />)
              },
              {
                path: 'invoicing',
                element: permissionRoute([PERMISSIONS.UTILITIES_REVIEW], <UtilityBillingInvoice />)
              },
              {
                path: 'review',
                element: permissionRoute([PERMISSIONS.UTILITIES_REVIEW], <UtilityReadingsReview />)
              }
            ]
          },
          {
            path: 'cameras',
            children: [
              {
                index: true,
                element: permissionRoute([PERMISSIONS.CAMERAS_READ], <CameraList />)
              },
              {
                path: 'new',
                element: permissionRoute([PERMISSIONS.CAMERAS_MANAGE], <CameraForm />)
              },
              {
                path: ':id',
                element: permissionRoute([PERMISSIONS.CAMERAS_READ], <CameraDetails />)
              }
            ]
          },
          {
            path: 'team',
            children: [
              {
                index: true,
                element: permissionRoute([PERMISSIONS.MEMBERSHIPS_MANAGE], <TeamList />)
              },
              {
                path: 'new',
                element: permissionRoute([PERMISSIONS.MEMBERSHIPS_MANAGE], <TeamMemberForm />)
              },
              {
                path: ':id',
                element: permissionRoute([PERMISSIONS.MEMBERSHIPS_MANAGE], <TeamMemberDetails />)
              },
              {
                path: ':id/edit',
                element: permissionRoute([PERMISSIONS.MEMBERSHIPS_MANAGE], <TeamMemberForm />)
              }
            ]
          },
          {
            path: 'tenant-admin',
            element: permissionRoute([PERMISSIONS.MEMBERSHIPS_MANAGE], <TenantAdmin />)
          },
          {
            path: 'settings',
            element: permissionRoute([PERMISSIONS.TENANT_SETTINGS_MANAGE], <Settings />)
          },
          {
            path: 'file-upload-test',
            element: permissionRoute([PERMISSIONS.TENANT_SETTINGS_MANAGE], <FileUploadTest />)
          },
          {
            path: 'admin-dashboard',
            element: permissionRoute([PERMISSIONS.TENANT_SETTINGS_MANAGE], <AdminDashboard />),
            children: [
              { index: true, element: <AdminTools /> },
              { path: 'file-upload-test', element: <FileUploadTest /> },
              { path: 'email-diagnostics', element: <EmailDiagnostic /> }
            ]
          },
          {
            path: 'admin-tools',
            element: permissionRoute([PERMISSIONS.TENANT_SETTINGS_MANAGE], <AdminTools />)
          },
          {
            path: 'signature-progress-demo',
            element: permissionRoute([PERMISSIONS.AGREEMENTS_MANAGE], <SignatureProgressDemo />)
          },
          {
            path: 'direct-email-test',
            element: permissionRoute([PERMISSIONS.TENANT_SETTINGS_MANAGE], <EmailDiagnostic />)
          }
        ]
      },
      {
        path: 'rentee',
        element: (
          <ProtectedRoute requiredPortalTypes={[PORTAL_TYPES.TENANT]}>
            <RenteePortalLayout />
          </ProtectedRoute>
        ),
        children: tenantPortalChildren
      },
      {
        path: 'portal/*',
        element: (
          <ProtectedRoute requiredPortalTypes={[PORTAL_TYPES.TENANT]}>
            <LegacyRouteRedirect resolver={resolveLegacyTenantPath} />
          </ProtectedRoute>
        )
      },
      {
        path: 'admin/*',
        element: adminRoute(<LegacyRouteRedirect resolver={resolveLegacyAdminPath} />)
      },
      { path: 'diagnostics/email', element: adminRoute(<EmailDiagnostic />) }
    ]
  },
  { path: '*', element: <NotFound /> }
];

export default function AppRouter() {
  const router = createBrowserRouter(routes, {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true
    }
  });

  return <RouterProvider router={router} />;
}
