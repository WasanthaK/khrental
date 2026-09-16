import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { isDevBypassEnabled } from '../utils/env';
import { getPostLoginPath } from '../utils/authRedirect.js';
import Button from '../components/ui/Button';
import FormInput from '../components/ui/FormInput';

const DEV_BYPASS_ENABLED = isDevBypassEnabled();

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [devBypassActive, setDevBypassActive] = useState(false);
  
  const { login, setDevBypass } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if dev bypass is active
  useEffect(() => {
    const hasDevBypass = localStorage.getItem('dev_bypass_role') !== null;
    setDevBypassActive(hasDevBypass);
    console.log('[Login] Dev bypass status:', { 
      active: hasDevBypass, 
      role: localStorage.getItem('dev_bypass_role') 
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    
    setError('');
    setLoading(true);
    
    try {
      const result = await login(email, password);
      
      // First check for errors
      if (result.error) {
        throw result.error;
      }
      
      // Then check if password change is required
      if (result.requirePasswordChange) {
        console.log('User needs to change password, redirecting');
        navigate('/reset-password?forceChange=true');
        return;
      }
      
      const returnPath = getPostLoginPath(location.state, null);
      if (returnPath) {
        console.log('Login successful, returning to requested route:', returnPath);
        navigate(returnPath, { replace: true });
        return;
      }

      // If there was no protected deep link, PublicRoute will use the normal
      // portal-specific landing page once the authenticated profile is ready.
      console.log('Login successful, redirecting based on role');
    } catch (error) {
      console.error('Login error:', error);
      setError(error.message || 'Failed to log in');
    } finally {
      setLoading(false);
    }
  };
  
  // Clear development bypass
  const clearDevBypass = () => {
    localStorage.removeItem('dev_bypass_role');
    setDevBypassActive(false);
    setDevBypass(null);
    console.log('[Login] Development bypass cleared');
    window.location.reload(); // Force reload to clear any state
  };

  // Development-only bypass for authentication
  const handleDevBypass = (role) => {
    // This is only for development purposes
    // In a real application, this would never exist
    console.warn('Using development bypass for authentication. DO NOT USE IN PRODUCTION!');
    
    // Set the development bypass role
    setDevBypass(role);
    setDevBypassActive(true);
    
    // Navigate to the appropriate page based on role
    setTimeout(() => {
      if (role === 'rentee') {
        navigate('/rentee');
      } else {
        navigate('/dashboard');
      }
    }, 300); // Give a bit more time for the state to update
  };

  return (
    <div className="auth-shell flex items-center justify-center">
      <div className="auth-card space-y-8">
        <div>
          <p className="page-kicker text-center">KH Rentals</p>
          <h1 className="auth-title mt-3">
            Sign in to your workspace
          </h1>
          <p className="auth-subtitle">
            Use your account to access tenant-aware dashboards, billing, agreements, and administration tools.
          </p>
          
          {devBypassActive && (
            <div className="mt-4 flex items-center justify-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="font-medium">Development bypass is active</span>
              <Button
                onClick={clearDevBypass}
                variant="danger"
                size="sm"
              >
                Clear Bypass
              </Button>
            </div>
          )}
        </div>
        
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <FormInput
              id="email-address"
              label="Email address"
              type="email"
              autoComplete="email"
              required
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            
            <FormInput
              id="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <Link to="/register" className="font-medium text-blue-600 hover:text-blue-500">
                Create account
              </Link>
            </div>
            <div className="text-sm">
              <Link to="/reset-password" className="font-medium text-blue-600 hover:text-blue-500">
                Forgot your password?
              </Link>
            </div>
          </div>

          <div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </div>
        </form>

        {/* Development-only bypass section */}
        {DEV_BYPASS_ENABLED && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Development Bypass</h3>
            <div className="flex flex-col space-y-2">
              <Button
                onClick={() => handleDevBypass('admin')}
                variant="secondary"
                className="w-full"
              >
                Login as Admin
              </Button>
              <Button
                onClick={() => handleDevBypass('staff')}
                variant="secondary"
                className="w-full"
              >
                Login as Staff
              </Button>
              <Button
                onClick={() => handleDevBypass('rentee')}
                variant="secondary"
                className="w-full"
              >
                Login as Rentee
              </Button>
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">
              This bypass is only for development and should be removed in production.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
