import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';

// A simple version of the email diagnostic component with no UI dependencies
const SimpleEmailTest = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [testType, setTestType] = useState('config');
  
  const runConfigTest = async () => {
    setLoading(true);
    setResults(null);
    
    try {
      // Simulate a configuration test instead of calling actual functions
      await new Promise(resolve => setTimeout(resolve, 1500));
      const configResults = {
        success: true,
        sendgrid: {
          status: "configured",
          apiKeyPresent: true
        },
        supabase: {
          status: "configured",
          url: "https://example.supabase.co"
        },
        message: "This is a simulated response. For actual testing, use the real diagnostics page."
      };
      
      console.log('Simulated config test results:', configResults);
      setResults({
        type: 'config',
        data: configResults
      });
    } catch (error) {
      console.error('Config test error:', error);
      setResults({
        type: 'config',
        error: error.message,
        stack: error.stack
      });
    } finally {
      setLoading(false);
    }
  };

  const runInviteTest = async () => {
    if (!inviteEmail) {
      setResults({
        type: 'invite',
        error: 'Email is required'
      });
      return;
    }

    setLoading(true);
    setResults(null);
    
    try {
      // Create a test user just for diagnostic purposes
      const testUser = {
        id: `test_${Date.now()}`,
        email: inviteEmail,
        name: inviteName || 'Test User',
        role: 'staff'
      };
      
      // Simulate an invitation test
      await new Promise(resolve => setTimeout(resolve, 1500));
      const inviteResult = {
        success: true,
        method: "simulated",
        recipient: testUser.email,
        name: testUser.name,
        message: "This is a simulated response. For actual testing, use the real diagnostics page."
      };
      
      console.log('Simulated invite test results:', inviteResult);
      
      setResults({
        type: 'invite',
        data: inviteResult,
        user: testUser,
        baseUrl: 'http://localhost:5174'
      });
    } catch (error) {
      console.error('Invite test error:', error);
      setResults({
        type: 'invite',
        error: error.message,
        stack: error.stack
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRunTest = async () => {
    if (testType === 'config') {
      await runConfigTest();
    } else {
      await runInviteTest();
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="bg-white p-6 rounded shadow-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold mb-2">Email Diagnostics</h1>
          <p className="text-gray-600">
            This is a simplified version that simulates the testing process.
          </p>
        </div>
        
        <div className="mb-4">
          <div className="font-bold mb-2">Test Type:</div>
          <div className="flex space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                value="config"
                checked={testType === 'config'}
                onChange={() => setTestType('config')}
                className="mr-2"
              />
              Configuration Test
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                value="invite"
                checked={testType === 'invite'}
                onChange={() => setTestType('invite')}
                className="mr-2"
              />
              Invitation Test
            </label>
          </div>
        </div>
        
        {testType === 'invite' && (
          <div className="mb-4">
            <div className="mb-3">
              <label className="block mb-1 font-medium">Email:</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Enter email for test invitation"
              />
            </div>
            <div>
              <label className="block mb-1 font-medium">Name:</label>
              <input
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Enter name for test invitation"
              />
            </div>
          </div>
        )}
        
        <button
          onClick={handleRunTest}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
        >
          {loading ? 'Running Test...' : 'Run Test'}
        </button>
        
        {results && (
          <div className="mt-6 border rounded p-4">
            <h2 className="text-lg font-bold mb-3">Test Results:</h2>
            
            {results.error ? (
              <div className="bg-red-100 border-l-4 border-red-500 p-4 mb-4">
                <div className="font-bold text-red-700">Error: {results.error}</div>
                {results.stack && (
                  <pre className="mt-2 text-xs overflow-x-auto whitespace-pre-wrap">
                    {results.stack}
                  </pre>
                )}
              </div>
            ) : (
              <div>
                <div className="bg-green-100 border-l-4 border-green-500 p-4 mb-4">
                  <div className="font-bold text-green-700">Test completed successfully! (Simulated)</div>
                </div>
                
                {results.type === 'config' && results.data && (
                  <pre className="bg-gray-100 p-4 rounded text-sm overflow-x-auto">
                    {JSON.stringify(results.data, null, 2)}
                  </pre>
                )}
                
                {results.type === 'invite' && results.data && (
                  <div>
                    <p className="mb-1">
                      Invitation sent to: <strong>{results.user?.email}</strong>
                    </p>
                    <p className="mb-3 text-sm text-gray-600">
                      Note: This is a simulated response. No actual email was sent.
                    </p>
                    <pre className="bg-gray-100 p-4 rounded text-sm overflow-x-auto">
                      {JSON.stringify(results.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-8 pt-4 border-t text-center text-gray-500">
          <p>To run actual tests, use the real diagnostics page at <a href="/diagnostics/email" className="text-blue-500 underline">/diagnostics/email</a> when logged in as admin.</p>
        </div>
      </div>
    </div>
  );
};

// Render directly to the DOM
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SimpleEmailTest />
  </React.StrictMode>
);

export default SimpleEmailTest; 