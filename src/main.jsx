import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import 'bootstrap/dist/css/bootstrap.min.css';

// Simple error boundary for the root component
// This prevents the entire app from crashing if a component fails
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Root error boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h1>
          <p className="mb-4">The application encountered an error. Please try refreshing the page.</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Disable React.StrictMode in development to prevent double renders which can trigger HMR issues
const AppWithErrorHandling = import.meta.env.DEV ? 
  <ErrorBoundary><App /></ErrorBoundary> : 
  <React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>;

ReactDOM.createRoot(document.getElementById('root')).render(AppWithErrorHandling);
