import { createBrowserRouter, Navigate, useNavigate, useParams, RouterProvider } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/common/ProtectedRoute';
import { PERMISSIONS } from './utils/permissions.jsx';
import { USER_ROLES } from './utils/constants';
import { useState, useEffect, lazy, Suspense } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from './services/supabaseClient';
import NotFound from './pages/NotFound';

// Layout components
import RootLayout from './components/layouts/RootLayout';
import DashboardLayout from './components/layouts/DashboardLayout';
import RenteePortalLayout from './components/layouts/RenteePortalLayout';
import AdminLayout from './components/layouts/AdminLayout';

// Auth pages
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import ResetPassword from './pages/ResetPassword';
import UpdatePassword from './pages/UpdatePassword';
import EviaAuthCallback from './pages/EviaAuthCallback';
import AuthDebug from './pages/AuthDebug';
import AccountSetup from './pages/AccountSetup';
import AcceptInvite from './pages/AcceptInvite';

// KH Staff pages
import Dashboard from './pages/Dashboard';
import PropertyList from './pages/PropertyList';
import PropertyForm from './pages/PropertyForm';
import PropertyDetails from './pages/PropertyDetails';
import RenteeList from './pages/RenteeList';
import RenteeForm from './pages/RenteeForm';
import RenteeDetails from './pages/RenteeDetails';
import AgreementList from './pages/AgreementList';
import AgreementFormPage from './pages/AgreementFormPage';
import AgreementFormContainer from './components/agreements/AgreementFormContainer';
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
import AdminTools from './pages/AdminTools';
import FileUploadTest from './pages/FileUploadTest';
import BucketExplorer from './components/BucketExplorer';
import AdminPanel from './pages/AdminPanel';
import AdminDashboard from './pages/AdminDashboard';
import DigitalSignatureForm from './pages/DigitalSignatureForm';
import SignatureProgressDemo from './components/agreements/SignatureProgressDemo';
import UtilityBillingReview from './pages/UtilityBillingReview';
import UtilityBillingInvoice from './pages/UtilityBillingInvoice';
import UtilityReadingsReview from './pages/staff/UtilityReadingsReview';

// Rentee Portal pages
import RenteePortal from './pages/rentee/RenteePortal';
import RenteeProfile from './pages/rentee/RenteeProfile';
import RenteeInvoices from './pages/rentee/RenteeInvoices';
import RenteeAgreements from './pages/rentee/RenteeAgreements';
import RenteeMaintenance from './pages/rentee/RenteeMaintenance';
import RenteeUtilities from './pages/rentee/RenteeUtilities';
import RenteeMaintenanceDetails from './pages/rentee/RenteeMaintenanceDetails';
import UtilityReadingForm from './pages/rentee/UtilityReadingForm';
import UtilityHistory from './pages/rentee/UtilityHistory';

// Add Unauthorized page
import Unauthorized from './pages/Unauthorized';

// Lazy loaded components
const BatchInvoiceGeneration = lazy(() => import('./pages/BatchInvoiceGeneration'));

// Import our new SetupAccount component
import SetupAccount from './pages/setup-account';

// Add a debug flag at the top of the file
const ROUTER_DEBUG = false;

// Helper function for conditional logging
const logRouter = (message, data) => {
  if (ROUTER_DEBUG && import.meta.env.DEV) {
    console.log(`[Router] ${message}`, data || '');
  }
};

// Public route component (redirects if already authenticated)
const PublicRoute = ({ children }) => {
  const { loading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [showContent, setShowContent] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  
  // Show content after 2 seconds if still loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowContent(true);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);
  
  // Track when user profile is loaded or when we're sure it's an authenticated user without a profile
  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      // Check if profile data is present
      if (user.profileId || user.role !== 'authenticated') {
        logRouter('User profile loaded', { 
          role: user.role, 
          profileId: user.profileId, 
          profileType: user.profileType 
        });
        setProfileLoaded(true);
      } else {
        // If the user has the 'authenticated' role but no profile, we can still proceed
        // This is a newly registered user who needs to link their account
        logRouter('User authenticated but no profile found, treating as new user');
        setProfileLoaded(true);
      }
    }
  }, [loading, isAuthenticated, user]);
  
  // Handle role-based redirects when authenticated and profile is loaded
  useEffect(() => {
    if (profileLoaded && user) {
      logRouter('User profile loaded, redirecting based on role:', user.role);
      
      // Redirect based on role
      if (user.role === 'authenticated') {
        // Redirect new authenticated users to dashboard instead of admin-tools
        logRouter('Redirecting authenticated user to dashboard');
        navigate('/dashboard', { replace: true });
      } else if (user.role === 'admin' || user.role === 'staff' || 
                user.role === 'maintenance_staff' || user.role === 'finance_staff' ||
                user.role === 'manager' || user.role === 'maintenance' || 
                user.role === 'supervisor') {
        logRouter('Redirecting staff to dashboard');
        navigate('/dashboard', { replace: true });
      } else if (user.role === 'rentee') {
        logRouter('Redirecting rentee to rentee portal');
        navigate('/rentee', { replace: true });
      } else {
        logRouter('Unknown role, redirecting to dashboard:', user.role);
        navigate('/dashboard', { replace: true });
      }
    }
  }, [profileLoaded, user, navigate]);
  
  // If loading but not past timeout, show loading indicator
  if (loading && !showContent) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }
  
  // If authenticated, show loading while redirect happens
  if (isAuthenticated) {
    return <div className="flex justify-center items-center h-screen">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Preparing your dashboard...</p>
      </div>
    </div>;
  }
  
  // Otherwise show the public content
  return children;
};

