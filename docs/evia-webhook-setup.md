import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import App from './App.jsx'
import './index.css'
import 'react-toastify/dist/ReactToastify.css'

// Import webhook handler
import { handleSignatureWebhook } from './services/eviaSignService.js'

// Create the router
const router = createBrowserRouter([
  {
    path: "*",
    element: <App />,
  },
  // Add a route for the webhook that doesn't render any UI
  {
    path: "api/evia-webhook",
    loader: async ({ request }) => {
      if (request.method === 'POST') {
        try {
          const payload = await request.json();
          await handleSignatureWebhook(payload);
          return { success: true, message: 'Webhook processed' };
        } catch (error) {
          console.error('Webhook processing error:', error);
          return { error: error.message || 'Failed to process webhook' };
        }
      }
      return { error: 'Method not allowed' };
    },
  }
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <ToastContainer />
  </React.StrictMode>,
) 