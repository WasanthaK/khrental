import React, { useEffect, useState } from 'react';

const EnvVarStatus = () => {
  const [envStatus, setEnvStatus] = useState({
    processEnv: {
      clientId: null,
      clientSecret: null,
      accessToken: null
    },
    importMetaEnv: {
      clientId: null,
      clientSecret: null,
      accessToken: null
    }
  });

  useEffect(() => {
    // Check both process.env and import.meta.env
    setEnvStatus({
      processEnv: {
        clientId: process.env.VITE_EVIA_SIGN_CLIENT_ID ? '✅ Set' : '❌ Not set',
        clientSecret: process.env.VITE_EVIA_SIGN_CLIENT_SECRET ? '✅ Set' : '❌ Not set',
        accessToken: process.env.VITE_EVIA_ACCESS_TOKEN ? '✅ Set' : '❌ Not set'
      },
      importMetaEnv: {
        clientId: import.meta.env.VITE_EVIA_SIGN_CLIENT_ID ? '✅ Set' : '❌ Not set',
        clientSecret: import.meta.env.VITE_EVIA_SIGN_CLIENT_SECRET ? '✅ Set' : '❌ Not set',
        accessToken: import.meta.env.VITE_EVIA_ACCESS_TOKEN ? '✅ Set' : '❌ Not set'
      }
    });
  }, []);

  return (
    <div className="p-4 bg-white rounded-lg shadow mb-6">
      <h2 className="text-lg font-semibold mb-3">Environment Variables Status</h2>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="font-medium mb-2">process.env</h3>
          <ul className="space-y-1">
            <li>VITE_EVIA_SIGN_CLIENT_ID: {envStatus.processEnv.clientId}</li>
            <li>VITE_EVIA_SIGN_CLIENT_SECRET: {envStatus.processEnv.clientSecret}</li>
            <li>VITE_EVIA_ACCESS_TOKEN: {envStatus.processEnv.accessToken}</li>
          </ul>
        </div>
        
        <div>
          <h3 className="font-medium mb-2">import.meta.env</h3>
          <ul className="space-y-1">
            <li>VITE_EVIA_SIGN_CLIENT_ID: {envStatus.importMetaEnv.clientId}</li>
            <li>VITE_EVIA_SIGN_CLIENT_SECRET: {envStatus.importMetaEnv.clientSecret}</li>
            <li>VITE_EVIA_ACCESS_TOKEN: {envStatus.importMetaEnv.accessToken}</li>
          </ul>
        </div>
      </div>
      
      <div className="mt-4 text-sm bg-gray-50 p-3 rounded">
        <p>This component helps diagnose environment variable issues. Both process.env and import.meta.env should show variables as set.</p>
        <p className="mt-1"><strong>Note:</strong> React applications typically access environment variables through different methods depending on the build system.</p>
      </div>
    </div>
  );
};

export default EnvVarStatus; 