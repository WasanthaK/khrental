window._env_ = {
  VITE_SUPABASE_URL: 'https://vcorwfilylgtvzktszvi.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjb3J3ZmlseWxndHZ6a3RzenZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE1NzIyODUsImV4cCI6MjA1NzE0ODI4NX0.SS7Z6iXHn4QoZsGK37xkQTWq_aqpGA3kT8VXpxgdblc',
  VITE_EVIA_SIGN_CLIENT_ID: '',
  VITE_EVIA_SIGN_CLIENT_SECRET: '',
  VITE_API_ENDPOINT: 'https://khrental.azurewebsites.net/api'
};

// Debug function to verify environment variables are loaded correctly
(function() {
  console.log("Environment Variables Loaded:", {
    VITE_SUPABASE_URL: window._env_.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: window._env_.VITE_SUPABASE_ANON_KEY ? "Present (hidden for security)" : "Missing",
    VITE_EVIA_SIGN_CLIENT_ID: window._env_.VITE_EVIA_SIGN_CLIENT_ID ? "Present" : "Missing",
    VITE_EVIA_SIGN_CLIENT_SECRET: window._env_.VITE_EVIA_SIGN_CLIENT_SECRET ? "Present" : "Missing"
  });
  
  // Log the fixed URL configuration for debugging
  console.log("Fixed URL environment variables:", {
    VITE_SUPABASE_URL: window._env_.VITE_SUPABASE_URL,
    VITE_API_ENDPOINT: window._env_.VITE_API_ENDPOINT
  });
})(); 