import React from 'react';
import { RouterProvider } from 'react-router-dom';
import router from '../routes';

/**
 * Router component that handles loading the routes configuration
 * This component is used to break the circular dependency between App.jsx and routes.jsx
 */
function Router() {
  return <RouterProvider router={router} />;
}

export default Router; 