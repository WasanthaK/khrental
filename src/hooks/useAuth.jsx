import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { getSupabaseClient, getCurrentUser, signIn, signUp, signOut, resetPassword, updatePassword } from '../services/supabaseClient';
import { hasPermission, hasAnyPermission, hasAllPermissions } from '../utils/permissions';

// Add a debug flag at the top of the file
const DEBUG = false; // Set to false to disable auth debug logs

// Helper function for conditional logging
const logDebug = (message, data) => {
  if (DEBUG && import.meta.env.DEV) {
    console.log(`[Auth DEBUG] ${message}`, data || '');
  }
};

// Create the context (but don't export it directly)
const AuthContext = createContext(null);

// Add at the top of the file with other helpers
const AUTH_THROTTLE_MS = 5000; // 5 seconds between auth state processing

// Add a debounce/throttle mechanism for auth state changes
const authStateRef = {
  lastProcessedAt: 0,
  lastUser: null,
  pendingTimeout: null
};

// Throttled auth state processor
const processAuthStateChange = (session, fetchUserProfile, setUserData, setLoading) => {
  const now = Date.now();
  
  // Clear any pending timeouts
  if (authStateRef.pendingTimeout) {
    clearTimeout(authStateRef.pendingTimeout);
    authStateRef.pendingTimeout = null;
  }
  
  // If we processed auth state recently, schedule it for later
  if (now - authStateRef.lastProcessedAt < AUTH_THROTTLE_MS) {
    authStateRef.pendingTimeout = setTimeout(() => {
      processAuthStateChange(session, fetchUserProfile, setUserData, setLoading);
    }, AUTH_THROTTLE_MS - (now - authStateRef.lastProcessedAt));
    return;
  }
  
  // Update the last processed timestamp
  authStateRef.lastProcessedAt = now;
  
  // Process the auth state
  const handleAuth = async () => {
    if (session?.user) {
      // Only fetch profile if the user ID changed to prevent unnecessary processing
      if (!authStateRef.lastUser || authStateRef.lastUser.id !== session.user.id) {
        logDebug('Session user found, fetching profile');
        const userWithProfile = await fetchUserProfile(session.user);
        authStateRef.lastUser = session.user;
        setUserData(userWithProfile);
      }
    } else {
      logDebug('No session user, clearing user state');
      authStateRef.lastUser = null;
      setUserData(null);
    }
    setLoading(false);
  };
  
  handleAuth();
};

