import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <div className="bg-white shadow-md rounded-lg p-8 max-w-md">
        <h1 className="text-4xl font-bold text-red-600 mb-4">404</h1>
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Page Not Found</h2>
        <p className="text-gray-600 mb-8">
          The page you are looking for doesn't exist or has been moved.
        </p>
        <div className="space-y-4">
          <Link 
            to="/"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Go to Dashboard
          </Link>
          <div>
            <button 
              onClick={() => window.history.back()}
              className="text-blue-600 hover:text-blue-800 hover:underline"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound; 