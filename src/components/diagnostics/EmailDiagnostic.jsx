import { useState } from 'react';
import { testEmailConfiguration } from '../../services/directEmailService';
import { inviteUser } from '../../services/invitationService';
import { getAppBaseUrl } from '../../utils/env';

const EmailDiagnostic = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [testType, setTestType] = useState('config');

  const runConfigTest = async () => {
    setLoading(true);
    setResults(null);
    
    try {
      const configResults = await testEmailConfiguration();
      setResults({
        type: 'config',
        data: configResults
      });
    } catch (error) {
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
      
      const baseUrl = getAppBaseUrl();
      console.log('Base URL for invitation test:', baseUrl);

      const inviteResult = await inviteUser(testUser, false);
      
      setResults({
        type: 'invite',
        data: inviteResult,
        user: testUser,
        baseUrl
      });
    } catch (error) {
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

  const testSupabaseFunction = async () => {
    // Get the Supabase URL and anon key
    const supabaseUrl = window._env_?.VITE_SUPABASE_URL || 
                       import.meta.env?.VITE_SUPABASE_URL;
    const supabaseAnonKey = window._env_?.VITE_SUPABASE_ANON_KEY || 
                             import.meta.env?.VITE_SUPABASE_ANON_KEY;
    
    console.log('Testing Supabase Edge Function');
    console.log('URL:', supabaseUrl);
    
    try {
      const functionUrl = `${supabaseUrl}/functions/v1/sendgrid-email`;
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({
          to: 'test@example.com', // Replace with your test email
          subject: 'Test from Supabase Edge Function',
          html: '<p>This is a test email from the Supabase Edge Function.</p>',
          text: 'This is a test email from the Supabase Edge Function.'
        })
      });
      
      const result = await response.json();
      console.log('Edge Function Response:', result);
      return result;
    } catch (error) {
      console.error('Error testing edge function:', error);
      return { error: error.message };
    }
  };

  // Make the function accessible from the window object for testing from the console
  if (typeof window !== 'undefined') {
    window.testSupabaseFunction = testSupabaseFunction;
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Email System Diagnostics</h1>
      
      <div className="mb-4">
        <button 
          type="button"
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={testSupabaseFunction}
        >
          Test Supabase Edge Function
        </button>
        <small className="block mt-1 text-gray-500">
          This will test the connection to your Supabase Edge Function directly.
          Check the console for results.
        </small>
      </div>
      
      <div className="bg-gray-100 p-4 rounded mb-4">
        <p className="mb-2"><strong>Note:</strong> This page is for diagnosing email configuration issues.</p>
        <p className="mb-2">Base URL from environment: <strong>{getAppBaseUrl()}</strong></p>
        <p>Test results will appear in the console and below.</p>
      </div>
      
      <div className="mb-4">
        <label className="block mb-2">Test Type:</label>
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
          <div className="mb-2">
            <label className="block mb-1">Email:</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="Enter email for test invitation"
            />
          </div>
          <div>
            <label className="block mb-1">Name:</label>
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
          <h2 className="text-xl font-bold mb-2">Test Results</h2>
          
          {results.type === 'config' && (
            <div>
              <p className="mb-2">
                Status: {results.data?.success ? (
                  <span className="text-green-600 font-bold">Success</span>
                ) : (
                  <span className="text-red-600 font-bold">Failed</span>
                )}
              </p>
              
              {results.data?.configuration && (
                <div className="mb-4">
                  <h3 className="font-bold mb-1">Configuration:</h3>
                  <pre className="bg-gray-100 p-2 rounded overflow-x-auto">
                    {JSON.stringify(results.data.configuration, null, 2)}
                  </pre>
                </div>
              )}
              
              {results.data?.testResult && (
                <div className="mb-4">
                  <h3 className="font-bold mb-1">Email Test Result:</h3>
                  <pre className="bg-gray-100 p-2 rounded overflow-x-auto">
                    {JSON.stringify(results.data.testResult, null, 2)}
                  </pre>
                </div>
              )}
              
              {results.error && (
                <div>
                  <h3 className="font-bold text-red-600 mb-1">Error:</h3>
                  <pre className="bg-red-50 text-red-800 p-2 rounded overflow-x-auto">
                    {results.error}
                    {results.stack && `\n\n${results.stack}`}
                  </pre>
                </div>
              )}
            </div>
          )}
          
          {results.type === 'invite' && (
            <div>
              <p className="mb-2">
                Status: {results.data?.success ? (
                  <span className="text-green-600 font-bold">Success</span>
                ) : (
                  <span className="text-red-600 font-bold">Failed</span>
                )}
              </p>
              
              {results.baseUrl && (
                <p className="mb-2">Base URL: <strong>{results.baseUrl}</strong></p>
              )}
              
              {results.user && (
                <div className="mb-4">
                  <h3 className="font-bold mb-1">Test User:</h3>
                  <pre className="bg-gray-100 p-2 rounded overflow-x-auto">
                    {JSON.stringify(results.user, null, 2)}
                  </pre>
                </div>
              )}
              
              {results.data && (
                <div className="mb-4">
                  <h3 className="font-bold mb-1">Invitation Result:</h3>
                  <pre className="bg-gray-100 p-2 rounded overflow-x-auto">
                    {JSON.stringify(results.data, null, 2)}
                  </pre>
                </div>
              )}
              
              {results.error && (
                <div>
                  <h3 className="font-bold text-red-600 mb-1">Error:</h3>
                  <pre className="bg-red-50 text-red-800 p-2 rounded overflow-x-auto">
                    {results.error}
                    {results.stack && `\n\n${results.stack}`}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EmailDiagnostic; 