// Create the provider component
const AuthProvider = ({ children }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [devBypassRole, setDevBypassRole] = useState(
    process.env.NODE_ENV !== 'production' ? localStorage.getItem('dev_bypass_role') : null
  );
  
  // Use refs to track initialization state
  const initialized = useRef(false);
  const supabase = getSupabaseClient();

  // Effect for development bypass
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && devBypassRole) {
      logDebug('Development bypass activated', devBypassRole);
      logDebug('localStorage dev_bypass_role', localStorage.getItem('dev_bypass_role'));
      console.warn('Using development authentication bypass. DO NOT USE IN PRODUCTION!');
      setUserData({
        id: 'dev-user-id',
        email: 'dev@example.com',
        role: devBypassRole,
        name: `Development ${devBypassRole.charAt(0).toUpperCase() + devBypassRole.slice(1)} User`,
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
    
    try {
      // Check app_users table
      const { data: appUser, error: appUserError } = await supabase
        .from('app_users')
        .select('*')
        .eq('auth_id', authUser.id)
        .single();
      
      if (appUserError) {
        console.error('[Auth DEBUG] Error fetching app user:', appUserError.message);
        return authUser;
      }

      if (appUser) {
        logDebug('Found app user profile', appUser);
        // Merge auth user with app user profile
        return {
          ...authUser,
          role: appUser.role || authUser.role,
          name: appUser.name,
          profileId: appUser.id,
          profileType: appUser.user_type,
          contactDetails: appUser.contact_details || {},
          userType: appUser.user_type
        };
      }
      
      // If no profile found, return the auth user as is
      logDebug('No profile found for user, using default auth user');
      return authUser;
    } catch (err) {
      console.error('[Auth DEBUG] Error fetching user profile:', err.message);
      return authUser;
    }
  };

  // Effect for normal authentication
  useEffect(() => {
    // Skip if we're using development bypass or already initialized
    if (initialized.current) {
      logDebug('Skipping normal auth - already initialized');
      return;
    }
    
    logDebug('Initializing normal authentication');
    initialized.current = true;
    
    let authSubscription = null;
    
    const initializeAuth = async () => {
      try {
        // First check for existing session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('[Auth DEBUG] Error getting session:', sessionError);
          setError(sessionError.message);
          setLoading(false);
          return;
        }
        
        // Use the throttled processor for consistency
        processAuthStateChange(session, fetchUserProfile, setUserData, setLoading);
        
        // Set up auth state listener
        logDebug('Setting up auth state listener');
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (_event, session) => {
            logDebug('Auth state changed', {
              session: !!session,
              user: !!session?.user
            });
            
            processAuthStateChange(session, fetchUserProfile, setUserData, setLoading);
          }
        );
        
        authSubscription = subscription;
      } catch (err) {
        console.error('[Auth DEBUG] Error initializing auth:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    initializeAuth();
    
    // Clean up subscription
    return () => {
      if (authSubscription) {
        logDebug('Cleaning up auth listener subscription');
        authSubscription.unsubscribe();
      }
    };
  }, []);

  // Login function
  const login = async (email, password) => {
    try {
      logDebug('Login attempt for email', email);
      setLoading(true);
      setError(null);
      
      // Log environment information for debugging
      console.log('[Auth] Environment check:', {
        window_env: window?._env_ ? "Available" : "Not available",
        import_meta: typeof import.meta !== 'undefined' ? "Available" : "Not available",
        supabaseUrl: window?._env_?.VITE_SUPABASE_URL || import.meta.env?.VITE_SUPABASE_URL || 'not set',
        hasAnonKey: !!(window?._env_?.VITE_SUPABASE_ANON_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY)
      });
      
      const { data, error } = await signIn(email, password);
      
      logDebug('Login result', {
        success: !error,
        hasSession: !!data?.session,
        userId: data?.user?.id,
        userRole: data?.user?.role,
        error: error ? { message: error.message, status: error.status } : null
      });
      
      if (error) {
        // Check if the error is about unconfirmed email
        if (error.message.includes('Email not confirmed')) {
          // For development purposes, we'll show a more helpful error
          console.log('[Auth] Email not confirmed error');
          setError('Email not confirmed. In a production environment, you would need to confirm your email. For development, you can disable email confirmation in Supabase dashboard.');
          console.log('Development tip: To disable email confirmation, go to Supabase dashboard → Authentication → Settings → Email Auth and set "Confirm emails" to "No"');
        } 
        // Check if it's an invalid credentials error
        else if (error.message.includes('Invalid login credentials')) {
          console.log('[Auth] Invalid credentials error - debug info:');
          console.log('1. Verify the email exists in Supabase Authentication');
          console.log('2. Check if the password is correct');
          console.log('3. Ensure Supabase project URL and anon key are correct');
          console.log('4. Check browser console for network errors');
          
          setError('Invalid email or password. Please try again.');
          
          // This is a common error, return early with a clean error message
          return { error: { message: 'Invalid email or password. Please try again.' } };
        }
        // Network errors
        else if (error.message?.toLowerCase().includes('network') || 
                error.message?.toLowerCase().includes('fetch')) {
          console.log('[Auth] Network error during login');
          setError('Network error. Please check your internet connection and try again.');
          
          return { error: { message: 'Network error. Please check your internet connection and try again.' } };
        }
        else {
          throw error;
        }
        
        return { error };
      }
      
      // Fetch user profile after successful login
      if (data?.user) {
        logDebug('Login successful, fetching user profile');
        const userWithProfile = await fetchUserProfile(data.user);
        setUserData(userWithProfile);
      }
      
      return { data };
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
    if (process.env.NODE_ENV !== 'production') {
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

  // Create context value
  const value = {
    user: userData,
    userData,
    loading,
    error,
    isAuthenticated: !!userData,
    login,
    register,
    logout,
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