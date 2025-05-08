import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Log environment variables only once during development
let hasLoggedEnv = false;

export default defineConfig(({ command, mode }) => {
  // Load environment variables from .env file
  const env = loadEnv(mode, process.cwd(), '');

  // Check if environment variables are set
  const EVIA_CLIENT_ID_SET = !!env.VITE_EVIA_SIGN_CLIENT_ID;
  const EVIA_CLIENT_SECRET_SET = !!env.VITE_EVIA_SIGN_CLIENT_SECRET;
  const EVIA_ACCESS_TOKEN_SET = !!env.VITE_EVIA_ACCESS_TOKEN;

  // Only log in development and only once per session
  if (mode === 'development' && !hasLoggedEnv) {
    console.log('Environment variables loaded in Vite config:', {
      EVIA_CLIENT_ID_SET,
      EVIA_CLIENT_SECRET_SET,
      EVIA_ACCESS_TOKEN_SET
    });
    hasLoggedEnv = true;
  }

  return {
    plugins: [
      react({
        // Add better HMR options
        fastRefresh: true,
        jsxRuntime: 'automatic',
      }),
    ],
    // Multi-page app configuration
    build: {
      outDir: 'dist',
      sourcemap: false,
      // Optimize for production
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
      cssCodeSplit: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          diagnostics: path.resolve(__dirname, 'diagnostics.html'),
          simple: path.resolve(__dirname, 'simple.html'),
          simplemain: path.resolve(__dirname, 'index.simple.html'),
        },
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            router: ['react-router-dom'],
          },
        },
      },
    },
    define: {
      // Make environment variables available to the app
      'process.env.VITE_EVIA_SIGN_CLIENT_ID': JSON.stringify(env.VITE_EVIA_SIGN_CLIENT_ID),
      'process.env.VITE_EVIA_SIGN_CLIENT_SECRET': JSON.stringify(env.VITE_EVIA_SIGN_CLIENT_SECRET),
      'process.env.VITE_EVIA_ACCESS_TOKEN': JSON.stringify(env.VITE_EVIA_ACCESS_TOKEN),
      'import.meta.env.VITE_EVIA_SIGN_CLIENT_ID': JSON.stringify(env.VITE_EVIA_SIGN_CLIENT_ID),
      'import.meta.env.VITE_EVIA_SIGN_CLIENT_SECRET': JSON.stringify(env.VITE_EVIA_SIGN_CLIENT_SECRET),
      'import.meta.env.VITE_EVIA_ACCESS_TOKEN': JSON.stringify(env.VITE_EVIA_ACCESS_TOKEN),
      // Add Supabase environment variables
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', 'prop-types'],
      // Force include problem modules
      force: true,
      // Exclude problematic dynamic imports
      exclude: []
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'prop-types': path.resolve(__dirname, 'node_modules/prop-types'),
      },
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json']
    },
    server: {
      // Improve development server
      port: 5173,
      host: true, // Listen on all addresses
      hmr: {
        protocol: 'ws',
        host: 'localhost',
        port: 5173,
        clientPort: 5173
      },
      open: false,
      // Add middleware to handle direct source file requests
      middlewares: [
        (req, res, next) => {
          // Special handler for diagnostics path
          if (req.url === '/diagnostics') {
            res.writeHead(302, { 'Location': '/diagnostics.html' });
            res.end();
            return;
          }
          
          // Support direct access to diagnostics.html
          if (req.url === '/diagnostics.html') {
            console.log('Diagnostics page requested');
          }
          
          // Do not block needed assets
          if (req.url.startsWith('/src/') && req.url.match(/\.(js|jsx|ts|tsx|css|json)$/)) {
            console.log(`Serving source file: ${req.url}`);
            next();
            return;
          }
          
          // Redirect direct requests to source files back to root
          if (req.url.startsWith('/src/')) {
            console.warn(`Blocked direct access to source file: ${req.url}`);
            console.warn(`Request details: method=${req.method}, headers=${JSON.stringify(req.headers)}`);
            console.warn(`Referrer: ${req.headers.referer || 'unknown'}`);
            
            // Send detailed error response instead of redirect
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head><title>Source Access Blocked</title></head>
                <body>
                  <h1>Source File Access Blocked</h1>
                  <p>Direct access to source files is not allowed.</p>
                  <p>Requested: ${req.url}</p>
                  <p>Please use the application routes instead.</p>
                  <p><a href="/">Go to Application</a></p>
                  <script>
                    console.error('Source file access blocked: ${req.url}');
                    console.trace('Source file access stack trace');
                  </script>
                </body>
              </html>
            `);
            return;
          }
          next();
        }
      ]
    },
  };
}); 