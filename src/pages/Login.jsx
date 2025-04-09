import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [devBypassActive, setDevBypassActive] = useState(false);
  
  const { login, setDevBypass } = useAuth();
  const navigate = useNavigate();
  
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
    setError('');
    setLoading(true);
    
    try {
      const { error } = await login(email, password);
      
      if (error) {
        throw error;
      }
      
      // Redirect based on user role (handled by AuthProvider)
    } catch (error) {
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to KH Rentals
          </h2>
          
          {devBypassActive && (
            <div className="mt-2 text-center">
              <span className="text-red-500 text-sm font-medium">Development bypass is active</span>
              <button 
                onClick={clearDevBypass}
                className="ml-2 text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded"
              >
                Clear Bypass
              </button>
            </div>
          )}
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <Link to="/reset-password" className="font-medium text-blue-600 hover:text-blue-500">
                Forgot your password?
              </Link>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
          
          <div className="text-sm text-center">
            <Link to="/register" className="font-medium text-blue-600 hover:text-blue-500">
              Don't have an account? Register
            </Link>
          </div>
        </form>

        {/* Development-only bypass section */}
        {process.env.NODE_ENV !== 'production' && (
          <div className="mt-8 border-t pt-6">
            <h3 className="text-center text-sm font-medium text-red-600 mb-4">Development Bypass</h3>
            <div className="flex flex-col space-y-2">
              <button
                onClick={() => handleDevBypass('admin')}
                className="py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
              >
                Login as Admin
              </button>
              <button
                onClick={() => handleDevBypass('staff')}
                className="py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
              >
                Login as Staff
              </button>
              <button
                onClick={() => handleDevBypass('rentee')}
                className="py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
              >
                Login as Rentee
              </button>
            </div>
            <p className="text-xs text-center text-gray-500 mt-2">
              This bypass is only for development and should be removed in production.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login; 