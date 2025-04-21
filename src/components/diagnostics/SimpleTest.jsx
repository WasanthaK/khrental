import React, { useEffect } from 'react';

const SimpleTest = ({ title = 'Simple Test Component' }) => {
  useEffect(() => {
    console.log('[SimpleTest] Component loaded');
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl mb-4">{title}</h1>
      <p>If you can see this, the route is working correctly.</p>
      <p className="mt-4">This is a temporary replacement while we resolve issues with the diagnostic components.</p>
    </div>
  );
};

export default SimpleTest; 