// Add UUID validation guard
const UuidGuard = ({ children }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isValid, setIsValid] = useState(false);
  
  useEffect(() => {
    // Specific validation for Version 4 UUIDs generated by PostgreSQL's gen_random_uuid()
    // Version 4 UUIDs have the form: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where x is any hexadecimal digit and y is one of 8, 9, a, or b
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!id) {
      setIsValid(true);
      return;
    }
    
    if (!uuidV4Regex.test(id)) {
      console.error(`Invalid UUID v4 format detected in route: ${id}`);
      navigate('/dashboard/agreements/templates', { 
        replace: true,
        state: { error: `Invalid template ID format: ${id}. Expected a valid UUID v4.` }
      });
      return;
    }
    
    setIsValid(true);
  }, [id, navigate]);
  
  if (!isValid) { return <div>Validating...</div>; }
  return children;
};

// Create router with updated configuration
const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <NotFound />,
    children: [
      {
        index: true,
        element: <Navigate to="/login" replace />,
      },
      {
        path: 'login',
        element: (
          <PublicRoute>
            <Login />
          </PublicRoute>
        ),
      },
      {
        path: 'reset-password',
        element: (
          <PublicRoute>
            <ResetPassword />
          </PublicRoute>
        ),
      },
      {
        path: 'setup-account',
        element: (
          <PublicRoute>
            <SetupAccount />
          </PublicRoute>
        ),
      },
      {
        path: 'accept-invite',
        element: (
          <PublicRoute>
            <AcceptInvite />
          </PublicRoute>
        ),
      },
      {
        path: 'update-password',
        element: (
          <PublicRoute>
            <UpdatePassword />
          </PublicRoute>
        ),
      },
      {
        path: 'account-setup',
        element: (
          <PublicRoute>
            <AccountSetup />
          </PublicRoute>
        ),
      },
      {
        path: 'auth/callback',
        element: <AuthCallback />,
      },
      {
        path: 'auth/evia-callback',
        element: <EviaAuthCallback />,
      },
      {
        path: 'auth-debug',
        element: <AuthDebug />,
      },
      {
        path: 'unauthorized',
        element: <Unauthorized />,
      },
      {
        path: 'digital-signature-test',
        element: <DigitalSignatureForm />,
      },
      
      // Dashboard routes with consistent layout
      {
        path: 'dashboard',
        element: (
          <ProtectedRoute requiredRoles={['admin', 'staff', 'manager', 'maintenance_staff', 'finance_staff', 'maintenance', 'supervisor', 'authenticated']}>
            <DashboardLayout />
          </ProtectedRoute>
        ),
        children: [
          {
            index: true,
            element: <Dashboard />,
          },
          {
            path: 'properties',
            children: [
              {
                index: true,
                element: (
                  <ProtectedRoute requiredPermissions={[PERMISSIONS.VIEW_PROPERTIES]}>
                    <PropertyList />
                  </ProtectedRoute>
                ),
              },
              {
                path: 'new',
                element: (
                  <ProtectedRoute requiredPermissions={[PERMISSIONS.CREATE_PROPERTY]}>
                    <PropertyForm />
                  </ProtectedRoute>
                ),
              },
              {
                path: ':id',
                element: (
                  <ProtectedRoute requiredPermissions={[PERMISSIONS.VIEW_PROPERTIES]}>
                    <PropertyDetails />
                  </ProtectedRoute>
                ),
              },
              {
                path: ':id/edit',
                element: (
                  <ProtectedRoute requiredPermissions={[PERMISSIONS.EDIT_PROPERTY]}>
                    <PropertyForm />
                  </ProtectedRoute>
                ),
              },
            ],
          },
          {
            path: 'rentees',
            children: [
              {
                index: true,
                element: <RenteeList />,
              },
              {
                path: 'new',
                element: <RenteeForm />,
              },
              {
                path: ':id',
                element: <RenteeDetails />,
              },
              {
                path: ':id/edit',
                element: <RenteeForm />,
              },
            ],
          },
          {
            path: 'agreements',
            children: [
              {
                index: true,
                element: <AgreementList />,
              },
              {
                path: 'new',
                element: <AgreementFormPage />,
              },
              {
                path: ':id',
                element: <AgreementFormPage />,
              },
              {
                path: 'templates',
                children: [
                  {
                    index: true,
                    element: <AgreementTemplateList />,
                  },
                  {
                    path: 'new',
                    element: <AgreementTemplateForm />,
                  },
                  {
                    path: ':id',
                    element: (
                      <UuidGuard>
                        <AgreementTemplateForm />
                      </UuidGuard>
                    ),
                  },
                  {
                    path: ':id/edit',
                    element: (
                      <UuidGuard>
                        <AgreementTemplateForm />
                      </UuidGuard>
                    ),
                  },
                ],
              },
            ],
          },
          {
            path: 'invoices',
            children: [
              {
                index: true,
                element: <InvoiceList />,
              },
              {
                path: 'new',
                element: <InvoiceForm />,
              },
              {
                path: 'batch-generate',
                element: (
                  <Suspense fallback={<div className="flex justify-center items-center h-full">Loading...</div>}>
                    <BatchInvoiceGeneration />
                  </Suspense>
                ),
              },
              {
                path: ':id',
                element: <InvoiceDetails />,
              },
            ],
          },
          {
            path: 'maintenance',
            children: [
              {
                index: true,
                element: (
                  <ProtectedRoute requiredPermissions={[PERMISSIONS.VIEW_MAINTENANCE]}>
                    <MaintenanceList />
                  </ProtectedRoute>
                ),
              },
              {
                path: 'new',
                element: (
                  <ProtectedRoute requiredPermissions={[PERMISSIONS.CREATE_MAINTENANCE]}>
                    <MaintenanceForm />
                  </ProtectedRoute>
                ),
              },
              {
                path: ':id',
                element: (
                  <ProtectedRoute requiredPermissions={[PERMISSIONS.VIEW_MAINTENANCE]}>
                    <MaintenanceDetails />
                  </ProtectedRoute>
                ),
              },
            ],
          },
          {
            path: 'utilities',
            children: [
              {
                index: true,
                element: (
                  <ProtectedRoute requiredRoles={['admin', 'staff', 'manager', 'finance_staff']}>
                    <UtilityBillingReview />
                  </ProtectedRoute>
                ),
              },
              {
                path: 'invoice/:id',
                element: (
                  <ProtectedRoute requiredRoles={['admin', 'staff', 'manager', 'finance_staff']}>
                    <UtilityBillingInvoice />
                  </ProtectedRoute>
                ),
              },
              {
                path: 'readings',
                element: (
                  <ProtectedRoute requiredRoles={['admin', 'staff', 'manager', 'finance_staff']}>
                    <UtilityReadingsReview />
                  </ProtectedRoute>
                ),
              },
            ],
          },
          {
            path: 'cameras',
            children: [
              {
                index: true,
                element: <CameraList />,
              },
              {
                path: 'new',
                element: <CameraForm />,
              },
              {
                path: ':id',
                element: <CameraDetails />,
              },
            ],
          },
          {
            path: 'team',
            children: [
              {
                index: true,
                element: <TeamList />,
              },
              {
                path: 'new',
                element: <TeamMemberForm />,
              },
              {
                path: ':id',
                element: <TeamMemberDetails />,
              },
              {
                path: ':id/edit',
                element: <TeamMemberForm />,
              },
            ],
          },
          {
            path: 'settings',
            element: <Settings />,
          },
          {
            path: 'admin',
            element: (
              <ProtectedRoute requiredRoles={[USER_ROLES.ADMIN]}>
                <AdminDashboard />
              </ProtectedRoute>
            ),
            children: [
              {
                index: true,
                element: <AdminTools />,
              },
              {
                path: 'tools',
                element: <AdminTools />,
              },
              {
                path: 'panel',
                element: <AdminPanel />,
              },
              {
                path: 'bucket-explorer',
                element: <BucketExplorer />,
              },
              {
                path: 'file-upload-test',
                element: <FileUploadTest />,
              },
            ],
          },
          {
            path: 'signature-progress-demo',
            element: (
              <ProtectedRoute requiredRoles={['admin', 'staff', 'manager']}>
                <SignatureProgressDemo />
              </ProtectedRoute>
            ),
          },
        ],
      },
      {
        path: 'rentee',
        element: (
          <ProtectedRoute requiredRoles={['rentee']}>
            <RenteePortalLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <RenteePortal /> },
          { path: 'profile', element: <RenteeProfile /> },
          { path: 'invoices', element: <RenteeInvoices /> },
          { path: 'agreements', element: <RenteeAgreements /> },
          { path: 'maintenance', element: <RenteeMaintenance /> },
          { path: 'maintenance/:id', element: <RenteeMaintenanceDetails /> },
          { path: 'utilities', element: <RenteeUtilities /> },
          { path: 'utilities/readings/new', element: <UtilityReadingForm /> },
          { path: 'utilities/history', element: <UtilityHistory /> },
        ],
      },
    ],
  },
  {
    path: '*notfound',
    element: <NotFound />
  }
], {
  basename: '/',
  future: {
    v7_normalizeFormMethod: true
  }
});

// Create a router component
const AppRouter = () => {
  return <RouterProvider router={router} />;
};

// Export the router component
export default AppRouter;

// No named exports to prevent HMR issues