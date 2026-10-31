import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { getPlatformClient, getCurrentUser, signIn, signUp, signOut, resetPassword, updatePassword } from '../services/platformClient';
import { isMssqlApiEnabled, requestMssqlApi } from '../services/mssqlApiClient';
import { isDevBypassEnabled } from '../utils/env';
import { hasPermission, hasAnyPermission, hasAllPermissions } from '../utils/permissions';
import { getStoredPreferredLanguage } from '../utils/userPreferences';

// Add a debug flag at the top of the file
const DEBUG = false; // Set to false to disable auth debug logs
const DEV_BYPASS_ENABLED = isDevBypassEnabled();

// Helper function for conditional logging
const logDebug = (message, data) => {
  if (DEBUG && import.meta.env.DEV) {
    console.log(`[Auth DEBUG] ${message}`, data || '');
  }
};

// Create the context (but don't export it directly)
const AuthContext = createContext(null);

// Create the provider component
const AuthProvider = ({ children }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tenantSwitching, setTenantSwitching] = useState(false);
  const [devBypassRole, setDevBypassRole] = useState(
    DEV_BYPASS_ENABLED ? localStorage.getItem('dev_bypass_role') : null
  );
  
  // Use refs to track initialization state
  const initialized = useRef(false);
  const platformClient = getPlatformClient();

  const normalizeTenantState = (userRecord, tenantContext = null) => {
    const memberships = Array.isArray(tenantContext?.memberships)
      ? tenantContext.memberships
      : Array.isArray(userRecord?.memberships)
        ? userRecord.memberships
        : [];

    const resolvedTenantId = tenantContext?.tenantId
      || userRecord?.tenantId
      || userRecord?.tenant_id
      || null;

    const resolvedMembership = tenantContext?.membership
      || userRecord?.membership
      || memberships.find((entry) => (entry?.tenant_id || entry?.tenant?.id) === resolvedTenantId)
      || memberships.find((entry) => entry?.is_default)
      || memberships[0]
      || null;

    const resolvedTenant = tenantContext?.tenant
      || userRecord?.tenant
      || resolvedMembership?.tenant
      || null;

    const finalTenantId = resolvedTenantId
      || resolvedTenant?.id
      || resolvedMembership?.tenant_id
      || null;

    return {
      ...userRecord,
      tenantId: finalTenantId,
      tenant: resolvedTenant,
      membership: resolvedMembership,
      memberships,
      tenantResolution: tenantContext?.resolution || userRecord?.tenantResolution || (resolvedMembership ? 'resolved' : 'none'),
      hasTenantAccess: memberships.length > 0 || Boolean(finalTenantId)
    };
  };

  const mergeTenantContext = async (userRecord) => {
    try {
      const { data: tenantContext, error: tenantContextError } = await platformClient.auth.getTenantContext();

      if (tenantContextError || !tenantContext) {
        return normalizeTenantState(userRecord);
      }

      // app_users is a global identity while tenant_memberships owns organization
      // access. The legacy app_users.tenant_id may differ from the selected
      // membership, so tenant-scoped profile queries can legitimately return
      // no row. Only the authenticated server context may restore profileId.
      return normalizeTenantState({
        ...userRecord,
        profileId: userRecord?.profileId || tenantContext?.user?.id || null
      }, tenantContext);
    } catch (_error) {
      return normalizeTenantState(userRecord);
    }
  };

  // Effect for development bypass
  useEffect(() => {
    if (DEV_BYPASS_ENABLED && devBypassRole) {
      logDebug('Development bypass activated', devBypassRole);
      logDebug('localStorage dev_bypass_role', localStorage.getItem('dev_bypass_role'));
      console.warn('Using development authentication bypass. DO NOT USE IN PRODUCTION!');
      setUserData({
        id: 'dev-user-id',
        email: 'dev@example.com',
        role: devBypassRole,
        name: `Development ${devBypassRole.charAt(0).toUpperCase() + devBypassRole.slice(1)} User`,
        userType: devBypassRole,
        profileId: null,
        isDevelopmentBypass: true,
      });
      setLoading(false);
      // Set initialized to prevent normal auth from running
      initialized.current = true;
    } else {
      logDebug('No dev bypass active', {
        devBypassRole,
        userProp: !!userData,
        loading
      });
    }
  }, [devBypassRole]);

  // Fetch user profile from app_users table
  const fetchUserProfile = async (authUser) => {
    if (!authUser || !authUser.id) {
      logDebug('No auth user to fetch profile for');
      return null;
    }

    logDebug('Fetching user profile for auth ID', authUser.id);
    const preferredLanguage = getStoredPreferredLanguage(authUser.id, authUser.preferred_language || 'en');
    
    try {
      if (isMssqlApiEnabled()) {
        try {
          const appUser = await requestMssqlApi('/api/mssql/me', {
            headers: {
              'x-auth-id': authUser.id,
              ...(authUser.email ? { 'x-user-email': authUser.email } : {})
            }
          });

          if (appUser) {
            logDebug('Found MSSQL app user profile', appUser);
            return await mergeTenantContext({
              ...authUser,
              role: appUser.role || authUser.role || 'authenticated',
              name: appUser.name || authUser.email?.split('@')[0] || 'User',
              profileId: appUser.id,
              profileType: appUser.user_type,
              contactDetails: appUser.contact_details || {},
              userType: appUser.user_type,
              profile_image_url: appUser.profile_image_url || null,
              preferred_language: preferredLanguage
            });
          }
        } catch (mssqlError) {
          console.error('[Auth DEBUG] Error fetching app user from MSSQL:', mssqlError.message);
        }
      }

      // Check app_users table
      const { data: appUser, error: appUserError } = await platformClient
        .from('app_users')
        .select('*')
        .eq('auth_id', authUser.id)
        .maybeSingle(); // Use maybeSingle instead of single to avoid errors if user doesn't exist
      
      if (appUserError) {
        console.error('[Auth DEBUG] Error fetching app user:', appUserError.message);
        // Continue with auth user rather than completely failing
        console.log('[Auth DEBUG] Falling back to basic auth user');
        return await mergeTenantContext({
          ...authUser,
          role: authUser.role || 'authenticated',
          name: authUser.email?.split('@')[0] || 'User',
          preferred_language: preferredLanguage
        });
      }

      if (appUser) {
        logDebug('Found app user profile', appUser);
        // Merge auth user with app user profile
        return await mergeTenantContext({
          ...authUser,
          role: appUser.role || authUser.role || 'authenticated',
          name: appUser.name || authUser.email?.split('@')[0] || 'User',
          profileId: appUser.id,
          profileType: appUser.user_type,
          contactDetails: appUser.contact_details || {},
          userType: appUser.user_type,
          profile_image_url: appUser.profile_image_url || null,
          preferred_language: preferredLanguage
        });
      }
      
      // If no profile found, return the auth user with some defaults
      logDebug('No profile found for user, using default auth user');
      return await mergeTenantContext({
        ...authUser,
        role: authUser.role || 'authenticated',
        name: authUser.email?.split('@')[0] || 'User',
        preferred_language: preferredLanguage
      });
    } catch (err) {
      console.error('[Auth DEBUG] Error fetching user profile:', err.message);
      // Don't fail completely, return the auth user with minimal info
      return await mergeTenantContext({
        ...authUser,
        role: authUser.role || 'authenticated',
        name: authUser.email?.split('@')[0] || 'User',
        preferred_language: preferredLanguage
      });
    }
  };

  const refreshTenantContext = async (authUser = null) => {
    const fallbackAuthUser = authUser || userData || null;

    try {
      const { data: currentUserData, error: currentUserError } = await getCurrentUser();

      if (currentUserError) {
        throw currentUserError;
      }

      const activeAuthUser = currentUserData?.user || fallbackAuthUser;

      if (!activeAuthUser?.id) {
        setUserData(null);
        return { data: null, error: null };
      }

      const refreshedUser = await fetchUserProfile(activeAuthUser);
      setUserData(refreshedUser);

      return { data: refreshedUser, error: null };
    } catch (refreshError) {
      return { data: null, error: refreshError };
    }
  };

  const switchTenant = async (tenantId) => {
    try {
      setTenantSwitching(true);
      setError(null);

      if (!tenantId) {
        throw new Error('A tenant selection is required.');
      }

      const { error: switchError } = await platformClient.auth.setActiveTenant(tenantId);

      if (switchError) {
        throw switchError;
      }

      const { data: refreshedUser, error: refreshError } = await refreshTenantContext();

      if (refreshError) {
        throw refreshError;
      }

      return { data: refreshedUser, error: null };
    } catch (tenantError) {
      console.error('[Auth] Error switching tenant:', tenantError.message);
      setError(tenantError.message || 'Failed to switch tenant');
      return { data: null, error: tenantError };
    } finally {
      setTenantSwitching(false);
    }
  };

  // Effect for normal authentication - run only once on mount
  useEffect(() => {
    // Skip if we're using development bypass or already initialized
    if (initialized.current) {
      logDebug('Skipping normal auth - already initialized');
      return;
    }
    
    logDebug('Initializing normal authentication');
    initialized.current = true;
    
    let active=true;
    let generation=0;
    const applySession=async session=>{
      const request=++generation;
      setLoading(true);
      try {
        const profile=session?.user?await fetchUserProfile(session.user):null;
        if(active&&request===generation){setUserData(profile);}
      } catch {
        if(active&&request===generation){
          setUserData(null);setError('We couldn’t load your account. Please sign in again.');
        }
      } finally {
        if(active&&request===generation){setLoading(false);}
      }
    };
    // Subscribe before reading startup state. A later sign-in/out wins over
    // any outstanding bootstrap read or profile response for an older session.
    const {data:{subscription}}=platformClient.auth.onAuthStateChange(
      (_event,session)=>{if(active){void applySession(session);}}
    );
    const startupGeneration=generation;
    platformClient.auth.getSession().then(({data,error:sessionError})=>{
      if(!active||generation!==startupGeneration){return;}
      if(sessionError){setError(sessionError.message);setLoading(false);return;}
      void applySession(data?.session||null);
    }).catch(()=>{
      if(active&&generation===startupGeneration){
        setError('We couldn’t load your account. Please sign in again.');setLoading(false);
      }
    });
    return ()=>{
      active=false;generation++;
      subscription.unsubscribe();
      initialized.current=false;
    };
  }, []); // Empty dependency array - run only once

  // Login function
  const login = async (email, password) => {
    try {
      logDebug('Login attempt for email', email);
      setLoading(true);
      setError(null);
      
      // Validate inputs
      if (!email || !password) {
        setError('Email and password are required');
        setLoading(false);
        return { error: { message: 'Email and password are required' } };
      }
      
      // Log environment information for debugging
      console.log('[Auth] Environment check:', {
        window_env: window?._env_ ? "Available" : "Not available",
        import_meta: typeof import.meta !== 'undefined' ? "Available" : "Not available",
        apiEndpoint: window?._env_?.VITE_API_ENDPOINT || import.meta.env?.VITE_API_ENDPOINT || window?.location?.origin || 'not set',
        useMssqlApi: window?._env_?.VITE_USE_MSSQL_API || import.meta.env?.VITE_USE_MSSQL_API || 'not set'
      });
      
      console.log('[Auth] Calling signIn function...');
      const { data, error } = await signIn(email, password);
      console.log('[Auth] SignIn complete, checking results:', { 
        success: !error, 
        hasData: !!data,
        hasUser: !!data?.user,
        hasSession: !!data?.session 
      });
      
      logDebug('Login result', {
        success: !error,
        hasSession: !!data?.session,
        userId: data?.user?.id,
        userRole: data?.user?.role,
        error: error ? { message: error.message, status: error.status } : null
      });

      // Handle login errors
      if (error) {
        console.error('[Auth] Login error:', error.message);
        
        // Handle specific error cases
        if (error.message.includes('Invalid login credentials')) {
          setError('Email or password is incorrect');
        } 
        else if (error.message.includes('Email not confirmed')) {
          setError('Please confirm your email before logging in');
        }
        else {
          setError(error.message || 'An error occurred during login');
        }
        
        setLoading(false);
        return { error };
      }
      
      // Fetch user profile after successful login
      let resolvedProfile=null;
      if (data?.user) {
        logDebug('Login successful, fetching user profile');
        console.log('[Auth] Login successful, fetching user profile for:', data.user.id);
        const userWithProfile = await fetchUserProfile(data.user);
        console.log('[Auth] User profile fetched:', { 
          hasProfile: !!userWithProfile, 
          role: userWithProfile?.role,
          id: userWithProfile?.id
        });
        const current=await platformClient.auth.getSession();
        if(current?.error||current?.data?.session?.access_token!==data.session?.access_token){
          return {error:{message:'Your session changed. Please continue with the account currently signed in.'}};
        }
        setUserData(userWithProfile);
        resolvedProfile=userWithProfile;

        // Check if user needs to change password
        if (data.user.user_metadata?.force_password_change) {
          console.log('[Auth] User needs to change password');
          // Return a special flag for the login component to handle
          return { 
            data, 
            requirePasswordChange: true 
          };
        }
      } else {
        console.warn('[Auth] Login successful but no user data returned');
      }
      
      setLoading(false);
      return { data, profile:resolvedProfile };
    } catch (error) {
      console.error('[Auth] Error logging in:', error.message);
      
      // Create a more user-friendly error message
      let userMessage = 'Failed to log in. Please try again.';
      
      if (error.message?.toLowerCase().includes('network') || 
          error.message?.toLowerCase().includes('fetch')) {
        userMessage = 'Network error. Please check your internet connection.';
      } else if (error.message?.toLowerCase().includes('credentials') || 
                error.message?.toLowerCase().includes('password')) {
        userMessage = 'Email or password is incorrect. Please try again.';
      } else if (error.message?.toLowerCase().includes('too many requests')) {
        userMessage = 'Too many login attempts. Please try again later.';
      }
      
      setError(userMessage);
      return { error: { message: userMessage } };
    } finally {
      setLoading(false);
    }
  };

  // Register function
  const register = async (email, password) => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await signUp(email, password);
      
      if (error) {
        throw error;
      }
      
      return { data };
    } catch (error) {
      console.error('[Auth] Error registering:', error.message);
      setError(error.message);
      return { error };
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    try {
      setLoading(true);
      setError(null);
      const { error } = await signOut();
      
      if (error) {
        throw error;
      }
      
      setUserData(null);
      return {};
    } catch (error) {
      console.error('[Auth] Error logging out:', error.message);
      setError(error.message);
      return { error };
    } finally {
      setLoading(false);
    }
  };

  // Development bypass function
  const setDevBypass = (role) => {
    if (DEV_BYPASS_ENABLED) {
      logDebug('Setting dev bypass role', role);
      localStorage.setItem('dev_bypass_role', role);
      setDevBypassRole(role);
    }
  };

  // Permission check functions
  const checkPermission = (permission) => hasPermission(userData, permission);
  const checkAnyPermission = (permissions) => hasAnyPermission(userData, permissions);
  const checkAllPermissions = (permissions) => hasAllPermissions(userData, permissions);

  // Password reset functions
  const sendPasswordResetEmail = async (email) => {
    try {
      logDebug('Sending password reset email to', email);
      setLoading(true);
      setError(null);
      const { error } = await resetPassword(email);
      
      if (error) {
        throw error;
      }
      
      return { success: true };
    } catch (err) {
      console.error('[Auth DEBUG] Password reset email error:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const setNewPassword = async (newPassword) => {
    try {
      logDebug('Setting new password');
      setLoading(true);
      setError(null);
      const { error } = await updatePassword(newPassword);
      
      if (error) {
        throw error;
      }
      
      return { success: true };
    } catch (err) {
      console.error('[Auth DEBUG] Set new password error:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const memberships = Array.isArray(userData?.memberships) ? userData.memberships : [];
  const activeMembership = userData?.membership
    || memberships.find((entry) => (entry?.tenant_id || entry?.tenant?.id) === userData?.tenantId)
    || memberships.find((entry) => entry?.is_default)
    || memberships[0]
    || null;
  const activeTenant = userData?.tenant || activeMembership?.tenant || null;
  const activeTenantId = userData?.tenantId || activeTenant?.id || activeMembership?.tenant_id || null;
  const hasMultipleTenants = memberships.length > 1;
  const hasTenantAccess = !!userData && (userData?.hasTenantAccess || memberships.length > 0 || !!activeTenantId);

  // Create context value
  const value = {
    user: userData,
    userData,
    setUser: setUserData,
    loading,
    error,
    isAuthenticated: !!userData,
    activeTenant,
    activeTenantId,
    membership: activeMembership,
    memberships,
    hasMultipleTenants,
    hasTenantAccess,
    isSwitchingTenant: tenantSwitching,
    login,
    register,
    logout,
    switchTenant,
    refreshTenantContext,
    setDevBypass,
    hasPermission: checkPermission,
    hasAnyPermission: checkAnyPermission,
    hasAllPermissions: checkAllPermissions,
    sendPasswordResetEmail,
    setNewPassword
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Create the hook
const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Export only the hook and provider for better HMR compatibility
export { AuthProvider, useAuth };
